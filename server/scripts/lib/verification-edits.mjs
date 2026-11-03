import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { AugmentationCatalogError, parseAugmentations, validateAugmentations } from './augmentation-catalog.mjs';
import { parseManifest, parseProperties } from './catalog-source.mjs';
import { sha256, validateVerificationDocument } from './verification-contracts.mjs';
import { appendDisproofs, matchDisproofs, validateDisproofIndex } from './verification-disproofs.mjs';
import { assertVerificationClaimCatalog } from './verification-catalog-claims.mjs';
import { evaluateVerificationEvidence } from './verification-evidence.mjs';
import { VerificationEditError } from './verification-errors.mjs';
export { VerificationEditError } from './verification-errors.mjs';

const SOURCE_PATHS = [
  'catalogs/control-augmentations.yml', 'catalogs/control-manifest.yml',
  'catalogs/control-properties.yml', 'disproofs.index.json', 'disproofs.md',
];
const DOCUMENT_PATHS = ['troubleshooting.md', 'powerfx-reference.md'];
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
const boundary = message => { throw new VerificationEditError('path-boundary', message); };

function textFile(bytes) {
  try { return utf8.decode(bytes); }
  catch { throw new VerificationEditError('unsupported-shape', 'Verification sources must be valid UTF-8 text.'); }
}

function compatible(actual, expected, label) {
  if (!isDeepStrictEqual(actual, expected)) {
    throw new VerificationEditError('source-drift', `Selected ${label} differs from the analyzer artifact; rebuild a matching artifact before verification.`);
  }
}

function parseSourceContext(files, catalog) {
  const sourceText = path => textFile(files.get(path).bytes);
  const manifest = parseManifest(sourceText('catalogs/control-manifest.yml'));
  const properties = parseProperties(sourceText('catalogs/control-properties.yml'));
  let augmentations;
  try {
    ({ catalog: augmentations } = validateAugmentations(
      parseAugmentations(sourceText('catalogs/control-augmentations.yml')),
      { manifestControls: manifest.controls },
    ));
  } catch (error) {
    if (error instanceof AugmentationCatalogError) {
      throw new VerificationEditError('unsupported-shape', error.message);
    }
    throw error;
  }
  compatible(manifest.counts.controls_in_this_file, manifest.controls.length, 'manifest control count');
  compatible(catalog.augmentationSchemaVersion, augmentations.schemaVersion, 'augmentation schema');
  compatible(catalog.catalogVersion, manifest.extractedAt, 'catalog version');
  compatible(catalog.extractedAt, manifest.extractedAt, 'extraction date');
  compatible(catalog.augmentations, augmentations.controls, 'augmentation metadata');
  compatible(catalog.dumpSourcedControls, augmentations.dumpSourced, 'dump-sourced metadata');
  compatible(catalog.syntheticControls, augmentations.synthetic, 'synthetic metadata');
  compatible(catalog.versionKnowledge, augmentations.versionKnowledge, 'version knowledge');
  compatible(catalog.enums, properties.enums, 'enum definitions');
  compatible(catalog.parentContextProperties, properties.parentContext, 'parent-context definitions');
  const addedNames = new Set([...Object.keys(augmentations.dumpSourced), ...Object.keys(augmentations.synthetic)]);
  compatible(catalog.controls.filter(control => !addedNames.has(control.type)), manifest.controls, 'extractor control entries');
  compatible(Object.fromEntries(Object.entries(catalog.controlProperties).filter(([name]) => !addedNames.has(name))), properties.controls, 'extractor property entries');
  compatible(catalog.controls.map(control => control.type).sort(), [...manifest.controls.map(control => control.type), ...addedNames].sort(), 'complete control names');
  compatible(Object.keys(catalog.controlProperties).sort(), [...Object.keys(properties.controls), ...addedNames].sort(), 'complete property control names');
  compatible(catalog.dumpSourced, Object.keys(augmentations.dumpSourced), 'dump-sourced control names');
  let index;
  try { index = JSON.parse(sourceText('disproofs.index.json')); }
  catch { throw new VerificationEditError('unsupported-shape', 'The companion disproof index must be complete JSON.'); }
  const disproofIndex = validateDisproofIndex(sourceText('disproofs.md'), index);
  return { augmentations, disproofIndex };
}

