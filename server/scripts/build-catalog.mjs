#!/usr/bin/env node
/**
 * Catalog build step.
 *
 * Reads the three AppForge catalog YAML files from
 * `../knowledge/catalogs/` and emits a single TypeScript module at
 * `src/generated/catalog.ts` that the Worker imports at deploy time.
 *
 * The Worker has no filesystem at runtime — every value the catalog tools
 * return must be bundled in. This script is the bundling step.
 *
 * Run automatically by `npm run dev` and `npm run deploy` via the prebuild
 * hooks; can also be invoked directly with `npm run build:catalog`.
 *
 * Uses the same minimal YAML parser style as validate.mjs / diff-catalogs.mjs
 * — no js-yaml dep. The catalog shape is regular enough.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPowerFxIndex, FN_IDENTIFIER } from './lib/powerfx-index.mjs';
import { REQUIRED_REFERENCE_DOCS } from './lint-doc-refs.mjs';
import {
  AUGMENTATION_SCHEMA_VERSION,
  AugmentationCatalogError,
  parseAugmentations,
  validateAugmentationStructure,
  validateAugmentationContext,
} from './lib/augmentation-catalog.mjs';
import { parseManifest, parseProperties } from './lib/catalog-source.mjs';
import {
  ModernizationCatalogError,
  modernizationSummary,
  parseModernization,
  validateModernization,
} from './lib/modernization-catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const APPFORGE_ROOT = process.env.APPFORGE_RULES_ROOT
  ? resolve(process.env.APPFORGE_RULES_ROOT)
  : resolve(REPO_ROOT, 'knowledge');
const POWERFX_ROOT = resolve(REPO_ROOT, 'knowledge/powerfx');
const DESIGN_DOCS_ROOT = resolve(REPO_ROOT, 'docs/maintainers/design');
const CATALOG_DIR = join(APPFORGE_ROOT, 'catalogs');
const TEMPLATES_DIR = join(APPFORGE_ROOT, 'templates');
const OUT_FILE = resolve(REPO_ROOT, 'server/src/generated/catalog.ts');
const CONTENT_OUT = resolve(REPO_ROOT, 'server/src/generated/content.ts');
const POWERFX_OUT = resolve(REPO_ROOT, 'server/src/generated/powerfx.ts');
// PowerFx subdirectories to skip — best-practices contains pattern docs (not
// function references) and these meta files don't fit the function-index model.
const POWERFX_SKIP_DIRS = new Set(['best-practices']);
const POWERFX_SKIP_FILES = new Set(['INDEX.md', 'MASTER-FUNCTION-LIST.md', 'VERIFICATION-REPORT.md']);

// Bundle reference content. Exclude folder metadata, contributor instructions
// and the verification doctrine. Catalog data is read separately from YAML.
const EXCLUDED_DOCS = new Set([
  'README.md', 'CLAUDE.md', 'VERIFICATION-DOCTRINE.md', 'CHANGELOG.md',
]);

const gateFail = (msg) => { console.error(`✗ BUILD GATE: ${msg}`); process.exit(1); };

function findReferenceDoc(root, file) {
  const matches = [];
  try {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) matches.push(...findReferenceDoc(path, file));
      else if (entry.name === file) matches.push(path);
    }
  } catch { /* optional reference root */ }
  return matches;
}

// Resolve and verify every Markdown document cited by a shipped LINT_RULES
// docRef before any generated file is written. Top-level rules docs are the
// normal bundle; referenced PowerFx best-practice docs and design documents
// are folded in by filename when a lint docRef names them.
const docs = {};
for (const file of readdirSync(APPFORGE_ROOT)) {
  if (extname(file) !== '.md') continue;
  if (EXCLUDED_DOCS.has(file)) continue;
  docs[basename(file, '.md')] = readFileSync(join(APPFORGE_ROOT, file), 'utf8');
}
// Personas are prompts for the calling session, served through the same
// document/section interface as rules, without adding a tool.
for (const name of [
  'diagnostician', 'diagnostician-artifacts',
  'documenter', 'documenter-artifacts', 'renovator',
]) {
  docs[`persona-${name}`] = readFileSync(join(APPFORGE_ROOT, 'personas', `${name}.md`), 'utf8');
}
for (const file of REQUIRED_REFERENCE_DOCS) {
  const key = basename(file, '.md');
  if (docs[key]) continue;
  const matches = [
    ...findReferenceDoc(POWERFX_ROOT, file),
    ...findReferenceDoc(DESIGN_DOCS_ROOT, file),
  ];
  if (matches.length === 0) gateFail(`required reference doc '${file}' was not bundled.`);
  if (matches.length > 1) gateFail(`required reference doc '${file}' is ambiguous (${matches.join(', ')}).`);
  docs[key] = readFileSync(matches[0], 'utf8');
}
if (!Object.keys(docs).length) gateFail('no reference docs parsed.');

