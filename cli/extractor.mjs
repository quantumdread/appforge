#!/usr/bin/env node
/**
 * appforge catalog extractor
 *
 * Spawns the canvas-authoring MCP server, calls list_controls + describe_control
 * for every control in the live tenant, and writes:
 *   <out>/control-manifest.yml      — type/family/variants allow-list
 *   <out>/control-properties.yml    — per-control property allow-list with
 *                                     deduped enums and hoisted parent-context
 *                                     bundles
 *
 * Usage:  node extractor.mjs <output-dir>
 *
 * Env required:
 *   CANVAS_ENVIRONMENT_ID    — environment GUID from the studio URL
 *   CANVAS_APP_ID            — app GUID from the studio URL
 *   CANVAS_CLUSTER_CATEGORY  — prod | gov | high | dod | china | test
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR = resolve(process.argv[2] ?? join(REPO_ROOT, 'knowledge/catalogs'));
const { CANVAS_ENVIRONMENT_ID: ENV_ID, CANVAS_APP_ID: APP_ID,
        CANVAS_CLUSTER_CATEGORY: CLUSTER = 'prod' } = process.env;
// ─── MCP client (JSON-RPC over stdio) ────────────────────────────────────
class Mcp {
  constructor() {
    this.proc = spawn('dnx', [
      'Microsoft.PowerApps.CanvasAuthoring.McpServer',
      '--yes', '--prerelease', '--source', 'https://api.nuget.org/v3/index.json'
    ], { env: { ...process.env, CANVAS_ENVIRONMENT_ID: ENV_ID, CANVAS_APP_ID: APP_ID, CANVAS_CLUSTER_CATEGORY: CLUSTER },
         stdio: ['pipe', 'pipe', 'inherit'], shell: process.platform === 'win32' });
    this.next = 1; this.pending = new Map(); this.buf = '';
    this.proc.stdout.on('data', (c) => {
      this.buf += c.toString();
      let nl;
      while ((nl = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, nl); this.buf = this.buf.slice(nl + 1);
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          if (m.id != null) { const cb = this.pending.get(m.id); if (cb) { this.pending.delete(m.id); cb(m); } }
        } catch { /* ignore malformed lines */ }
      }
    });
  }
  req(method, params) {
    const id = this.next++;
    return new Promise((res, rej) => {
      this.pending.set(id, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result));
      this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  notify(method, params) { this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); }
  async tool(name, args = {}) {
    const r = await this.req('tools/call', { name, arguments: args });
    if (r.isError) {
      const msg = r.content?.map(c => c.text ?? '').join('') ?? 'unknown error';
      throw new Error(msg);
    }
    return r.content?.map(c => c.text ?? '').join('') ?? '';
  }
  close() { this.proc.kill(); }
}