export async function readVerificationSources({ rulesRoot, analyzerArtifactPath, documents = [] }) {
  if (typeof rulesRoot !== 'string' || !rulesRoot.trim()
    || typeof analyzerArtifactPath !== 'string' || !analyzerArtifactPath.trim()
    || /[\u0000\r\n]/u.test(rulesRoot + analyzerArtifactPath)
    || /:\/\//u.test(rulesRoot + analyzerArtifactPath)) boundary('Explicit local rules and analyzer paths are required.');
  if (!Array.isArray(documents) || documents.some(path => !DOCUMENT_PATHS.includes(path))
    || new Set(documents).size !== documents.length) boundary('Only the two supported observation documents can be selected.');
  if (!(await inspectPath(rulesRoot)).isDirectory()) boundary('The selected rules root must be a directory.');
  const canonicalRoot = await realpath(resolve(rulesRoot));
  if (!(await inspectPath(analyzerArtifactPath)).isFile()) boundary('The selected analyzer artifact must be a regular local file.');
  const canonicalArtifact = await realpath(resolve(analyzerArtifactPath));
  const artifactBytes = await readFile(canonicalArtifact);
  const analyzerArtifactSha256 = sha256(artifactBytes);
  const artifact = await import(`${pathToFileURL(canonicalArtifact).href}?appforge_sha256=${analyzerArtifactSha256}`);
  if (typeof artifact.loadCatalog !== 'function') {
    throw new VerificationEditError('unsupported-shape', 'The selected artifact does not expose the analyzer catalog.');
  }
  compatible(sha256(await readFile(canonicalArtifact)), analyzerArtifactSha256, 'analyzer artifact bytes');
  const catalog = structuredClone(artifact.loadCatalog());
  const files = new Map();
  for (const path of [...SOURCE_PATHS, ...documents].sort()) {
    const target = join(canonicalRoot, path);
    if (!(await inspectPath(target)).isFile()) boundary('Every selected rules source must be a regular file.');
    const bytes = await readFile(target);
    textFile(bytes);
    files.set(path, Object.freeze({ bytes, sha256: sha256(bytes) }));
  }
  return Object.freeze({
    rulesRoot: canonicalRoot, analyzerArtifactPath: canonicalArtifact,
    analyzerArtifactSha256, catalog, ...parseSourceContext(files, catalog), files,
  });
}

function relativePath(value) {
  if (typeof value !== 'string' || !value.length || isAbsolute(value)
    || /[\\:\u0000-\u001f]/u.test(value)) boundary('Package paths must be portable relative file paths.');
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || /[ .]$/u.test(part)
    || /[<>"|?*]/u.test(part) || part.startsWith('.')
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part))) {
    boundary('Package paths must not traverse directories or use reserved names.');
  }
  return parts;
}

async function inspectPath(path, allowMissingLast = false) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const parts = relative(root, absolute).split(sep).filter(Boolean);
  let cursor = root;
  for (let i = 0; i < parts.length; i++) {
    cursor = join(cursor, parts[i]);
    let stat;
    try { stat = await lstat(cursor); }
    catch (error) {
      if (allowMissingLast && i === parts.length - 1 && error.code === 'ENOENT') return null;
      boundary('The selected path must have an existing, inspectable parent.');
    }
    if (stat.isSymbolicLink()) boundary('Selected paths must not traverse symbolic links, junctions, or reparse points.');
    if (i < parts.length - 1 && !stat.isDirectory()) boundary('A selected path ancestor is not a directory.');
    if (i === parts.length - 1) return stat;
  }
  return lstat(root);
}

function planDocument(value) {
  try { return validateVerificationDocument(value, 'verification-edits/1'); }
  catch (error) { throw new VerificationEditError('invalid-plan', error.message); }
}

function linesWithOffsets(text) {
  const lines = [];
  let offset = 0;
  for (const raw of text.match(/[^\n]*(?:\n|$)/gu) ?? []) {
    if (!raw.length) continue;
    lines.push({ text: raw.replace(/\r?\n$/u, ''), start: offset, end: offset + raw.length });
    offset += raw.length;
  }
  return lines;
}

function uniqueHeaders(lines, start, end, indentation) {
  const headers = new Map();
  const prefix = ' '.repeat(indentation);
  const candidate = new RegExp(`^${prefix}\\S`, 'u');
  const canonical = new RegExp(`^${prefix}([A-Za-z_][A-Za-z0-9_/]*):`, 'u');
  for (let i = start; i < end; i++) {
    const line = lines[i].text;
    if (line.trimStart().startsWith('#') || !candidate.test(line)) continue;
    const match = canonical.exec(line);
    if (!match) throw new VerificationEditError('unsupported-shape', 'The selected catalog block contains a noncanonical key.');
    if (headers.has(match[1])) throw new VerificationEditError('ambiguous-target', 'The selected catalog block repeats a structural key.');
    headers.set(match[1], i);
  }
  return headers;
}

