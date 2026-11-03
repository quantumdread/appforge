/** Side-effect-free historical augmentation parser boundary. */
export class AugmentationCatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AugmentationCatalogError';
    this.code = 'augmentation-catalog';
  }
}

export const AUGMENTATION_SCHEMA_VERSION = 7;
const AUGMENTATION_TOP_LEVEL_KEYS = new Set([
  'schema_version',
  'sourced_from',
  'last_reviewed',
  'version_knowledge',
  'augmentations',
  'dump_sourced_controls',
  'synthetic_controls',
]);
export const CLAIM_SCOPES = [
  'compiler_accepts',
  'roundtrip_preserves',
  'studio_materializes',
  'studio_renders',
  'player_behaves',
];
const CLAIM_SCOPE_SET = new Set(CLAIM_SCOPES);
const RUNTIME_EVIDENCE_FIELDS = ['claim_scope', 'environment', 'reproduction', 'falsifier'];
const EVIDENCE_FIELDS = ['verified_at', 'verified_by', ...RUNTIME_EVIDENCE_FIELDS];
const BLOCK_SCALAR_INDICATORS = new Set(['|', '|-', '>', '>-']);

const fail = (message) => { throw new AugmentationCatalogError(message); };

const unquoteScalar = (value) => {
  const trimmed = value.trim();
  if (trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
};

function parseInlineFields(source, entryPath) {
  const parts = [];
  let start = 0;
  let quote = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote && source[i + 1] === quote) { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === ',') { parts.push(source.slice(start, i)); start = i + 1; }
  }
  if (quote) fail(`${entryPath} contains an unterminated quoted scalar.`);
  parts.push(source.slice(start));

  const fields = {};
  for (const part of parts) {
    let separator = -1;
    quote = null;
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (quote) {
        if (ch === quote && part[i + 1] === quote) { i++; continue; }
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ':') { separator = i; break; }
    }
    if (separator < 1) fail(`${entryPath} has a malformed inline field '${part.trim()}'.`);
    const key = part.slice(0, separator).trim();
    if (!/^[a-z_]+$/u.test(key)) fail(`${entryPath} has invalid field name '${key}'.`);
    if (Object.hasOwn(fields, key)) fail(`${entryPath} repeats field '${key}'.`);
    fields[key] = unquoteScalar(part.slice(separator + 1));
  }
  return fields;
}

const evidenceFields = (fields) => ({
  verified_at: fields.verified_at ?? null,
  verified_by: fields.verified_by ?? null,
  claim_scope: fields.claim_scope ?? null,
  environment: fields.environment ?? null,
  reproduction: fields.reproduction ?? null,
  falsifier: fields.falsifier ?? null,
});

const isIsoDate = (value) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
};

function validateEvidence(entry, entryPath, deprecations) {
  for (const field of EVIDENCE_FIELDS) {
    if (BLOCK_SCALAR_INDICATORS.has(entry[field])) {
      fail(`${entryPath}.${field}: evidence fields must be single-line scalars — quote the text`);
    }
  }
  const verifiedBy = entry.verified_by;
  if (verifiedBy !== null && verifiedBy !== undefined) {
    const valid = verifiedBy === 'compile_canvas'
      || verifiedBy === 'runtime_observation'
      || verifiedBy === 'studio-observation'
      || (verifiedBy.startsWith('studio-export-')
        && isIsoDate(verifiedBy.slice('studio-export-'.length)));
    if (!valid) {
      fail(`${entryPath}.verified_by '${verifiedBy}' is invalid; expected compile_canvas, studio-export-<YYYY-MM-DD>, runtime_observation, or legacy studio-observation.`);
    }
    if (verifiedBy === 'studio-observation') deprecations.push(entryPath);
  }
  if (entry.claim_scope !== null && entry.claim_scope !== undefined
    && !CLAIM_SCOPE_SET.has(entry.claim_scope)) {
    fail(`${entryPath}.claim_scope '${entry.claim_scope}' is invalid; expected one of: ${CLAIM_SCOPES.join(', ')}.`);
  }
  if (verifiedBy === 'runtime_observation' || verifiedBy === 'studio-observation') {
    const missing = RUNTIME_EVIDENCE_FIELDS.filter(field =>
      typeof entry[field] !== 'string' || entry[field].trim().length === 0);
    if (missing.length > 0) {
      fail(`${entryPath} uses ${verifiedBy} and therefore requires non-empty ${RUNTIME_EVIDENCE_FIELDS.join(', ')} (missing: ${missing.join(', ')}).`);
    }
  }
}