// ─── Emit TypeScript module ───────────────────────────────────────────────
const manifest = parseManifest(readFileSync(join(CATALOG_DIR, 'control-manifest.yml'), 'utf8'));
// The shared source parser precomputes common_variant_properties and accepting
// variant names here, and also keeps verification source/artifact comparisons exact.
const properties = parseProperties(readFileSync(join(CATALOG_DIR, 'control-properties.yml'), 'utf8'));
let augmentations, evidenceDeprecations;
try {
  ({ catalog: augmentations, evidenceDeprecations } = validateAugmentationStructure(
    parseAugmentations(readFileSync(join(CATALOG_DIR, 'control-augmentations.yml'), 'utf8')),
    { manifestControls: manifest.controls },
  ));
} catch (error) {
  if (error instanceof AugmentationCatalogError) gateFail(error.message);
  throw error;
}
const versionKnowledge = augmentations.versionKnowledge ?? {};
const dumpSourced = augmentations.dumpSourced ?? {};
const dumpSourcedNames = Object.keys(dumpSourced);
const synthetic = augmentations.synthetic ?? {};
const syntheticNames = Object.keys(synthetic);
let modernization;
let modernizationDeferred;
try {
  const result = validateModernization(
    parseModernization(readFileSync(join(CATALOG_DIR, 'control-modernization.yml'), 'utf8')),
    { manifestControls: manifest.controls, controlProperties: properties.controls,
      augmentations: augmentations.controls, enums: properties.enums },
  );
  modernization = result.map;
  modernizationDeferred = result.deferred;
  console.error(modernizationSummary(result.summary));
} catch (error) {
  if (error instanceof ModernizationCatalogError) gateFail(error.message);
  throw error;
}

// ─── Verification gate — the bundler's own outputs must be substance-checked
// before anything downstream (the deployed Worker) relies on them.
for (const entryPath of evidenceDeprecations) {
  console.error(`⚠ build deprecation: ${entryPath}.verified_by uses legacy 'studio-observation'; use 'runtime_observation' before the alias window closes at v2.5.`);
}

if (manifest.controls.length !== manifest.counts.controls_in_this_file) {
  gateFail(`manifest declares ${manifest.counts.controls_in_this_file} controls but ${manifest.controls.length} parsed — parser drift or corrupted manifest.`);
}
for (const c of manifest.controls) {
  if (!properties.controls[c.type]) gateFail(`manifest control '${c.type}' has no entry in control-properties.yml.`);
}
const checkEnumRefs = (ctype, props) => {
  for (const [p, t] of Object.entries(props)) {
    if (typeof t === 'string' && t.startsWith('@enum:') && !properties.enums[t.slice('@enum:'.length)]) {
      gateFail(`${ctype}.${p} references unknown enum '${t}'.`);
    }
  }
};
for (const [ctype, entry] of Object.entries(properties.controls)) {
  checkEnumRefs(ctype, entry.input_properties);
  for (const v of Object.values(entry.variant_input_properties)) checkEnumRefs(ctype, v);
}
try {
  validateAugmentationContext(augmentations, { manifestControls: manifest.controls });
} catch (error) {
  if (error instanceof AugmentationCatalogError) gateFail(error.message);
  throw error;
}
const evidenceClasses = [];
for (const [control, augmentation] of Object.entries(augmentations.controls)) {
  for (const [property, entry] of Object.entries(augmentation.additional_input_properties ?? {})) {
    if (entry.verified) continue;
    evidenceClasses.push({
      claim_ref: `augmentation:${control}.${property}`,
      evidence_class: 'unverified-augmentation',
      ...(typeof entry.falsifier === 'string' && entry.falsifier.length > 0
        ? { falsifier: entry.falsifier }
        : {}),
    });
  }
}
for (const control of dumpSourcedNames) {
  const entry = dumpSourced[control];
  evidenceClasses.push({
    claim_ref: `dump_sourced:${control}`,
    evidence_class: 'dump-sourced-lower-bound',
    ...(typeof entry.falsifier === 'string' && entry.falsifier.length > 0
      ? { falsifier: entry.falsifier }
      : {}),
  });
}
console.error(`✓ build gate: ${manifest.controls.length} controls, ${Object.keys(properties.enums).length} enums, ${Object.keys(augmentations.controls).length} augmentations, ${dumpSourcedNames.length} dump-sourced verified, ${syntheticNames.length} synthetic, ${Object.keys(versionKnowledge).length} version migrations`);