function blockEnd(lines, start, end, indentation) {
  for (let i = start + 1; i < end; i++) {
    const value = lines[i].text;
    if (!value.trim() || value.trimStart().startsWith('#')) continue;
    if ((value.match(/^ */u)?.[0].length ?? 0) <= indentation) return i;
  }
  return end;
}

function propertyLocation(text, control, property) {
  const lines = linesWithOffsets(text);
  const top = uniqueHeaders(lines, 0, lines.length, 0);
  const augmentationStart = top.get('augmentations');
  if (augmentationStart === undefined || lines[augmentationStart].text.trim() !== 'augmentations:') {
    throw new VerificationEditError('unsupported-shape', 'A unique canonical augmentations block is required.');
  }
  const augmentationEnd = blockEnd(lines, augmentationStart, lines.length, 0);
  const controls = uniqueHeaders(lines, augmentationStart + 1, augmentationEnd, 2);
  const controlStart = controls.get(control);
  if (controlStart === undefined) return null;
  if (lines[controlStart].text.trim() !== `${control}:`) throw new VerificationEditError('unsupported-shape', 'The selected control block must be canonical.');
  const controlEnd = blockEnd(lines, controlStart, augmentationEnd, 2);
  const sections = uniqueHeaders(lines, controlStart + 1, controlEnd, 4);
  const sectionStart = sections.get('additional_input_properties');
  if (sectionStart === undefined) return null;
  if (lines[sectionStart].text.trim() !== 'additional_input_properties:') throw new VerificationEditError('unsupported-shape', 'Only an existing canonical additional-property block is writable.');
  const sectionEnd = blockEnd(lines, sectionStart, controlEnd, 4);
  const entries = new Map();
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    const line = lines[i].text;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = /^      ([A-Za-z_][A-Za-z0-9_]*):([ \t]*)(.*)$/u.exec(line);
    if (!match) throw new VerificationEditError('unsupported-shape', 'Only one-line canonical additional-property records are writable.');
    if (entries.has(match[1])) throw new VerificationEditError('ambiguous-target', 'An additional-property name occurs more than once.');
    entries.set(match[1], { ...lines[i], index: i, value: match[3], prefix: `      ${match[1]}:${match[2]}` });
  }
  return { lines, entry: entries.get(property) ?? null, sectionStart, sectionEnd, entries };
}

function stampedRecord(value, type, date) {
  const stamps = new Map([['verified', 'true'], ['verified_at', date], ['verified_by', 'compile_canvas']]);
  if (!value.trim().startsWith('{')) {
    if (value.trim() !== type || !/^[A-Za-z][A-Za-z0-9_./:@-]*$/u.test(type)) {
      throw new VerificationEditError('unsupported-shape', 'The shorthand property type is not a supported writable scalar.');
    }
    return `{ type: ${type}, verified: true, verified_at: ${date}, verified_by: compile_canvas }`;
  }
  const outer = /^(\{)([^{}]*)(\}[ \t]*)$/u.exec(value);
  if (!outer) throw new VerificationEditError('unsupported-shape', 'The inline property record has unsupported scalar boundaries.');
  const chunks = [];
  let start = 0;
  let quote = null;
  const inner = outer[2];
  for (let i = 0; i < inner.length; i++) {
    const character = inner[i];
    if (quote) {
      if (character === quote && inner[i + 1] === quote) i++;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '#') throw new VerificationEditError('unsupported-shape', 'Inline comment ownership is ambiguous.');
    else if (character === ',') { chunks.push(inner.slice(start, i)); start = i + 1; }
  }
  if (quote) throw new VerificationEditError('unsupported-shape', 'The inline property record has an incomplete quoted scalar.');
  chunks.push(inner.slice(start));
  const seen = new Set();
  const updated = chunks.map(chunk => {
    const match = /^([ \t]*([a-z_]+):[ \t]*)(.*?)([ \t]*)$/u.exec(chunk);
    if (!match) throw new VerificationEditError('unsupported-shape', 'The inline property record contains a malformed field.');
    if (seen.has(match[2])) throw new VerificationEditError('ambiguous-target', 'The inline property record repeats a field.');
    seen.add(match[2]);
    if (!stamps.has(match[2])) return chunk;
    const result = match[1] + stamps.get(match[2]) + match[4];
    stamps.delete(match[2]);
    return result;
  });
  for (const [key, stamped] of stamps) updated.push(` ${key}: ${stamped}`);
  return '{' + updated.join(',') + outer[3];
}