// ─── Parser ──────────────────────────────────────────────────────────────
export function parseDescribe(text) {
  // MCP returns CRLF line endings; strip CRs so per-line regexes with `$`
  // anchors work (JS `.` doesn't match `\r`, and `$` without /m doesn't match
  // before `\r`). Without this, every `^...:$` section header silently fails.
  const lines = text.replace(/\r/g, '').split('\n');
  const c = { type: '', family: '', variants: [], baseInput: {}, variantInput: {}, parentContext: {}, output: [] };
  let section = null, warns = [], sawInput = false, defaultsSeen = 0;
  const unknownMetadataKeys = new Set();
  const metadataKeys = new Set(['Enum name', 'Enum values', 'Required', 'Default']);
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i]; let m;
    if ((m = ln.match(/^# Control (.+)$/))) { c.type = m[1].trim(); continue; }
    if ((m = ln.match(/^Part of the control family (\w+)\.$/))) { c.family = m[1]; continue; }
    // Since 2026-11 the service marks the bare-named FluentV9 generation as
    // superseded: "Do not use CheckBox unless it's already present in this app.
    // Use the updated ModernCheckbox instead ...". Such controls stay valid in
    // existing apps, so record the replacement rather than dropping them.
    if ((m = ln.match(/^Do not use (\S+) unless it's already present in this app\. Use the updated (\S+) instead\b/))) {
      c.supersededBy = m[2]; continue;
    }
    if (ln === 'The `Variant` keyword is required and must be one of the following:'
      || ln === 'The `Variant` keyword is optional and can be one of the following:') { section = 'variants'; continue; }
    if (ln === 'Input Properties:') { section = 'input'; sawInput = true; continue; }
    if ((m = ln.match(/^Additional input properties for variant `([^`]+)`:$/))) {
      const v = c.variants.find(x => m[1] === x);
      if (v) { section = `var:${v}`; c.variantInput[v] = c.variantInput[v] || {}; }
      else { warns.push(`unmapped variant section "${m[1]}" on ${c.type}`); section = null; }
      continue;
    }
    if ((m = ln.match(/^Additional input properties if a child of (.+):$/))) {
      const ctx = m[1] === 'a Grid GroupContainer' ? 'grid_layout_child'
        : m[1] === 'a Vertical or Horizontal GroupContainer' ? 'vertical_horizontal_autolayout_child' : null;
      if (!ctx) { warns.push(`unmapped parent context "${m[1]}" on ${c.type}`); section = null; continue; }
      section = `ctx:${ctx}`; c.parentContext[ctx] = c.parentContext[ctx] || {};
      continue;
    }
    if (ln === 'Output Properties:') { section = 'output'; continue; }
    // Never let an unknown heading leak properties into the preceding section.
    if (/^\S.*:$/.test(ln)) { section = null; continue; }
    if (section === 'variants' && (m = ln.match(/^- `([A-Za-z0-9_][A-Za-z0-9_]*)`$/))) { c.variants.push(m[1]); continue; }
    if ((m = ln.match(/^(\s*)-\s+(\w+):\s+(.+?)\s*$/))) {
      const indent = m[1].length, propName = m[2], propType = m[3].trim();
      const metadata = {};
      // Metadata belongs to this list item, independent of key order. Stop
      // before the next item or section; never consume a sibling as lookahead.
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (!next.trim()) { i++; continue; }
        if (/^\s*-\s/.test(next) || next.match(/^\s*/)[0].length <= indent) break;
        i++;
        const entry = next.match(/^\s+([^:]+):\s*(.*?)\s*$/);
        if (!entry) continue;
        const key = entry[1].trim();
        if (metadataKeys.has(key)) metadata[key] = entry[2];
        else unknownMetadataKeys.add(key);
      }
      if (Object.hasOwn(metadata, 'Default')) defaultsSeen++;
      if (section === 'output') { c.output.push(propName); continue; }
      let value;
      if (propType === 'Enum') {
        const en = metadata['Enum name'];
        const ev = (metadata['Enum values'] ?? '').split(',').map(s => s.trim());
        value = en ? { _enum: en, _values: ev } : 'Enum';
      } else if (/^Enum \(/.test(propType)) {
        // Inline enum form: "Enum (SetByContainer, Start, ...)" — MCP gives no
        // canonical name. Use the property name as the enum name (dropping the
        // control prefix). A post-pass dedupes by values across the catalog.
        const inner = propType.match(/^Enum \((.+)\)$/)?.[1] ?? '';
        value = { _enum: propName, _values: inner.split(',').map(s => s.trim()) };
      } else {
        value = propType;
      }
      // Retag On*: Boolean → Event
      if (propName.startsWith('On') && value === 'Boolean') value = 'Event';
      const tgt = section === 'input' ? c.baseInput
        : section?.startsWith('var:') ? c.variantInput[section.slice(4)]
        : section?.startsWith('ctx:') ? c.parentContext[section.slice(4)]
        : null;
      if (tgt) tgt[propName] = value;
    }
  }
  const error = !c.type ? 'parser produced no type — unrecognised describe_control shape'
    : sawInput && Object.keys(c.baseInput).length === 0 ? 'Input Properties: section yielded zero input properties'
    : null;
  return { c, warns, error, unknownMetadataKeys: [...unknownMetadataKeys].sort(), defaultsSeen };
}

// Counts use actual entries, never the self-reported counts block. Property
// totals count base and variant input entries; hoisted parent bundles and
// output lists are excluded on both sides of the comparison.
export function previousContent(manifest, properties) {
  const controlExamples = [...manifest.matchAll(/^  - type: (.+)$/gm)].map(m => m[1].trim());
  let inControls = false, section = null;
  const propertyExamples = [];
  for (const ln of properties.replace(/\r/g, '').split('\n')) {
    if (ln === 'controls:') { inControls = true; continue; }
    if (!inControls) continue;
    if (/^    input_properties:\s*$/.test(ln)) { section = 'base'; continue; }
    if (/^    variant_input_properties:\s*$/.test(ln)) { section = 'variant'; continue; }
    if (/^ {0,4}\S/.test(ln)) { section = null; continue; }
    if ((section === 'base' && /^      \w+: \S/.test(ln)) ||
        (section === 'variant' && /^        \w+: \S/.test(ln))) propertyExamples.push(ln.trim());
  }
  return { controls: controlExamples.length, properties: propertyExamples.length, controlExamples, propertyExamples };
}

export function checkContent(controls, enums, previous = {}) {
  const failures = [];
  const fail = (check, message, examples) => failures.push({ check, message,
    examples: [examples[0] ?? '<none available>', examples[1] ?? '<no second example>'] });
  const seen = new Set(), duplicate = [];
  for (const c of controls) {
    if (seen.has(c.type)) duplicate.push(c.type);
    seen.add(c.type);
  }
  if (duplicate.length) fail('duplicate-control-key', 'control keys must be unique', duplicate);
  const invalid = controls.filter(c => !/^[A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?$/.test(c.type));
  if (invalid.length) fail('invalid-control-key', 'expected an identifier or Family/Name', invalid.map(c => c.type));
  const empty = controls.filter(c => Object.keys(c.baseInput).length === 0);
  if (empty.length > controls.length * 0.1) fail('empty-input-properties', `${empty.length}/${controls.length} controls have zero input properties (maximum 10%)`, empty.map(c => c.type));
  if (Object.keys(enums).length < 10) fail('enum-table-size', `${Object.keys(enums).length} enums (minimum 10)`, Object.keys(enums));
  // Output declarations list types without enum metadata by design. Audit the
  // input vocabulary, including every variant and parent-context occurrence.
  let enumProperties = 0;
  const unnamedEnums = [];
  for (const c of controls) {
    const bundles = [['', c.baseInput], ...Object.entries(c.variantInput),
      ...Object.entries(c.parentContext ?? {})];
    for (const [scope, bundle] of bundles) for (const [name, value] of Object.entries(bundle)) {
      if (value === 'Enum' || (typeof value === 'string' && value.startsWith('@enum:')) || value?._enum) {
        enumProperties++;
        if (value === 'Enum') unnamedEnums.push([c.type, scope, name].filter(Boolean).join('.'));
      }
    }
  }
  if (unnamedEnums.length > enumProperties * 0.05) fail('enum-name-loss',
    `${unnamedEnums.length}/${enumProperties} Enum properties have no name (maximum 5%)`, unnamedEnums);
  const properties = controls.reduce((n, c) => n + Object.keys(c.baseInput).length +
    Object.values(c.variantInput).reduce((v, bundle) => v + Object.keys(bundle).length, 0), 0);
  if (controls.length < (previous.controls ?? 0) * 0.5) fail('control-count-collapse',
    `${controls.length} controls versus ${previous.controls} in replaced file (minimum 50%)`, previous.controlExamples ?? []);
  if (properties < (previous.properties ?? 0) * 0.5) fail('property-count-collapse',
    `${properties} input properties versus ${previous.properties} in replaced file (minimum 50%)`, previous.propertyExamples ?? []);
  return failures;
}

// ─── YAML emit helpers ────────────────────────────────────────────────────
const NEEDS_QUOTES = /[:#&*!|>'"%@`,\[\]\{\}]|^[-?]| $|^$/;
const q = (s) => NEEDS_QUOTES.test(s) || /^\s|\s$/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s;
const list = (arr) => `[${arr.map(q).join(', ')}]`;
function propBlock(obj, indent) {
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => {
      if (typeof v === 'string') return `${indent}${k}: ${v.startsWith('@enum:') ? `"${v}"` : v}`;
      return `${indent}${k}: ${v}`;
    });
}

// ─── Main ────────────────────────────────────────────────────────────────
export async function main({ mcp, outputDir = OUTPUT_DIR, environmentId = ENV_ID, appId = APP_ID } = {}) {
if (!environmentId || !appId) {
  console.error('CANVAS_ENVIRONMENT_ID and CANVAS_APP_ID must be set');
  throw new Error('missing authoring environment');
}
mcp ??= new Mcp();
try {
const NOW = new Date().toISOString();

// Initialize handshake
const initialized = await mcp.req('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'appforge-extractor', version: '1.0' } });
const serverVersion = initialized?.serverInfo?.version ?? 'unknown';
mcp.notify('notifications/initialized', {});

// CanvasAuthoringMcpServer 1.1.0.0 requires an explicit `connect` before any
// other tool: env vars alone leave the session unauthenticated and every call
// fails with "Not connected". Discovered 2026-09-09 when Route A could not run;
// this is the likeliest reason the catalog sat unrefreshed after 2026-05-10.
// The server's MSAL cache persists across restarts, so the first run may prompt
// for sign-in interactively and later runs are silent.
console.error('connecting to the authoring session...');
const connectText = await mcp.tool('connect', {
  environment_id: environmentId,
  app_id: appId,
  ...(process.env.CANVAS_LOGIN_HINT ? { login_hint: process.env.CANVAS_LOGIN_HINT } : {}),
});
console.error(connectText.split('\n').find(l => l.trim()) ?? 'connected');

// Read the catalog being replaced first: every control it holds that the list
// no longer offers is re-described below and kept while it still describes.
const oldManifest = join(outputDir, 'control-manifest.yml');
const oldProperties = join(outputDir, 'control-properties.yml');
const previous = previousContent(
  existsSync(oldManifest) ? readFileSync(oldManifest, 'utf8') : '',
  existsSync(oldProperties) ? readFileSync(oldProperties, 'utf8') : '',
);

console.error('listing controls...');
const listText = await mcp.tool('list_controls');
// The header carried a claimed count ("Available Controls: N") when this was
// written; server 1.1.0.0 emits "Power Apps Controls:" with no number, so the
// old regex matched nothing, `claimed` fell back to 0, and the guard below was
// skipped every run — a self-check that silently stopped checking. Accept either
// header, and when no count is advertised say so instead of implying a pass.
const claimed = parseInt(listText.match(/(?:Available|Power Apps) Controls:\s*(\d+)/)?.[1] ?? '0', 10);
// The list also names the open app's own canvas components under a
// "Canvas Components:" heading (seen 2026-11-11 as "- cStepBar - "). They are
// app-specific, not catalog controls, so only the section above it is read.
const controlsSection = listText.replace(/\r/g, '').split(/^Canvas Components:\s*$/m)[0];
const types = [...controlsSection.matchAll(/^\s*-\s+(\S.*)$/gm)].map(m => m[1].trim());
if (claimed && claimed !== types.length) {
  throw new Error(`pagination check failed: claimed ${claimed}, parsed ${types.length}`);
}
if (!claimed) {
  console.error(`! no claimed control count in the list_controls header — parsed ${types.length}; truncation is UNCHECKED for this run`);
}
if (!types.length) {
  throw new Error('list_controls returned no control names — refusing to write an empty catalog');
}
// Observed 2026-11-11: list_controls stopped listing 20 superseded bare-named
// FluentV9 controls (CheckBox, ComboBox, Table, ...) that describe_control still
// describes and existing apps still use. Dropping them would REFUSE valid apps,
// so previously catalogued controls are carried forward as `listed: false`.
const listedSet = new Set(types);
const carried = previous.controlExamples.filter(t => !listedSet.has(t));
console.error(`extracting ${types.length} listed controls` +
  (carried.length ? ` + ${carried.length} previously catalogued but unlisted...` : '...'));

const enums = {}, parentCtx = {}, controls = [], allWarns = [];
const unknownMetadataKeys = new Set();
let defaultsSeen = 0;
const sig = (vs) => vs.slice().sort().join('|');
const stripEnums = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => {
  if (v && typeof v === 'object' && v._enum) {
    if (!enums[v._enum]) enums[v._enum] = v._values;
    else if (sig(enums[v._enum]) !== sig(v._values)) {
      allWarns.push(`enum name collision: "${v._enum}" written with [${enums[v._enum].join(',')}] then [${v._values.join(',')}] — values diverge`);
    }
    return [k, `@enum:${v._enum}`];
  }
  return [k, v];
}));

const skipped = [], lost = [];
for (const [type, listed] of [...types.map(t => [t, true]), ...carried.map(t => [t, false])]) {
  // An unlisted control that no longer describes is not skipped quietly: it
  // was in the catalog, so losing it fails the content gate below.
  const miss = (reason, mark) => {
    (listed ? skipped : lost).push({ type, reason });
    process.stderr.write(mark);
  };
  let text;
  try {
    text = await mcp.tool('describe_control', { controlName: type });
  } catch (e) {
    miss(e.message.slice(0, 200), 'x');
    continue;
  }
  const parsed = parseDescribe(text);
  const { c, warns, error } = parsed;
  for (const key of parsed.unknownMetadataKeys) unknownMetadataKeys.add(key);
  defaultsSeen += parsed.defaultsSeen;
  if (error) {
    miss(error, '?');
    continue;
  }
  if (!listed && c.type !== type) {
    miss(`describe_control returned "${c.type}"`, '?');
    continue;
  }
  if (!listed) c.listed = false;
  allWarns.push(...warns);
  c.baseInput = stripEnums(c.baseInput);
  for (const v of Object.keys(c.variantInput)) c.variantInput[v] = stripEnums(c.variantInput[v]);
  for (const ctx of Object.keys(c.parentContext)) {
    parentCtx[ctx] = { ...parentCtx[ctx], ...stripEnums(c.parentContext[ctx]) };
  }
  controls.push(c);
  process.stderr.write('.');
}
process.stderr.write('\n');
if (unknownMetadataKeys.size) console.error(`! unrecognised property metadata keys: ${[...unknownMetadataKeys].sort().join(', ')}`);
console.error(`property defaults observed: ${defaultsSeen} (not emitted)`);

// Sanity check: enum-name collisions with divergent values. The propName-based
// synthesis dedupes inline enums naturally; MCP-named enums are kept verbatim.
// We do NOT collapse two distinct MCP-named enums that happen to share values
// (e.g. Layout and LayoutDirection both [Horizontal, Vertical]) — that
// conflates semantically different enums. Just warn if we ever see the same
// name written with different value-sets, which would indicate a real bug.
// Tracking is done at write time below; nothing to do here.

if (allWarns.length) console.error('warnings:\n  ' + allWarns.join('\n  '));
if (skipped.length) {
  console.error(`\nskipped ${skipped.length} control(s):`);
  for (const s of skipped) console.error(`  - ${s.type}: ${s.reason}`);
}

// Validate content BEFORE either output is created or replaced.
const failures = checkContent(controls, enums, previous);
if (lost.length) failures.push({ check: 'catalogued-control-lost',
  message: `${lost.length} previously catalogued control(s) are neither listed nor describable; never dropped automatically`,
  examples: [...lost.map(l => `${l.type}: ${l.reason}`), '<no second example>'].slice(0, 2) });
if (failures.length) {
  for (const f of failures) console.error(`! content gate [${f.check}]: ${f.message}\n  examples: ${f.examples.map(x => JSON.stringify(x)).join('; ')}`);
  throw new Error(`content gate refused catalog (${failures.length} failed checks); output untouched`);
}

// Emit manifest
mkdirSync(outputDir, { recursive: true });
const manifest = [
  '# control-manifest.yml — auto-generated by cli/extractor.mjs',
  `# DO NOT HAND-EDIT. Re-run the extractor instead.`,
  '',
  'schema_version: 1',
  `extracted_at: ${NOW}`,
  `server_version: ${q(String(serverVersion))}`,
  'source:',
  `  cluster_category: ${CLUSTER}`,
  '  mcp: canvas-authoring',
  'counts:',
  `  controls_total_in_tenant: ${types.length}`,
  `  controls_in_this_file: ${controls.length}`,
  `  controls_skipped: ${skipped.length}`,
  `  controls_unlisted_carried: ${controls.filter(c => c.listed === false).length}`,
  `  is_partial: ${skipped.length > 0}`,
  '',
  'controls:',
  ...controls.sort((a, b) => a.type.localeCompare(b.type))
    .map(c => `  - type: ${q(c.type)}\n    family: ${c.family}\n    version: null\n    variants: ${list(c.variants)}` +
      (c.listed === false ? '\n    listed: false' : '') +
      (c.supersededBy ? `\n    superseded_by: ${q(c.supersededBy)}` : ''))
].join('\n') + '\n';
writeFileSync(join(outputDir, 'control-manifest.yml'), manifest);

// Emit properties
const props = [
  '# control-properties.yml — auto-generated by cli/extractor.mjs',
  '# DO NOT HAND-EDIT. Re-run the extractor instead.',
  '',
  'schema_version: 1',
  `extracted_at: ${NOW}`,
  '',
  'enums:',
  ...Object.entries(enums).sort(([a], [b]) => a.localeCompare(b))
    .map(([n, vs]) => `  ${q(n)}: ${list(vs)}`),
  '',
  'parent_context_properties:',
  ...Object.entries(parentCtx).sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([ctx, bundle]) => [`  ${ctx}:`, ...propBlock(bundle, '    ')]),
  '',
  'controls:'
];
for (const c of controls.sort((a, b) => a.type.localeCompare(b.type))) {
  props.push('');
  props.push(`  ${q(c.type)}:`);
  props.push(`    family: ${c.family}`);
  props.push(`    variants: ${list(c.variants)}`);
  if (Object.keys(c.baseInput).length) {
    props.push('    input_properties:');
    props.push(...propBlock(c.baseInput, '      '));
  } else {
    props.push('    input_properties: {}');
  }
  if (Object.keys(c.variantInput).length) {
    props.push('    variant_input_properties:');
    for (const [v, p] of Object.entries(c.variantInput).sort(([a], [b]) => a.localeCompare(b))) {
      if (Object.keys(p).length === 0) props.push(`      ${v}: {}`);
      else { props.push(`      ${v}:`); props.push(...propBlock(p, '        ')); }
    }
  }
  const pc = Object.keys(c.parentContext).sort();
  if (pc.length) props.push(`    parent_context: ${list(pc)}`);
  if (c.output.length) props.push(`    output_properties: ${list(c.output)}`);
}
writeFileSync(join(outputDir, 'control-properties.yml'), props.join('\n') + '\n');

console.error(`✓ wrote ${controls.length} controls to ${outputDir}`);
if (allWarns.length) console.error(`  with ${allWarns.length} warning(s) above`);
return { controls, enums, skipped, lost, warnings: allWarns, serverVersion, defaultsSeen,
  unknownMetadataKeys: [...unknownMetadataKeys].sort() };
} finally {
  mcp.close();
}
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!ENV_ID || !APP_ID) {
    console.error('CANVAS_ENVIRONMENT_ID and CANVAS_APP_ID must be set');
    process.exitCode = 1;
  } else {
    try { await main(); }
    catch (error) { console.error(error.message); process.exitCode = 2; }
  }
}