// ─── Fold dump-sourced controls into the emitted catalog ───────────────────
// (After the gates: the count/existence gates above run against the pristine
// extractor manifest.) Extractor entries carry no `source`; dump ones do.
for (const [type, d] of Object.entries(dumpSourced)) {
  manifest.controls.push({ type, family: d.family, version: d.version, variants: d.variants, source: 'studio-dump' });
  properties.controls[type] = {
    family: d.family, variants: d.variants,
    input_properties: d.input_properties, variant_input_properties: {},
    parent_context: ['grid_layout_child', 'vertical_horizontal_autolayout_child'],
    output_properties: [],
  };
}

// ─── Fold synthetic controls into the emitted catalog ──────────────────────
// (After the gates run against the pristine manifest.) Synthetic controls carry
// no variants and no parent_context — the validator special-cases them entirely
// (their real surface is the app-defined ComponentDefinition). The fold is just
// enough for the manifest lookup to succeed and the fixed frame properties to be
// available. `source: 'synthetic'` distinguishes them downstream.
for (const [type, s] of Object.entries(synthetic)) {
  manifest.controls.push({ type, family: s.family, version: null, variants: [], source: 'synthetic' });
  properties.controls[type] = {
    family: s.family, variants: [],
    input_properties: s.input_properties, variant_input_properties: {},
    parent_context: [], output_properties: [],
  };
}

mkdirSync(dirname(OUT_FILE), { recursive: true });

const ts = `// AUTO-GENERATED by scripts/build-catalog.mjs — do not hand-edit.
// Source: knowledge/catalogs/control-{manifest,properties,augmentations,modernization}.yml
// Last build: ${new Date().toISOString()}

import type {
  DumpSourcedControlMetadata,
  EvidenceClassSummary,
  ModernizationEntry,
  SyntheticControlMetadata,
  VersionKnowledgeEntry,
} from '../core/catalog.js';

export const CATALOG_VERSION = ${JSON.stringify(manifest.extractedAt)};
export const CATALOG_SOURCE = ${JSON.stringify(manifest.source, null, 2)};
export const CATALOG_COUNTS = ${JSON.stringify(manifest.counts, null, 2)};
export const AUGMENTATION_SCHEMA_VERSION = ${JSON.stringify(augmentations.schemaVersion)};

export const VERSION_KNOWLEDGE = ${JSON.stringify(versionKnowledge, null, 2)} as const satisfies Readonly<Record<string, VersionKnowledgeEntry>>;

export const MODERNIZATION_MAP = ${JSON.stringify(modernization, null, 2)} as const satisfies Readonly<Record<string, ModernizationEntry>>;

export const MODERNIZATION_DEFERRED = ${JSON.stringify(modernizationDeferred, null, 2)} as const;

export const EVIDENCE_CLASSES = ${JSON.stringify(evidenceClasses, null, 2)} as const satisfies readonly EvidenceClassSummary[];

export const CONTROLS = ${JSON.stringify(manifest.controls, null, 2)} as const;

// Control type names recovered from a Studio export (extractor-unreachable).
// Their catalog data is a LOWER BOUND — unknown props/variants WARN, not REFUSE.
export const DUMP_SOURCED: string[] = ${JSON.stringify(dumpSourcedNames, null, 2)};

// Lower-bound control metadata and optional evidence from control-augmentations.yml.
export const DUMP_SOURCED_CONTROL_METADATA = ${JSON.stringify(dumpSourced, null, 2)} as const satisfies Readonly<Record<string, DumpSourcedControlMetadata>>;

// Synthetic authoring-construct control names (e.g. CanvasComponent). Not real
// Studio controls; the validator special-cases them (their property surface is
// the app-defined ComponentDefinition, not this fixed frame).
export const SYNTHETIC: string[] = ${JSON.stringify(syntheticNames, null, 2)};

// Evidence-bearing synthetic authoring constructs from control-augmentations.yml.
export const SYNTHETIC_CONTROL_METADATA = ${JSON.stringify(synthetic, null, 2)} as const satisfies Readonly<Record<string, SyntheticControlMetadata>>;

export const ENUMS = ${JSON.stringify(properties.enums, null, 2)} as const;

export const PARENT_CONTEXT_PROPERTIES = ${JSON.stringify(properties.parentContext, null, 2)} as const;

export const CONTROL_PROPERTIES = ${JSON.stringify(properties.controls, null, 2)} as const;

export const AUGMENTATIONS = ${JSON.stringify(augmentations.controls, null, 2)} as const;

export type ControlEntry = (typeof CONTROLS)[number];
export type ControlProperties = (typeof CONTROL_PROPERTIES)[keyof typeof CONTROL_PROPERTIES];
export type Augmentation = (typeof AUGMENTATIONS)[keyof typeof AUGMENTATIONS];
`;