function observationValue(value) {
  return String(value).replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/\r\n|\r|\n/gu, '<br>').replace(/[\\`*_[\]#|]/gu, character => `&#${character.codePointAt(0)};`);
}

function appendObservation(text, request, date) {
  const heading = '## Verification observations';
  const lines = linesWithOffsets(text);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  let fence = null;
  const headings = [];
  const sections = [];
  const observationEntries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].text;
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/u.test(line)) fence = null;
      continue;
    }
    if (/^#{1,6}[ \t]+Verification observations\b/u.test(line)) {
      if (fence || line !== heading) throw new VerificationEditError('unsupported-shape', 'The observation heading has an unsupported boundary.');
      headings.push(i);
    }
    if (!fence) {
      if (/^ {0,3}#{1,2}[ \t]+/u.test(line)) sections.push(i);
      const entry = /^### Observation ([a-z0-9][a-z0-9-]{0,79})$/u.exec(line);
      if (entry) observationEntries.push({ id: entry[1], start: lines[i].start });
    }
  }
  if (fence) throw new VerificationEditError('unsupported-shape', 'An unclosed fence prevents safe observation insertion.');
  if (headings.length > 1) throw new VerificationEditError('ambiguous-target', 'The observation heading occurs more than once.');
  const { claim, result } = request;
  const evidence = result.evidence;
  const environment = evidence.environment
    ? [evidence.environment.product, evidence.environment.version, evidence.environment.tenant_alias].map(observationValue).join('; ')
    : 'Not supplied for this evidence class.';
  const record = [
    `### Observation ${request.action.observation_id}`, '',
    `Date: ${date}`, `Claim: ${observationValue(claim.claim_text)}`, `Claim ref: ${observationValue(claim.claim_ref)}`,
    `Scope: ${claim.claim_scope}`, `Evidence class: ${evidence.evidence_class}`, `Environment: ${environment}`,
    `Reproduction: ${observationValue(evidence.reproduction)}`, `Falsifier: ${observationValue(claim.falsifier.description)}`,
    `Unfalsified if: ${observationValue(claim.falsifier.unfalsified_if)}`, `Falsified if: ${observationValue(claim.falsifier.falsified_if)}`,
    `Result: ${result.outcome}; ${evidence.falsifier_result}; ${observationValue(evidence.falsifier_observation)}`,
    `Reason: ${observationValue(result.reason)}`,
    `Evidence references: ${evidence.files.map(file => `${observationValue(file.id)} sha256:${file.sha256}`).join('; ') || 'None.'}`, '', '',
  ].join(newline);
  if (!headings.length) {
    const gap = text.length ? (text.endsWith('\n') ? newline : newline + newline) : '';
    return text + gap + heading + newline + newline + record;
  }
  const start = lines[headings[0]].end;
  const nextSection = sections.find(index => index > headings[0]);
  const end = nextSection === undefined ? text.length : lines[nextSection].start;
  const entries = observationEntries.filter(entry => entry.start >= start && entry.start < end);
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    throw new VerificationEditError('ambiguous-target', 'An observation ID occurs more than once.');
  }
  const same = entries.findIndex(entry => entry.id === request.action.observation_id);
  if (same >= 0) {
    const prior = text.slice(entries[same].start, entries[same + 1]?.start ?? end);
    if (prior === record) return text;
    throw new VerificationEditError('ambiguous-target', 'An observation ID already records different text or evidence.');
  }
  const gap = end === start ? newline : text.slice(0, end).endsWith(newline + newline) ? '' : text.slice(0, end).endsWith(newline) ? newline : newline + newline;
  return text.slice(0, end) + gap + record + text.slice(end);
}