export function parseAugmentations(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const controls = {};
  const dumpSourced = {};
  const synthetic = {};
  const versionKnowledge = {};
  let schemaVersion = null;
  let mode = null;          // 'aug' | 'dump' | 'synth' | 'version'
  let cur = null, section = null;
  let currentTransform = null;
  const unquote = unquoteScalar;

  for (const ln of lines) {
    const topLevel = ln.match(/^([A-Za-z][\w-]*):(?:\s.*)?$/u);
    if (topLevel && !AUGMENTATION_TOP_LEVEL_KEYS.has(topLevel[1])) {
      fail(`control-augmentations.yml has unknown top-level block '${topLevel[1]}'.`);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    let m;
    if ((m = ln.match(/^schema_version:\s*(\d+)\s*$/))) { schemaVersion = Number(m[1]); continue; }
    if (/^version_knowledge:\s*$/.test(ln)) { mode = 'version'; cur = null; section = null; currentTransform = null; continue; }
    if (/^augmentations:\s*$/.test(ln)) { mode = 'aug'; cur = null; section = null; continue; }
    if (/^dump_sourced_controls:\s*$/.test(ln)) { mode = 'dump'; cur = null; section = null; continue; }
    if (/^synthetic_controls:\s*$/.test(ln)) { mode = 'synth'; cur = null; section = null; continue; }

    if (mode === 'version' && (m = ln.match(/^  (?:(?:"([^"]+)")|(?:'([^']+)')|([^\s:]+)):\s*$/u))) {
      cur = m[1] ?? m[2] ?? m[3];
      if (!/^[A-Za-z][\w/]*@\d+(?:\.\d+){2}$/u.test(cur)) {
        fail(`version_knowledge authored key '${cur}' must be <Control>@<major.minor.patch>.`);
      }
      if (Object.hasOwn(versionKnowledge, cur)) {
        fail(`version_knowledge repeats authored key '${cur}'.`);
      }
      versionKnowledge[cur] = {
        target_type: null,
        target_version: null,
        property_renames: null,
        formula_rewrites: null,
        migration_note: null,
        evidence: null,
        observed_at: null,
        lower_bound: null,
      };
      section = null;
      currentTransform = null;
      continue;
    }

    if ((m = ln.match(/^  ([A-Za-z][\w/]*):\s*$/))) {
      cur = m[1]; section = null;
      if (mode === 'dump') {
        dumpSourced[cur] = {
          family: null, version: null, variants: [], source: null,
          verified: false, input_properties: {}, ...evidenceFields({}),
        };
      } else if (mode === 'synth') {
        synthetic[cur] = { family: null, source: null, verified: false, requires_sibling: null, input_properties: {} };
      } else {
        controls[cur] = {
          notes: [], legacy_variants: [], observed_variants: null,
          additional_input_properties: {},
        };
      }
      continue;
    }
    if (!cur) continue;

    if (mode === 'version') {
      const entry = versionKnowledge[cur];
      if ((m = ln.match(/^    (target_type|target_version|migration_note|evidence|observed_at):\s*(\S.*)$/u))) {
        entry[m[1]] = unquote(m[2]);
        continue;
      }
      if ((m = ln.match(/^    lower_bound:\s*(true|false)\s*$/u))) {
        entry.lower_bound = m[1] === 'true';
        continue;
      }
      if (/^    property_renames:\s*$/.test(ln)) {
        if (entry.property_renames !== null) fail(`version_knowledge.${cur} repeats property_renames.`);
        entry.property_renames = [];
        section = 'property_renames'; currentTransform = null; continue;
      }
      if (/^    property_renames:\s*\[\s*\]\s*$/.test(ln)) {
        if (entry.property_renames !== null) fail(`version_knowledge.${cur} repeats property_renames.`);
        entry.property_renames = [];
        section = null; currentTransform = null; continue;
      }
      if (/^    formula_rewrites:\s*$/.test(ln)) {
        if (entry.formula_rewrites !== null) fail(`version_knowledge.${cur} repeats formula_rewrites.`);
        entry.formula_rewrites = [];
        section = 'formula_rewrites'; currentTransform = null; continue;
      }
      if (/^    formula_rewrites:\s*\[\s*\]\s*$/.test(ln)) {
        if (entry.formula_rewrites !== null) fail(`version_knowledge.${cur} repeats formula_rewrites.`);
        entry.formula_rewrites = [];
        section = null; currentTransform = null; continue;
      }
      if ((m = ln.match(/^      - from:\s*(\S.*)$/u))) {
        if (section !== 'property_renames' && section !== 'formula_rewrites') {
          fail(`version_knowledge.${cur} has a transform outside property_renames/formula_rewrites.`);
        }
        currentTransform = { from: unquote(m[1]), to: null };
        entry[section].push(currentTransform);
        continue;
      }
      if ((m = ln.match(/^        to:\s*\[([^\]]*)\]\s*$/u))) {
        if (section !== 'property_renames' || !currentTransform) {
          fail(`version_knowledge.${cur} has a list target outside property_renames.`);
        }
        currentTransform.to = m[1].split(',').map(value => unquote(value)).filter(Boolean);
        continue;
      }
      if ((m = ln.match(/^        to:\s*(\S.*)$/u))) {
        if (section !== 'formula_rewrites' || !currentTransform) {
          fail(`version_knowledge.${cur} has a scalar target outside formula_rewrites.`);
        }
        currentTransform.to = unquote(m[1]);
        continue;
      }
      if (/^\s*$/.test(ln) || /^\s*#/.test(ln)) continue;
      if (/^\S/.test(ln)) continue;
      fail(`version_knowledge.${cur} has malformed line ${i + 1}: '${ln.trim()}'.`);
    }

    if (mode === 'synth') {
      if ((m = ln.match(/^    family:\s*(\S+)/))) { synthetic[cur].family = m[1]; continue; }
      if ((m = ln.match(/^    source:\s*(\S+)/))) { synthetic[cur].source = m[1]; continue; }
      if ((m = ln.match(/^    verified:\s*(\S+)/))) { synthetic[cur].verified = m[1] === 'true'; continue; }
      if ((m = ln.match(/^    (verified_at|verified_by|claim_scope|environment|reproduction|falsifier):\s*(.+)$/))) {
        synthetic[cur][m[1]] = unquote(m[2]); continue;
      }
      if ((m = ln.match(/^    requires_sibling:\s*(\S+)/))) { synthetic[cur].requires_sibling = m[1]; continue; }
      if (/^    input_properties:\s*$/.test(ln)) { section = 'synthinput'; continue; }
      if (/^    \w/.test(ln)) { section = null; continue; }
      if (section === 'synthinput' && (m = ln.match(/^      (\w+):\s*(\S+)\s*$/))) {
        synthetic[cur].input_properties[m[1]] = unquote(m[2]);
      }
      continue;
    }

    if (mode === 'dump') {
      if ((m = ln.match(/^    family:\s*(\S+)/))) { dumpSourced[cur].family = m[1]; continue; }
      if ((m = ln.match(/^    version:\s*(.+)$/))) { dumpSourced[cur].version = unquote(m[1]); continue; }
      if ((m = ln.match(/^    variants:\s*\[([^\]]*)\]/))) {
        dumpSourced[cur].variants = m[1].split(',').map(s => s.trim()).filter(Boolean); continue;
      }
      if ((m = ln.match(/^    source:\s*(\S+)/))) { dumpSourced[cur].source = m[1]; continue; }
      if ((m = ln.match(/^    verified:\s*(\S+)/))) { dumpSourced[cur].verified = m[1] === 'true'; continue; }
      if ((m = ln.match(/^    (verified_at|verified_by|claim_scope|environment|reproduction|falsifier):\s*(.+)$/))) {
        dumpSourced[cur][m[1]] = unquote(m[2]); continue;
      }
      if (/^    input_properties:\s*$/.test(ln)) { section = 'dumpinput'; continue; }
      if (/^    \w/.test(ln)) { section = null; continue; }
      if (section === 'dumpinput' && (m = ln.match(/^      (\w+):\s*(\S+)\s*$/))) {
        dumpSourced[cur].input_properties[m[1]] = m[2];
      }
      continue;
    }

    // mode === 'aug'
    if (/^    notes:\s*$/.test(ln)) { section = 'notes'; continue; }
    if (/^    legacy_variants:\s*$/.test(ln)) { section = 'legacy'; continue; }
    if (/^    current_variants:\s*$/.test(ln)) {
      if (controls[cur].current_variants !== undefined) fail(`augmentations.${cur} repeats current_variants.`);
      controls[cur].current_variants = [];
      section = 'current'; continue;
    }
    if (/^    current_variants:/u.test(ln)) fail(`augmentations.${cur}.current_variants must be a block list of inline evidence records.`);
    if (/^    observed_variants:\s*$/.test(ln)) {
      if (controls[cur].observed_variants !== null) {
        fail(`augmentations.${cur} repeats observed_variants.`);
      }
      controls[cur].observed_variants = { evidence: null, variants: [] };
      section = 'observed';
      continue;
    }
    if (/^    additional_input_properties:\s*$/.test(ln)) { section = 'add'; continue; }
    if (/^    \w/.test(ln)) section = null;
    if (section === 'current') {
      if (/^\s*$/.test(ln) || /^\s*#/.test(ln)) continue;
      const entryPath = `augmentations.${cur}.current_variants`;
      if (!(m = ln.match(/^      - \{\s*(.+?)\s*\}\s*$/u))) {
        fail(`${entryPath} has malformed line ${i + 1}; use an inline evidence record.`);
      }
      const fields = parseInlineFields(m[1], entryPath);
      if (Object.keys(fields).some(key => !['name', 'verified', 'verified_at', 'verified_by'].includes(key))) {
        fail(`${entryPath} has an unknown field.`);
      }
      controls[cur].current_variants.push({name: fields.name, verified: fields.verified === 'true',
        verified_at: fields.verified_at, verified_by: fields.verified_by});
      continue;
    }
    // observed_variants is a nested block, so it gets its own strict sub-parser:
    // a malformed line here must fail the build, never be silently dropped.
    if (section === 'observed' || section === 'observed_evidence' || section === 'observed_list') {
      const observed = controls[cur].observed_variants;
      if (/^\s*$/.test(ln) || /^\s*#/.test(ln)) continue;
      if (/^      evidence:\s*$/.test(ln)) {
        if (observed.evidence !== null) {
          fail(`augmentations.${cur}.observed_variants repeats evidence.`);
        }
        observed.evidence = evidenceFields({});
        section = 'observed_evidence';
        continue;
      }
      if (/^      variants:\s*$/.test(ln)) { section = 'observed_list'; continue; }
      if (section === 'observed_evidence'
        && (m = ln.match(/^        (verified_at|verified_by|claim_scope|environment|reproduction|falsifier):\s*(.+)$/u))) {
        observed.evidence[m[1]] = unquote(m[2]);
        continue;
      }
      if (section === 'observed_list' && (m = ln.match(/^        - (\S.*)$/u))) {
        observed.variants.push(m[1].trim());
        continue;
      }
      fail(`augmentations.${cur}.observed_variants has malformed line ${i + 1}: '${ln.trim()}'.`);
    }
    if (section === 'notes' && (m = ln.match(/^      - (.+)$/))) {
      controls[cur].notes.push(m[1].replace(/^["']|["']$/g, ''));
      continue;
    }
    if (section === 'legacy' && (m = ln.match(/^      - (\S.*)$/))) {
      controls[cur].legacy_variants.push(m[1].trim());
      continue;
    }
    if (section === 'add') {
      // Longhand: PropName: { type: T, verified: true, ... }
      if ((m = ln.match(/^      (\w+):\s*\{\s*([^}]+)\s*\}/))) {
        const name = m[1];
        const fields = parseInlineFields(m[2], `augmentations.${cur}.additional_input_properties.${name}`);
        controls[cur].additional_input_properties[name] = {
          type: fields.type ?? 'unknown',
          verified: fields.verified === 'true',
          ...evidenceFields(fields),
        };
        continue;
      }
      // Shorthand: PropName: Type
      if ((m = ln.match(/^      (\w+):\s*(\S+)\s*$/))) {
        controls[cur].additional_input_properties[m[1]] = {
          type: m[2], verified: false, ...evidenceFields({}),
        };
      }
    }
  }
  return { schemaVersion, controls, dumpSourced, synthetic, versionKnowledge };
}

// The bundler emits historical deprecations and checks manifest/property
// consistency between these phases. Other consumers can use the full helper.
export function validateAugmentationStructure(parsed, { manifestControls }) {
  const augmentations = structuredClone(parsed);
  const manifest = { controls: manifestControls };

  if (augmentations.schemaVersion !== AUGMENTATION_SCHEMA_VERSION) {
    fail(`control-augmentations.yml schema_version must be ${AUGMENTATION_SCHEMA_VERSION} (got ${String(augmentations.schemaVersion)}).`);
  }
  const versionKnowledge = augmentations.versionKnowledge ?? {};
  if (Object.keys(versionKnowledge).length === 0) {
    fail('version_knowledge section is empty.');
  }
  for (const [authored, entry] of Object.entries(versionKnowledge)) {
    const entryPath = `version_knowledge.${authored}`;
    if (typeof entry.target_type !== 'string' || entry.target_type.length === 0) {
      fail(`${entryPath}.target_type is required.`);
    }
    if (typeof entry.target_version !== 'string' || !/^\d+(?:\.\d+){2}$/u.test(entry.target_version)) {
      fail(`${entryPath}.target_version must be a major.minor.patch string.`);
    }
    if (!Array.isArray(entry.property_renames) || !Array.isArray(entry.formula_rewrites)) {
      fail(`${entryPath} must carry property_renames and formula_rewrites arrays.`);
    }
    for (const [index, rename] of entry.property_renames.entries()) {
      if (typeof rename.from !== 'string' || rename.from.length === 0
        || !Array.isArray(rename.to) || rename.to.length === 0
        || rename.to.some(target => typeof target !== 'string' || target.length === 0)) {
        fail(`${entryPath}.property_renames[${index}] must carry non-empty from and to: string[].`);
      }
    }
    for (const [index, rewrite] of entry.formula_rewrites.entries()) {
      if (typeof rewrite.from !== 'string' || rewrite.from.length === 0
        || typeof rewrite.to !== 'string' || rewrite.to.length === 0) {
        fail(`${entryPath}.formula_rewrites[${index}] must carry non-empty from and to strings.`);
      }
    }
    if (entry.migration_note !== null && (typeof entry.migration_note !== 'string' || entry.migration_note.length === 0)) {
      fail(`${entryPath}.migration_note must be a non-empty string when present.`);
    }
    if (typeof entry.evidence !== 'string' || entry.evidence.length === 0) {
      fail(`${entryPath}.evidence is required.`);
    }
    if (typeof entry.observed_at !== 'string' || !isIsoDate(entry.observed_at)) {
      fail(`${entryPath}.observed_at must be an ISO date.`);
    }
    if (entry.lower_bound !== true) {
      fail(`${entryPath}.lower_bound must be true.`);
    }
    if (entry.migration_note === null) delete entry.migration_note;
  }
  const evidenceDeprecations = [];
  for (const [control, augmentation] of Object.entries(augmentations.controls)) {
    if (augmentation.current_variants !== undefined) {
      const entryPath = `augmentations.${control}.current_variants`;
      if (!Array.isArray(augmentation.current_variants) || augmentation.current_variants.length === 0) {
        fail(`${entryPath} must be a non-empty list.`);
      }
      const seen = new Set(augmentation.legacy_variants ?? []);
      const emitted = new Set(manifest.controls.find(entry => entry.type === control)?.variants ?? []);
      for (const entry of augmentation.current_variants) {
        if (!entry || typeof entry.name !== 'string' || !entry.name.trim()
          || entry.verified !== true || entry.verified_by !== 'compile_canvas'
          || typeof entry.verified_at !== 'string' || !isIsoDate(entry.verified_at)) {
          fail(`${entryPath} requires name, verified: true, ISO verified_at and verified_by: compile_canvas.`);
        }
        if (seen.has(entry.name)) fail(`${entryPath} repeats '${entry.name}' or overlaps legacy_variants.`);
        if (emitted.has(entry.name)) fail(`${entryPath} '${entry.name}' is extractor-emitted; retire its current_variants entry.`);
        seen.add(entry.name);
      }
    }
    for (const [property, entry] of Object.entries(augmentation.additional_input_properties ?? {})) {
      validateEvidence(entry, `augmentations.${control}.additional_input_properties.${property}`, evidenceDeprecations);
    }
  }
  for (const [control, entry] of Object.entries(augmentations.synthetic)) {
    validateEvidence(entry, `synthetic_controls.${control}`, evidenceDeprecations);
  }
  for (const [control, entry] of Object.entries(augmentations.dumpSourced)) {
    validateEvidence(entry, `dump_sourced_controls.${control}`, evidenceDeprecations);
  }

  // ─── observed_variants gate (schema_version 7+) ────────────────────────────
  // Variant names current Studio ACCEPTS but no longer EMITS. They can never earn
  // studio-export evidence, so the only honest class is runtime_observation — and
  // per the v2.4.5 evidence-schema precedent that class REQUIRES all four
  // structured fields. A block missing any of them fails the build rather than
  // shipping an unfalsifiable accept-with-WARN. The names must also be disjoint
  // from every PASSing vocabulary: an overlap with legacy_variants or with the
  // extractor's own variant list means the name is settled and the observation is
  // stale (a WARN on a PASSing variant would be a phantom finding).
  for (const [control, augmentation] of Object.entries(augmentations.controls)) {
    const observed = augmentation.observed_variants ?? null;
    if (observed === null) {
      delete augmentation.observed_variants;
      continue;
    }
    const entryPath = `augmentations.${control}.observed_variants`;
    if (observed.evidence === null) {
      fail(`${entryPath}.evidence is required (verified_by: runtime_observation plus ${RUNTIME_EVIDENCE_FIELDS.join(', ')}).`);
    }
    validateEvidence(observed.evidence, `${entryPath}.evidence`, evidenceDeprecations);
    if (observed.evidence.verified_by !== 'runtime_observation') {
      fail(`${entryPath}.evidence.verified_by must be runtime_observation (got ${String(observed.evidence.verified_by)}) — a name Studio still emits belongs in legacy_variants or the extractor list, not here.`);
    }
    if (!Array.isArray(observed.variants) || observed.variants.length === 0) {
      fail(`${entryPath}.variants must be a non-empty list of variant names.`);
    }
    const legacySet = new Set(augmentation.legacy_variants ?? []);
    const currentSet = new Set((augmentation.current_variants ?? []).map(entry => entry.name));
    const manifestVariants = new Set(manifest.controls.find(c => c.type === control)?.variants ?? []);
    const seen = new Set();
    for (const variant of observed.variants) {
      if (typeof variant !== 'string' || variant.trim().length === 0) {
        fail(`${entryPath}.variants contains a non-string or empty variant name.`);
      }
      if (seen.has(variant)) fail(`${entryPath}.variants repeats '${variant}'.`);
      seen.add(variant);
      if (legacySet.has(variant)) {
        fail(`${entryPath}.variants '${variant}' also appears in legacy_variants — a variant belongs to exactly one vocabulary (legacy_variants PASSes, observed_variants WARNs).`);
      }
      if (currentSet.has(variant)) fail(`${entryPath}.variants '${variant}' also appears in current_variants — a variant belongs to exactly one vocabulary.`);
      if (manifestVariants.has(variant)) {
        fail(`${entryPath}.variants '${variant}' is already an extractor-emitted variant of ${control} — retire it from observed_variants.`);
      }
    }
  }

  return { catalog: augmentations, evidenceDeprecations };
}

export function validateAugmentationContext(augmentations, { manifestControls }) {
  const manifest = { controls: manifestControls };
  const KNOWN_SKIPPED = new Set(['Arrow', 'Circle', 'Classic/Icon', 'DataCard', 'FluidGrid', 'Form', 'PartialCircle', 'Star', 'Triangle']);

  for (const a of Object.keys(augmentations.controls)) {
    if (!manifest.controls.some(c => c.type === a) && !KNOWN_SKIPPED.has(a)) {
      fail(`augmentation '${a}' matches no manifest control (and is not a known-skipped control).`);
    }
  }

  // ─── Dump-sourced control gate ─────────────────────────────────────────────
  // These are extractor-UNREACHABLE controls recovered from a Studio export. The
  // invariant: a dump_sourced entry must NEVER shadow an extractor-reachable one.
  // If the extractor starts describing the control, the dump entry is stale and
  // must be retired (otherwise its lower-bound property list would silently mask
  // the real, complete one).
  const dumpSourced = augmentations.dumpSourced ?? {};
  const dumpSourcedNames = Object.keys(dumpSourced);
  for (const name of dumpSourcedNames) {
    if (manifest.controls.some(c => c.type === name)) {
      fail(`'${name}' is now extractor-reachable; retire its dump_sourced entry.`);
    }
  }

  // ─── Synthetic control gate ────────────────────────────────────────────────
  // Synthetic controls are authoring constructs (e.g. CanvasComponent) with no
  // extractor representation. Invariants, mirroring the dump-sourced gate: (1) a
  // synthetic entry must NEVER shadow a real manifest control (if the extractor
  // ever describes it, the synthetic entry is wrong and must be retired);
  // (2) every synthetic control MUST declare `requires_sibling:` — the sibling key
  // (like ComponentName) whose absence the validator REFUSEs. These gates run
  // against the pristine extractor manifest BEFORE folding the synthetic entries in.
  const synthetic = augmentations.synthetic ?? {};
  const syntheticNames = Object.keys(synthetic);
  for (const name of syntheticNames) {
    if (manifest.controls.some(c => c.type === name)) {
      fail(`synthetic control '${name}' also exists in the manifest — it is a real control, not synthetic; retire its synthetic_controls entry.`);
    }
    if (!synthetic[name].requires_sibling) {
      fail(`synthetic control '${name}' has no requires_sibling — every synthetic control must declare the sibling key its Control: line requires (e.g. ComponentName).`);
    }
  }
  if (syntheticNames.length < 1) fail('synthetic_controls section is empty — expected at least 1 synthetic control (CanvasComponent).');

}

export function validateAugmentations(parsed, context) {
  const validated = validateAugmentationStructure(parsed, context);
  validateAugmentationContext(validated.catalog, context);
  return validated;
}