writeFileSync(OUT_FILE, ts);
console.error(`✓ wrote ${OUT_FILE}`);
console.error(`  ${manifest.controls.length} controls (${manifest.controls.length - dumpSourcedNames.length - syntheticNames.length} extracted + ${dumpSourcedNames.length} studio-dump + ${syntheticNames.length} synthetic) · ${Object.keys(properties.enums).length} enums · ${Object.keys(augmentations.controls).length} augmentations`);

// ─── Templates + reference docs ───────────────────────────────────────────
// Parse template header comments to extract metadata. Format:
//   # TEMPLATE: <name>
//   # TAGS: tag1, tag2, ...
//   # DESCRIPTION: ... (optional, may span multiple comment lines)
//   # USE WHEN: ... (alternative to DESCRIPTION)
function parseTemplateHeader(content) {
  const out = { tags: [], description: '', use_when: '' };
  const lines = content.split('\n').slice(0, 20);
  let curField = null;
  for (const ln of lines) {
    if (!ln.startsWith('#')) break;
    const tagsM = ln.match(/^#\s*TAGS:\s*(.+)$/i);
    if (tagsM) {
      out.tags = tagsM[1].split(',').map(s => s.trim()).filter(Boolean);
      curField = null; continue;
    }
    const descM = ln.match(/^#\s*DESCRIPTION:\s*(.+)$/i);
    if (descM) { out.description = descM[1].trim(); curField = 'description'; continue; }
    const useM = ln.match(/^#\s*USE WHEN:\s*(.+)$/i);
    if (useM) { out.use_when = useM[1].trim(); curField = 'use_when'; continue; }
    // Continuation of a field if line is just `#   text`
    if (curField && /^#\s+\S/.test(ln) && !/^#\s*[A-Z_]+:/.test(ln)) {
      out[curField] += ' ' + ln.replace(/^#\s+/, '').trim();
    }
  }
  return out;
}

const templates = {};
for (const file of readdirSync(TEMPLATES_DIR)) {
  if (!file.endsWith('.yaml')) continue;
  const id = basename(file, '.yaml');
  const content = readFileSync(join(TEMPLATES_DIR, file), 'utf8');
  const meta = parseTemplateHeader(content);
  templates[id] = { id, ...meta, content };
}

if (!Object.keys(templates).length) gateFail('no templates parsed.');

const contentTs = `// AUTO-GENERATED by scripts/build-catalog.mjs — do not hand-edit.
// Source: knowledge/templates/*.yaml and knowledge/*.md
// Last build: ${new Date().toISOString()}

export const TEMPLATES = ${JSON.stringify(templates, null, 2)} as const;

export const REFERENCE_DOCS = ${JSON.stringify(docs, null, 2)} as const;

export type Template = (typeof TEMPLATES)[keyof typeof TEMPLATES];
`;
writeFileSync(CONTENT_OUT, contentTs);
const totalDocSize = Object.values(docs).reduce((n, s) => n + s.length, 0);
const totalTplSize = Object.values(templates).reduce((n, t) => n + t.content.length, 0);
console.error(`✓ wrote ${CONTENT_OUT}`);
console.error(`  ${Object.keys(templates).length} templates (${(totalTplSize/1024).toFixed(1)} KB) · ${Object.keys(docs).length} reference docs (${(totalDocSize/1024).toFixed(1)} KB)`);

// ─── PowerFx function index ───────────────────────────────────────────────
// Walk rules/<category>/*.md and derive function entries from headings.
//
// The rules/ corpus headings are irregular (verified against the real files —
// see the task-11 report), so name extraction is layered:
//
//   1. Type-word strip: drop a trailing Function/Functions/Operator(s)/
//      Statement/Keyword(s)/Signal(s) from a heading (or heading part).
//   2. Qualifier/description strip: drop a trailing "(qualifier…)" and keep only
//      the text before a " - description" dash. This turns
//      "Set Function (Global Variables)" → Set, "ThisItem - Current Item" →
//      ThisItem, "Acceleration Signal" → Acceleration.
//   3. Compound split: a heading may list several functions. Split on commas,
//      " and ", " & ". Accept the heading ONLY if EVERY resulting part is a
//      clean function identifier (and not a generic doc-section word). This
//      keeps "Round, RoundDown, RoundUp" and "Int and Trunc" as multi-function
//      headings, but rejects prose like "Common Mistakes and Solutions".
//   4. Identifier shape: /^[A-Z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)?$/ — one
//      token + optional one dotted segment (keeps Patch, JSON, App.OnError;
//      kills "Creating Records", "Quick Reference", "SaveData vs Patch/Collect").
//   5. Meta-skip: generic doc-section words (Syntax, Parameters, Source, …) are
//      valid identifiers but never functions — dropped.
//   6. H1 fallback: single-function docs put the name in the H1 with only
//      generic H2s (patch.md = "# Patch Function"; Syntax/Parameters/…). If a
//      file yields ZERO accepted H2 entries, derive name(s) from the H1 the same
//      way (after also dropping a leading "X Functions:" grouping label such as
//      "Variable Functions: Set and UpdateContext") and index the WHOLE file
//      under each name. Recovers Patch, Set, UpdateContext, ForAll, With,
//      Concurrent, Sequence, Text, Distinct, Download, Launch, Notify, Reset.

const powerfx = buildPowerFxIndex(POWERFX_ROOT, POWERFX_SKIP_DIRS, POWERFX_SKIP_FILES);
if (!Object.keys(powerfx.functions).length) gateFail('no PowerFx functions parsed.');

// Sentinel gate — core functions that MUST be captured (defends against future
// heading drift silently dropping them), and every indexed name must be a clean
// function identifier (defends against junk section headings creeping back in).
const POWERFX_MUST_EXIST = [
  'Patch', 'Set', 'UpdateContext', 'ForAll', 'Filter', 'LookUp', 'If', 'Switch',
  'Navigate', 'Collect', 'ClearCollect', 'With', 'Concurrent', 'Sequence',
  'Concat', 'Text', 'Value', 'Sum',
];
const indexedNames = new Set(Object.values(powerfx.functions).map(f => f.name));
const missingFns = POWERFX_MUST_EXIST.filter(n => !indexedNames.has(n));
if (missingFns.length) gateFail(`PowerFx index missing required function(s): ${missingFns.join(', ')}.`);
const malformedFns = [...indexedNames].filter(n => !FN_IDENTIFIER.test(n));
if (malformedFns.length) gateFail(`PowerFx index has non-identifier name(s): ${malformedFns.slice(0, 12).join(', ')}${malformedFns.length > 12 ? ` (+${malformedFns.length - 12} more)` : ''}.`);
console.error(`✓ powerfx gate: ${indexedNames.size} function names — all ${POWERFX_MUST_EXIST.length} sentinels present, all identifier-shaped`);

const powerfxTs = `// AUTO-GENERATED by scripts/build-catalog.mjs — do not hand-edit.
// Source: rules/<category>/*.md (PowerFx function reference docs)
// Last build: ${new Date().toISOString()}

export const POWERFX_FUNCTIONS = ${JSON.stringify(powerfx.functions, null, 2)} as const;

export const POWERFX_FUNCTION_NAMES = ${JSON.stringify([...indexedNames].sort(), null, 2)} as const;

export const POWERFX_CATEGORIES = ${JSON.stringify(powerfx.categories, null, 2)} as const;

export type PowerFxFunction = (typeof POWERFX_FUNCTIONS)[keyof typeof POWERFX_FUNCTIONS];
`;
writeFileSync(POWERFX_OUT, powerfxTs);
const totalFnSize = Object.values(powerfx.functions).reduce((n, f) => n + f.content.length, 0);
console.error(`✓ wrote ${POWERFX_OUT}`);
console.error(`  ${Object.keys(powerfx.functions).length} PowerFx functions across ${Object.keys(powerfx.categories).length} categories (${(totalFnSize/1024).toFixed(1)} KB)`);