async function constructVerificationPlan({ sources, requests, producedBy, date, evidenceBaseDir, reproBaseDir, maintainer, acknowledgeMaintainerEvidence }) {
  const decisions = requests.map(request => ({ id: request.id, claim_ref: request.claim.claim_ref, status: 'pending', reason: 'Evidence evaluation is pending.' }));
  const plan = {
    schema: 'verification-edits/1', date, rules_root: sources.rulesRoot,
    analyzer_artifact: { path: sources.analyzerArtifactPath, sha256: sources.analyzerArtifactSha256 },
    produced_by: producedBy, evidence_base_dir: resolve(evidenceBaseDir), repro_base_dir: resolve(reproBaseDir),
    requests, decisions, guards: [...sources.files].map(([path, file]) => ({ path, sha256: file.sha256 })), files: [],
  };
  planDocument(plan);
  const path = 'catalogs/control-augmentations.yml';
  let proposedText = textFile(sources.files.get(path).bytes);
  const disproofAdditions = [];
  const candidates = new Map();
  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];
    const decision = decisions[i];
    assertVerificationClaimCatalog({ claim: request.claim, catalog: sources.catalog });
    const evaluated = await evaluateVerificationEvidence({
      claim: request.claim, result: request.result, producedBy, date, evidenceBaseDir, reproBaseDir,
      maintainer, acknowledgeMaintainerEvidence, analyzerArtifactPath: sources.analyzerArtifactPath,
      analyzerArtifactSha256: sources.analyzerArtifactSha256,
    });
    if (matchDisproofs(sources.disproofIndex, request.claim.claim_ref).length) {
      Object.assign(decision, { status: 'blocked', reason: 'An existing scoped disproof requires the maintainer to review the conflicting evidence explicitly.' });
      continue;
    }
    if (evaluated.status !== 'eligible') {
      Object.assign(decision, { status: evaluated.status === 'compiler-subclaim-only' ? 'pending' : evaluated.status, reason: evaluated.reason });
      continue;
    }
    if (evaluated.permission === 'dismiss') {
      Object.assign(decision, { status: 'dismissed', reason: evaluated.reason });
      continue;
    }
    if (request.action.kind === 'observation' && evaluated.permission === 'append-observation') {
      const document = request.claim.target.document;
      if (!sources.files.has(document)) boundary('The observation document must be explicitly pinned in the selected sources.');
      const prior = candidates.get(document) ?? sources.files.get(document).bytes;
      candidates.set(document, Buffer.from(appendObservation(textFile(prior), request, date), 'utf8'));
      Object.assign(decision, { status: 'eligible', reason: evaluated.reason });
      continue;
    }
    const removing = request.action.kind === 'property' && request.action.operation === 'remove';
    if (request.action.kind !== 'property'
      || evaluated.permission !== (removing ? 'remove-property' : 'promote-property')) {
      throw new VerificationEditError('unsupported-shape', 'This requested edit operation is not implemented.');
    }
    const target = request.claim.target;
    const location = propertyLocation(proposedText, target.control, target.property);
    if (!location || (removing && !location.entry)) {
      Object.assign(decision, { status: 'review-required', reason: 'The selected edit requires an existing unique additional-property block, and removal requires an existing record.' });
      continue;
    }
    const beforeParsed = parseAugmentations(proposedText);
    const existing = beforeParsed.controls[target.control].additional_input_properties[target.property];
    if (location.entry && !existing) {
      throw new VerificationEditError('unsupported-shape', 'The located property record is not a supported parsed catalog scalar.');
    }
    if (existing && existing.type !== target.property_type) throw new VerificationEditError('evidence-mismatch', 'The reviewed property type differs from its current augmentation.');
    let afterText;
    const expected = structuredClone(beforeParsed);
    if (removing) {
      // Validate the same bounded scalar span before deleting it. Preserve every
      // standalone comment; reject a directly attached comment whose ownership
      // would become unclear after removal.
      stampedRecord(location.entry.value, existing.type, date);
      if ([-1, 1].some(offset => /^ {6,}#/u.test(location.lines[location.entry.index + offset]?.text ?? ''))) {
        throw new VerificationEditError('unsupported-shape', 'A directly attached property comment needs explicit review before removal.');
      }
      afterText = proposedText.slice(0, location.entry.start) + proposedText.slice(location.entry.end);
      delete expected.controls[target.control].additional_input_properties[target.property];
      disproofAdditions.push({ id: request.id, claim_ref: request.claim.claim_ref, claim_text: request.claim.claim_text, date,
        evidence_class: request.result.evidence.evidence_class,
        evidence_summary: `invocation ${request.result.evidence.compiler.invocation_ref}; ${request.result.evidence.files.map(file => `${file.id} sha256:${file.sha256}`).join('; ')}`,
        reason: request.result.reason });
    } else if (location.entry) {
      const replacement = location.entry.prefix + stampedRecord(location.entry.value, existing.type, date);
      afterText = proposedText.slice(0, location.entry.start) + replacement + proposedText.slice(location.entry.start + location.entry.text.length);
      Object.assign(expected.controls[target.control].additional_input_properties[target.property], { verified: true, verified_at: date, verified_by: 'compile_canvas' });
    } else {
      const lastEntry = [...location.entries.values()].at(-1) ?? location.lines[location.sectionStart];
      const lastIndex = lastEntry.index ?? location.sectionStart;
      if (/^ {6,}#/u.test(location.lines[lastIndex + 1]?.text ?? '')) {
        throw new VerificationEditError('unsupported-shape', 'An adjacent property comment needs explicit review before insertion.');
      }
      const offset = lastEntry.end;
      const newline = proposedText.includes('\r\n') ? '\r\n' : '\n';
      const gap = proposedText.slice(0, offset).endsWith('\n') ? '' : newline;
      const record = `      ${target.property}: ${stampedRecord(target.property_type, target.property_type, date)}`;
      afterText = proposedText.slice(0, offset) + gap + record + newline + proposedText.slice(offset);
      expected.controls[target.control].additional_input_properties[target.property] = {
        type: target.property_type, verified: true, verified_at: date, verified_by: 'compile_canvas',
        claim_scope: null, environment: null, reproduction: null, falsifier: null,
      };
    }
    if (!isDeepStrictEqual(parseAugmentations(afterText), expected)) {
      throw new VerificationEditError('unsupported-shape', 'The candidate property change does not preserve the exact expected catalog semantics.');
    }
    proposedText = afterText;
    Object.assign(decision, { status: 'eligible', reason: evaluated.reason });
  }
  try {
    validateAugmentations(parseAugmentations(proposedText), { manifestControls: parseManifest(textFile(sources.files.get('catalogs/control-manifest.yml').bytes)).controls });
  } catch (error) {
    if (error instanceof AugmentationCatalogError) throw new VerificationEditError('unsupported-shape', error.message);
    throw error;
  }
  candidates.set(path, Buffer.from(proposedText, 'utf8'));
  if (disproofAdditions.length) {
    const appended = appendDisproofs(textFile(sources.files.get('disproofs.md').bytes), sources.disproofIndex, disproofAdditions);
    candidates.set('disproofs.md', Buffer.from(appended.registerText, 'utf8'));
    candidates.set('disproofs.index.json', Buffer.from(JSON.stringify(appended.index, null, 2) + '\n', 'utf8'));
  }
  for (const [candidatePath, after] of [...candidates].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const before = sources.files.get(candidatePath).bytes;
    if (before.equals(after)) continue;
    plan.files.push({ path: candidatePath, before_sha256: sha256(before), after_sha256: sha256(after), before_base64: before.toString('base64'), after_base64: after.toString('base64') });
    plan.guards = plan.guards.filter(guard => guard.path !== candidatePath);
  }
  planDocument(plan);
  return { plan, decisions };
}

export async function planVerificationEdits(options) {
  const { sources } = options;
  const requests = structuredClone(options.requests);
  const current = await readVerificationSources({ rulesRoot: sources.rulesRoot, analyzerArtifactPath: sources.analyzerArtifactPath,
    documents: [...sources.files.keys()].filter(path => DOCUMENT_PATHS.includes(path)) });
  compatible(current.analyzerArtifactSha256, sources.analyzerArtifactSha256, 'pinned analyzer bytes');
  compatible([...current.files].map(([path, file]) => [path, file.sha256]), [...sources.files].map(([path, file]) => [path, file.sha256]), 'pinned source hashes');
  return constructVerificationPlan({ ...options, sources: current, requests });
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const INSTALLED_ARTIFACT = resolve(REPO_ROOT, 'cli/dist/analyzer-core.mjs');

async function currentSourceFile(root, path) {
  const target = join(root, path);
  if (!(await inspectPath(target)).isFile()) boundary('Every reviewed source target must remain a regular file.');
  const canonical = await realpath(target);
  const relation = relative(root, canonical);
  if (isAbsolute(relation) || relation === '..' || relation.startsWith(`..${sep}`)) boundary('A reviewed source escaped its selected rules root.');
  const bytes = await readFile(canonical);
  return { bytes, sha256: sha256(bytes) };
}

function validateEditedState(files) {
  try {
    validateAugmentations(parseAugmentations(textFile(files.get('catalogs/control-augmentations.yml').bytes)), {
      manifestControls: parseManifest(textFile(files.get('catalogs/control-manifest.yml').bytes)).controls,
    });
  } catch (error) {
    if (error instanceof AugmentationCatalogError) throw new VerificationEditError('unsupported-shape', error.message);
    throw error;
  }
  let index;
  try { index = JSON.parse(textFile(files.get('disproofs.index.json').bytes)); }
  catch { throw new VerificationEditError('unsupported-shape', 'The proposed companion disproof index must be complete JSON.'); }
  validateDisproofIndex(textFile(files.get('disproofs.md').bytes), index);
}

async function reviewedApplication({ plan, rulesRoot, analyzerArtifactPath = INSTALLED_ARTIFACT, maintainer, acknowledgeMaintainerEvidence }) {
  planDocument(plan);
  plan = structuredClone(plan);
  if (typeof rulesRoot !== 'string' || !rulesRoot.trim() || /[\u0000\r\n]/u.test(rulesRoot)
    || typeof analyzerArtifactPath !== 'string' || !analyzerArtifactPath.trim() || /[\u0000\r\n]/u.test(analyzerArtifactPath)) {
    boundary('Application requires explicit local rules and trusted analyzer paths.');
  }
  if (!(await inspectPath(rulesRoot)).isDirectory()) boundary('The selected rules root must remain a directory.');
  const canonicalRoot = await realpath(resolve(rulesRoot));
  compatible(pathKey(resolve(plan.rules_root)), pathKey(canonicalRoot), 'named rules root');
  if (!(await inspectPath(analyzerArtifactPath)).isFile()) boundary('The trusted analyzer artifact must be a regular local file.');
  const canonicalArtifact = await realpath(resolve(analyzerArtifactPath));
  // Never import a serialized plan path. The caller chooses the executable and
  // the plan can only pin that already selected executable's identity and bytes.
  compatible(pathKey(resolve(plan.analyzer_artifact.path)), pathKey(canonicalArtifact), 'trusted analyzer path');
  const analyzerArtifactSha256 = sha256(await readFile(canonicalArtifact));
  compatible(analyzerArtifactSha256, plan.analyzer_artifact.sha256, 'trusted analyzer bytes');
  const artifact = await import(`${pathToFileURL(canonicalArtifact).href}?appforge_sha256=${analyzerArtifactSha256}`);
  if (typeof artifact.loadCatalog !== 'function') throw new VerificationEditError('unsupported-shape', 'The trusted artifact does not expose the analyzer catalog.');
  compatible(sha256(await readFile(canonicalArtifact)), analyzerArtifactSha256, 'trusted analyzer bytes');
  const catalog = structuredClone(artifact.loadCatalog());
  const files = new Map();
  const current = new Map();
  for (const guard of plan.guards) {
    const file = await currentSourceFile(canonicalRoot, guard.path);
    compatible(file.sha256, guard.sha256, 'unchanged source guard');
    files.set(guard.path, file);
    current.set(guard.path, file);
  }
  for (const replacement of plan.files) {
    const file = await currentSourceFile(canonicalRoot, replacement.path);
    if (file.sha256 !== replacement.before_sha256 && file.sha256 !== replacement.after_sha256) {
      throw new VerificationEditError('source-drift', 'A reviewed target differs from both its before and after bytes.');
    }
    current.set(replacement.path, file);
    files.set(replacement.path, { bytes: Buffer.from(replacement.before_base64, 'base64'), sha256: replacement.before_sha256 });
  }
  const sortedFiles = new Map([...files].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
  const sources = Object.freeze({ rulesRoot: canonicalRoot, analyzerArtifactPath: canonicalArtifact,
    analyzerArtifactSha256, catalog, ...parseSourceContext(sortedFiles, catalog), files: sortedFiles });
  const reconstructed = await constructVerificationPlan({ sources, requests: plan.requests, producedBy: plan.produced_by, date: plan.date,
    evidenceBaseDir: plan.evidence_base_dir, reproBaseDir: plan.repro_base_dir, maintainer, acknowledgeMaintainerEvidence });
  if (!isDeepStrictEqual(reconstructed.plan, plan)) {
    throw new VerificationEditError('invalid-plan', 'Reviewed replacements and decisions differ from independently reconstructed permitted edits.');
  }
  const prospective = new Map(sortedFiles);
  for (const replacement of plan.files) {
    prospective.set(replacement.path, { bytes: Buffer.from(replacement.after_base64, 'base64'), sha256: replacement.after_sha256 });
  }
  validateEditedState(prospective);
  return { plan, sources, current, decisions: reconstructed.decisions };
}

async function verifyFinalState(context) {
  const files = new Map();
  for (const guard of context.plan.guards) {
    const file = await currentSourceFile(context.sources.rulesRoot, guard.path);
    compatible(file.sha256, guard.sha256, 'final unchanged source guard');
    files.set(guard.path, file);
  }
  for (const replacement of context.plan.files) {
    const file = await currentSourceFile(context.sources.rulesRoot, replacement.path);
    compatible(file.sha256, replacement.after_sha256, 'final reviewed replacement');
    files.set(replacement.path, file);
  }
  compatible(sha256(await readFile(context.sources.analyzerArtifactPath)), context.sources.analyzerArtifactSha256, 'final analyzer bytes');
  validateEditedState(files);
}

export async function applyVerificationEdits(options) {
  const context = await reviewedApplication(options);
  const applied = [];
  const alreadyApplied = [];
  let temporary = null;
  try {
    for (const replacement of context.plan.files) {
      const target = join(context.sources.rulesRoot, replacement.path);
      let current = await currentSourceFile(context.sources.rulesRoot, replacement.path);
      if (current.sha256 === replacement.after_sha256) { alreadyApplied.push(replacement.path); continue; }
      compatible(current.sha256, replacement.before_sha256, 'target immediately before replacement');
      temporary = join(dirname(target), `.appforge-verification-${randomUUID()}.tmp`);
      await writeFile(temporary, Buffer.from(replacement.after_base64, 'base64'), { flag: 'wx', mode: 0o600 });
      current = await currentSourceFile(context.sources.rulesRoot, replacement.path);
      if (current.sha256 === replacement.after_sha256) {
        await unlink(temporary);
        temporary = null;
        alreadyApplied.push(replacement.path);
        continue;
      }
      compatible(current.sha256, replacement.before_sha256, 'target immediately before atomic rename');
      await rename(temporary, target);
      temporary = null;
      applied.push(replacement.path);
    }
    await verifyFinalState(context);
  } catch {
    if (temporary) await unlink(temporary).catch(() => {});
    throw new VerificationEditError('partial-apply', 'Local application did not complete; reviewed before/after bytes support inspection and exact resume.', {
      status: 'partial', applied, already_applied: alreadyApplied,
      remaining: context.plan.files.map(file => file.path).filter(path => !applied.includes(path) && !alreadyApplied.includes(path)),
    });
  }
  return { status: 'complete', applied, already_applied: alreadyApplied, remaining: [] };
}

export async function verifyAppliedVerificationEdits(options) {
  const context = await reviewedApplication(options);
  await verifyFinalState(context);
  return { sources: context.sources, decisions: context.decisions,
    report: { status: 'complete', applied: [], already_applied: context.plan.files.map(file => file.path), remaining: [] } };
}

export async function writeVerificationPackage({ outDir, files }) {
  if (typeof outDir !== 'string' || !outDir.trim() || /[\u0000\r\n]/u.test(outDir)) boundary('A local output directory is required.');
  if (!Array.isArray(files)) boundary('Review package files must be an array.');
  const identities = new Set();
  for (const file of files) {
    if (!file || !(file.bytes instanceof Uint8Array)) boundary('Review package contents must be explicit bytes.');
    relativePath(file.path);
    const identity = pathKey(file.path);
    if (identities.has(identity)) boundary('Review package paths must be unique.');
    identities.add(identity);
  }
  for (const identity of identities) {
    const parts = identity.split('/');
    for (let i = 1; i < parts.length; i++) {
      if (identities.has(parts.slice(0, i).join('/'))) boundary('A package file cannot also be a directory.');
    }
  }
  files = files.map(file => ({ path: file.path, bytes: Buffer.from(file.bytes) }));
  const directory = resolve(outDir);
  const parentStat = await inspectPath(dirname(directory));
  if (!parentStat.isDirectory()) boundary('The review package parent must be an existing directory.');
  if (await inspectPath(directory, true)) boundary('The review package directory must not already exist.');
  try { await mkdir(directory); }
  catch { boundary('The review package directory could not be exclusively created.'); }
  const completed = [];
  try {
    const canonicalDirectory = await realpath(directory);
    for (const file of files) {
      const target = join(directory, file.path);
      let parent = directory;
      for (const part of file.path.split('/').slice(0, -1)) {
        await inspectPath(parent);
        parent = join(parent, part);
        try { await mkdir(parent); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        if (!(await inspectPath(parent)).isDirectory()) boundary('A package parent is not a directory.');
      }
      await inspectPath(dirname(target));
      const actualParent = await realpath(dirname(target));
      const relation = relative(canonicalDirectory, actualParent);
      if (isAbsolute(relation) || relation === '..' || relation.startsWith(`..${sep}`)) boundary('A package parent escaped its output directory.');
      await writeFile(target, file.bytes, { flag: 'wx', mode: 0o600 });
      completed.push(file.path);
    }
  } catch {
    throw new VerificationEditError('partial-apply', 'Review package writing failed; completed files remain for inspection.', {
      status: 'partial', applied: completed, already_applied: [],
      remaining: files.map(file => file.path).filter(path => !completed.includes(path)),
    });
  }
  return { directory, files: files.map(file => file.path) };
}
