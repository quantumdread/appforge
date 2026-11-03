import { verificationFixture } from './helpers/verification-fixture';
import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { LINT_RULES } from '../src/lib/lint';
import { documentNamesFromDocRef, REQUIRED_REFERENCE_DOCS } from '../scripts/lint-doc-refs.mjs';
import {
  AUGMENTATION_SCHEMA_VERSION,
  assertValidAugmentationCatalog,
  type AnalyzerCatalogData,
} from '../src/core/catalog';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import { validateFiles } from '../src/core/analyzer';
import { buildPowerFxIndex, extractLearnSources } from '../scripts/lib/powerfx-index.mjs';

const verification = verificationFixture();
const MCP = resolve(__dirname, '..');
const SCRIPT = join(MCP, 'scripts', 'build-catalog.mjs');
const RULES = resolve(MCP, '..', 'knowledge');
const GALLERY_ONSELECT_EVIDENCE = 'OnSelect:            { type: Event,  verified: true, verified_at: 2026-05-10, verified_by: compile_canvas }';

function run(args: string[] = [], env: Record<string, string> = {}) {
  try {
    const out = execFileSync('node', [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env, ...env } });
    return { code: 0, out };
  } catch (e: any) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function runCaptured(env: Record<string, string> = {}) {
  const result = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  });
  return {
    code: result.status ?? 1,
    out: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

describe('build-catalog gate', () => {
  it('attaches file sources to every function section and the H1 fallback during indexing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-powerfx-source-'));
    mkdirSync(join(tmp, 'fixture'));
    const first = 'https://learn.microsoft.com/example/one';
    const second = 'https://learn.microsoft.com/example/two';
    writeFileSync(join(tmp, 'fixture/sections.md'), `# Fixture functions\n\nInline https://learn.microsoft.com/ignored\n\n## Alpha\nSyntax alpha.\n\n## Beta\nSyntax beta.\n\n## Sources\n- [One](${first})\n- <${second}>\n- ${first}\n\n## Notes\nhttps://learn.microsoft.com/not-a-source\n`);
    writeFileSync(join(tmp, 'fixture/single.md'), `# Gamma Function\n\n## Syntax\nGamma().\n\n**Source URLs**:\n${first}\n${second}\n`);
    writeFileSync(join(tmp, 'fixture/inline.md'), `# Delta Function\n\nSee [one](${first}) and [two](${second}).\n`);
    writeFileSync(join(tmp, 'fixture/local.md'), '# Epsilon Function\n\nLocally written example.\n');
    try {
      const { functions } = buildPowerFxIndex(tmp);
      for (const name of ['Alpha', 'Beta', 'Gamma']) expect(functions[name].sources).toEqual([first, second]);
      expect(functions.Delta.sources).toEqual([first]);
      expect(functions.Epsilon).not.toHaveProperty('sources');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(['Source', 'Sources', 'References'])('recognizes %s sections and ignores non-Learn hosts', heading => {
    expect(extractLearnSources(`# Fixture\n\n## ${heading}\nhttps://example.com/one\nhttps://learn.microsoft.com/example/one\n`))
      .toEqual(['https://learn.microsoft.com/example/one']);
  });

  it('passes against the real catalogs and writes generated files', () => {
    const r = run();
    expect(r.code).toBe(0);
    expect(existsSync(join(MCP, 'src', 'generated', 'catalog.ts'))).toBe(true);
    expect(existsSync(join(MCP, 'src', 'generated', 'content.ts'))).toBe(true);
    expect(existsSync(join(MCP, 'src', 'generated', 'powerfx.ts'))).toBe(true);
  });

  it('captures H1-named PowerFx functions in the generated index', () => {
    const r = run();
    expect(r.code).toBe(0);
    const powerfx = readFileSync(join(MCP, 'src', 'generated', 'powerfx.ts'), 'utf8');
    for (const name of ['Patch', 'Set', 'ForAll', 'UpdateContext', 'Text', 'Sequence']) {
      expect(powerfx).toContain(`"name": "${name}"`);
    }
  });

  it('emits augmentation schema v7 and preserves every optional evidence field', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-evidence-preserve-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    const aug = readFileSync(augPath, 'utf8').replace(
      GALLERY_ONSELECT_EVIDENCE,
      'OnSelect:            { type: Event, verified: true, verified_at: 2026-05-10, verified_by: studio-observation, claim_scope: studio_renders, environment: "Studio 3.0", reproduction: "open Studio, observe", falsifier: "control does not render" }',
    );
    writeFileSync(augPath, aug);
    try {
      const built = runCaptured({ APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
      expect(built.code).toBe(0);
      expect(built.out).toContain("legacy 'studio-observation'");
      const generated = readFileSync(join(MCP, 'src', 'generated', 'catalog.ts'), 'utf8');
      expect(generated).toContain('export const AUGMENTATION_SCHEMA_VERSION = 7');
      expect(generated).toContain('"claim_scope": "studio_renders"');
      expect(generated).toContain('"environment": "Studio 3.0"');
      expect(generated).toContain('"reproduction": "open Studio, observe"');
      expect(generated).toContain('"falsifier": "control does not render"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      expect(run().code).toBe(0);
    }
  });

  it('rejects the wrong schema version and invalid evidence enum values', () => {
    const cases = [
      ['schema version', /schema_version: 7/u, 'schema_version: 6', 'schema_version must be 7'],
      ['verified_by', GALLERY_ONSELECT_EVIDENCE, GALLERY_ONSELECT_EVIDENCE.replace('compile_canvas', 'eyewitness'), '.verified_by'],
      ['claim_scope', GALLERY_ONSELECT_EVIDENCE, GALLERY_ONSELECT_EVIDENCE.replace(' }', ', claim_scope: catalog_says }'), '.claim_scope'],
    ] as const;
    for (const [name, pattern, replacement, message] of cases) {
      const tmp = mkdtempSync(join(tmpdir(), `appforge-evidence-${name.replace(' ', '-')}-`));
      cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
      const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
      writeFileSync(augPath, readFileSync(augPath, 'utf8').replace(pattern as string | RegExp, replacement));
      try {
        const built = runCaptured({ APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
        expect(built.code).toBe(1);
        expect(built.out).toContain('BUILD GATE');
        expect(built.out).toContain(message);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  });

  it('requires all four structured fields for runtime observations', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-runtime-evidence-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    writeFileSync(augPath, readFileSync(augPath, 'utf8').replace(
      GALLERY_ONSELECT_EVIDENCE,
      'OnSelect:            { type: Event, verified: true, verified_at: 2026-05-10, verified_by: runtime_observation, claim_scope: studio_renders, environment: "Studio 3.0", reproduction: "open Studio" }',
    ));
    try {
      const built = runCaptured({ APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
      expect(built.code).toBe(1);
      expect(built.out).toContain('BUILD GATE');
      expect(built.out).toContain('requires non-empty claim_scope, environment, reproduction, falsifier');
      expect(built.out).toContain('missing: falsifier');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prints historical evidence deprecation before a later unknown-augmentation refusal', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-build-diagnostic-order-'));
    const fixtureRules = join(tmp, 'knowledge');
    cpSync(RULES, fixtureRules, { recursive: true });
    const augPath = join(fixtureRules, 'catalogs', 'control-augmentations.yml');
    const original = readFileSync(augPath, 'utf8');
    const changed = original.replace(GALLERY_ONSELECT_EVIDENCE,
      'OnSelect: { type: Event, verified: true, verified_by: studio-observation, claim_scope: studio_renders, environment: "Studio fixture", reproduction: "Open fixture", falsifier: "Fixture does not render" }')
      .replace(/augmentations:\r?\n/u, match => `${match}  UnknownVerificationControl:\n    additional_input_properties:\n      Probe: Boolean\n`);
    expect(changed).not.toBe(original);
    writeFileSync(augPath, changed);
    try {
      const result = runCaptured({ APPFORGE_RULES_ROOT: fixtureRules });
      expect(result.code).toBe(1);
      expect(result.out).toContain('build deprecation:');
      expect(result.out).toContain("augmentation 'UnknownVerificationControl' matches no manifest control");
      expect(result.out.indexOf('build deprecation:')).toBeLessThan(result.out.indexOf('BUILD GATE:'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('retains manifest-count refusal precedence over a later unknown-augmentation refusal', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-build-refusal-order-'));
    const fixtureRules = join(tmp, 'knowledge');
    cpSync(RULES, fixtureRules, { recursive: true });
    const augPath = join(fixtureRules, 'catalogs', 'control-augmentations.yml');
    writeFileSync(augPath, readFileSync(augPath, 'utf8').replace(/augmentations:\r?\n/u,
      match => `${match}  UnknownVerificationControl:\n    additional_input_properties:\n      Probe: Boolean\n`));
    const manifestPath = join(fixtureRules, 'catalogs', 'control-manifest.yml');
    writeFileSync(manifestPath, readFileSync(manifestPath, 'utf8').replace(/controls_in_this_file: \d+/u, 'controls_in_this_file: 999'));
    try {
      const result = runCaptured({ APPFORGE_RULES_ROOT: fixtureRules });
      expect(result.code).toBe(1);
      expect(result.out).toContain('manifest declares 999 controls');
      expect(result.out).not.toContain("augmentation 'UnknownVerificationControl'");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(['|', '|-', '>', '>-'])('rejects block-scalar evidence indicator %s at the catalog-build boundary', indicator => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-block-scalar-evidence-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    const aug = readFileSync(augPath, 'utf8').replace(
      /    verified_by: compile_canvas\r?\n    requires_sibling: ComponentName/u,
      `    verified_by: runtime_observation\n    claim_scope: studio_renders\n    environment: "Studio 3.0"\n    reproduction: ${indicator}\n      Open Studio and observe the component.\n    falsifier: "component does not render"\n    requires_sibling: ComponentName`,
    );
    writeFileSync(augPath, aug);
    try {
      const built = runCaptured({ APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
      expect(built.code).toBe(1);
      expect(built.out).toContain('evidence fields must be single-line scalars — quote the text');
      expect(built.out).toContain('synthetic_controls.CanvasComponent.reproduction');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('independently validates injected augmentation evidence in the core', () => {
    const catalog = {
      augmentationSchemaVersion: AUGMENTATION_SCHEMA_VERSION,
      catalogVersion: '2026-05-10T16:49:19.734Z',
      extractedAt: '2026-05-10T16:49:19.734Z',
      versionKnowledge: {
        'Button@0.0.45': {
          target_type: 'ModernButton',
          target_version: '1.0.0',
          property_renames: [{ from: 'FontSize', to: ['Size'] }],
          formula_rewrites: [],
          evidence: 'studio-export-2026-08-26',
          observed_at: '2026-08-26',
          lower_bound: true,
        },
      },
      evidenceClasses: [{
        claim_ref: 'augmentation:Gallery.OnSelect',
        evidence_class: 'unverified-augmentation',
      }],
      controls: [],
      controlProperties: {},
      augmentations: {
        Gallery: {
          additional_input_properties: {
            OnSelect: {
              type: 'Event',
              verified: false,
              verified_by: 'runtime_observation',
              claim_scope: 'studio_renders',
              environment: 'Studio 3.0',
              reproduction: 'open Studio',
              falsifier: 'control does not render',
            },
          },
        },
      },
      parentContextProperties: {},
      dumpSourced: [],
      enums: {},
    } satisfies AnalyzerCatalogData;
    expect(() => assertValidAugmentationCatalog(catalog)).not.toThrow();
    const invalid = structuredClone(catalog) as AnalyzerCatalogData;
    (invalid.augmentations.Gallery!.additional_input_properties!.OnSelect as any).falsifier = null;
    expect(() => assertValidAugmentationCatalog(invalid)).toThrow(/requires non-empty claim_scope, environment, reproduction, falsifier/u);
    const blockScalar = structuredClone(catalog) as AnalyzerCatalogData;
    (blockScalar.augmentations.Gallery!.additional_input_properties!.OnSelect as any).reproduction = '|-';
    expect(() => assertValidAugmentationCatalog(blockScalar))
      .toThrow(/evidence fields must be single-line scalars — quote the text/u);
    expect(() => assertValidAugmentationCatalog({
      ...catalog,
      augmentationSchemaVersion: 6,
    })).toThrow(/schema_version must be 7/u);
    const malformedMigration = structuredClone(catalog) as AnalyzerCatalogData;
    (malformedMigration.versionKnowledge['Button@0.0.45'] as any).target_type = null;
    expect(() => assertValidAugmentationCatalog(malformedMigration))
      .toThrow(/target_type must be a non-empty string/u);
    const malformedClaim = structuredClone(catalog) as AnalyzerCatalogData;
    (malformedClaim.evidenceClasses[0] as any).claim_ref = 'free-form-claim';
    expect(() => assertValidAugmentationCatalog(malformedClaim))
      .toThrow(/claim-ref scheme/u);
  });

  // ─── observed_variants (schema_version 7+) ───────────────────────────────
  // Accepted-but-no-longer-emitted variant vocabulary. The class can only ever be
  // runtime_observation, so the four structured fields are mandatory (v2.4.5
  // evidence-schema precedent), and the names must be disjoint from every
  // vocabulary that PASSes.
  const OBSERVED_FALSIFIER = /^ {8}falsifier: "a catalog re-extraction.*$/mu;

  it('emits the TypedDataCard observed_variants block with its runtime_observation evidence', () => {
    const r = runCaptured({ APPFORGE_RULES_ROOT: verification.rules });
    expect(r.code).toBe(0);
    const catalog = readFileSync(join(MCP, 'src', 'generated', 'catalog.ts'), 'utf8');
    expect(catalog).toContain('"observed_variants"');
    expect(catalog).toContain('"claim_scope": "studio_materializes"');
    for (const variant of ['TextualEdit', 'ComboBoxEdit', 'DateEdit', 'DateTimeEdit', 'TextualView']) {
      expect(catalog).toContain(`"${variant}"`);
    }
    expect(run().code).toBe(0);
  });

  it.each([
    {
      name: 'missing falsifier',
      mutate: (aug: string) => aug.replace(OBSERVED_FALSIFIER, ''),
      message: 'missing: falsifier',
    },
    {
      name: 'overlap with legacy_variants',
      mutate: (aug: string) => aug.replace('        - TextualEdit', '        - ClassicTextualEdit'),
      message: "also appears in legacy_variants",
    },
    {
      name: 'unknown evidence class',
      mutate: (aug: string) => aug.replace('        verified_by: runtime_observation', '        verified_by: eyewitness'),
      message: '.verified_by',
    },
    {
      name: 'studio-export evidence class',
      mutate: (aug: string) => aug.replace('        verified_by: runtime_observation', '        verified_by: studio-export-2026-08-31'),
      message: 'must be runtime_observation',
    },
    {
      name: 'duplicate variant name',
      mutate: (aug: string) => aug.replace('        - TextualView', '        - TextualView\n        - TextualView'),
      message: "repeats 'TextualView'",
    },
    {
      name: 'malformed nested line',
      mutate: (aug: string) => aug.replace('        - TextualView', '        TextualView: yes'),
      message: 'observed_variants has malformed line',
    },
  ])('fails the build on observed_variants with $name', ({ mutate, message }) => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-observed-variants-'));
    cpSync(verification.rules, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    const before = readFileSync(augPath, 'utf8');
    const after = mutate(before);
    expect(after).not.toBe(before);
    writeFileSync(augPath, after);
    try {
      const built = runCaptured({ APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
      expect(built.code).toBe(1);
      expect(built.out).toContain('BUILD GATE');
      expect(built.out).toContain(message);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      expect(run().code).toBe(0);
    }
  });

  it('rejects an injected observed_variants block that overlaps the extractor variant list', () => {
    const catalog = {
      augmentationSchemaVersion: AUGMENTATION_SCHEMA_VERSION,
      catalogVersion: '2026-05-10T16:49:19.734Z',
      extractedAt: '2026-05-10T16:49:19.734Z',
      versionKnowledge: {},
      evidenceClasses: [],
      controls: [{ type: 'TypedDataCard', variants: ['ModernTextualEdit'] }],
      controlProperties: {},
      augmentations: {
        TypedDataCard: {
          legacy_variants: ['ClassicTextualEdit'],
          observed_variants: {
            evidence: {
              verified_by: 'runtime_observation' as const,
              claim_scope: 'studio_materializes' as const,
              environment: 'production canvas app',
              reproduction: 'legacy-generation Edit-form data cards',
              falsifier: 'a catalog re-extraction settles these names',
            },
            variants: ['TextualEdit'],
          },
        },
      },
      parentContextProperties: {},
      dumpSourced: [],
      enums: {},
    } satisfies AnalyzerCatalogData;
    expect(() => assertValidAugmentationCatalog(catalog)).not.toThrow();

    const missingField = structuredClone(catalog) as AnalyzerCatalogData;
    (missingField.augmentations.TypedDataCard!.observed_variants!.evidence as any).falsifier = null;
    expect(() => assertValidAugmentationCatalog(missingField))
      .toThrow(/requires non-empty claim_scope, environment, reproduction, falsifier/u);

    const wrongClass = structuredClone(catalog) as AnalyzerCatalogData;
    (wrongClass.augmentations.TypedDataCard!.observed_variants!.evidence as any).verified_by = 'compile_canvas';
    expect(() => assertValidAugmentationCatalog(wrongClass))
      .toThrow(/verified_by must be runtime_observation/u);

    const legacyOverlap = structuredClone(catalog) as AnalyzerCatalogData;
    (legacyOverlap.augmentations.TypedDataCard!.observed_variants as any).variants = ['ClassicTextualEdit'];
    expect(() => assertValidAugmentationCatalog(legacyOverlap))
      .toThrow(/also appears in legacy_variants/u);

    const manifestOverlap = structuredClone(catalog) as AnalyzerCatalogData;
    (manifestOverlap.augmentations.TypedDataCard!.observed_variants as any).variants = ['ModernTextualEdit'];
    expect(() => assertValidAugmentationCatalog(manifestOverlap))
      .toThrow(/already an extractor-emitted variant/u);

    const emptyList = structuredClone(catalog) as AnalyzerCatalogData;
    (emptyList.augmentations.TypedDataCard!.observed_variants as any).variants = [];
    expect(() => assertValidAugmentationCatalog(emptyList))
      .toThrow(/variants must be a non-empty array/u);
  });

  it('derives the required reference-doc set from every LINT_RULES docRef', () => {
    const cited = new Set(LINT_RULES.flatMap(rule => [...documentNamesFromDocRef(rule.docRef)]));
    expect([...cited].every(file => REQUIRED_REFERENCE_DOCS.has(file))).toBe(true);

    const built = run();
    expect(built.code).toBe(0);
    const content = readFileSync(join(MCP, 'src', 'generated', 'content.ts'), 'utf8');
    for (const file of cited) expect(content).toContain(`"${file.replace(/\.md$/, '')}"`);
  });

  it('bundles accessibility-rules.md and gates its absence before any generated write', () => {
    const built = run();
    expect(built.code).toBe(0);
    const generated = ['catalog.ts', 'content.ts', 'powerfx.ts']
      .map(file => join(MCP, 'src', 'generated', file));
    const before = generated.map(file => readFileSync(file, 'utf8'));
    const content = before[1];
    expect(content).toContain('"accessibility-rules"');
    expect(content).toContain('# Accessibility rules — Canvas Apps');

    const tmp = mkdtempSync(join(tmpdir(), 'appforge-accessibility-doc-gate-'));
    try {
      cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
      rmSync(join(tmp, 'knowledge', 'accessibility-rules.md'));
      const missing = run([], { APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
      expect(missing.code).toBe(1);
      expect(missing.out).toContain("required reference doc 'accessibility-rules.md' was not bundled");
      expect(generated.map(file => readFileSync(file, 'utf8'))).toEqual(before);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it.each(['ComboBoxDataField', 'TableDataField'])('builds legacy %s with a nullable version and lower-bound verdicts', type => {
    expect(run().code).toBe(0);
    const generated = readFileSync(join(MCP, 'src', 'generated', 'catalog.ts'), 'utf8');
    const metadata = JSON.parse(generated.split('export const DUMP_SOURCED_CONTROL_METADATA = ')[1]
      .split(' as const satisfies')[0]);
    expect(metadata[type]).toMatchObject({
      family: type === 'ComboBoxDataField' ? 'FluentV9' : 'Classic', version: null, variants: ['textualColumn'],
      source: 'studio-export-2026-09-20-legacy-datafields',
      input_properties: { FieldDisplayName: 'Text', FieldName: 'Text', FieldType: 'Text', Order: 'Number' },
    });
    expect(Object.keys(metadata[type].input_properties)).toHaveLength(4);
    const catalog = { ...ANALYZER_CATALOG_DATA, dumpSourcedControls: metadata };
    expect(() => assertValidAugmentationCatalog(catalog)).not.toThrow();
    const probe = (variant: string, properties: string) => validateFiles([{
      name: 'legacy.pa.yaml',
      content: `Screens:\n  Main:\n    Children:\n      - FixtureField:\n          Control: ${type}\n          Variant: ${variant}\n          Properties:\n${properties}`,
    }], catalog);
    const known = probe('textualColumn', '            FieldDisplayName: ="Fixture"\n            FieldName: ="fixture"\n            FieldType: ="s"\n            Order: =1\n');
    expect(known.summary).toMatchObject({ pass: 4, warn: 0, refuse: 0 });
    expect(known.coverage.tiers.dump_sourced_lower_bound).toBe(4);
    for (const result of [probe('textualColumn', '            FixtureUnknown: =1\n'),
      probe('FixtureUnknownVariant', '            Order: =1\n')]) {
      expect(result.summary).toMatchObject({ warn: 1, refuse: 0 });
      expect(result.issues).toEqual([expect.objectContaining({ level: 'WARN', rule: 'partial-catalog-data' })]);
    }
  });

  it('folds an injected dump control and its evidence metadata into the generated catalog', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-injected-dump-'));
    const rules = join(tmp, 'knowledge');
    cpSync(RULES, rules, { recursive: true });
    const augPath = join(rules, 'catalogs', 'control-augmentations.yml');
    const entry = '\n  FixtureDump:\n    family: Classic\n    version: "1.0.0"\n    variants: []\n    source: studio-export-2026-09-20\n    input_properties:\n      Width: Number\n';
    writeFileSync(augPath, readFileSync(augPath, 'utf8').replace(/dump_sourced_controls:\r?\n/, header => header + entry));
    try {
      expect(runCaptured({ APPFORGE_RULES_ROOT: rules }).code).toBe(0);
      const catalog = readFileSync(join(MCP, 'src', 'generated', 'catalog.ts'), 'utf8');
      expect(catalog).toContain('"FixtureDump"');
      expect(catalog).toContain('export const DUMP_SOURCED');
      expect(catalog).toContain('export const DUMP_SOURCED_CONTROL_METADATA');
      expect(catalog).toContain('"source": "studio-dump"');
      expect(catalog).toContain('"claim_ref": "dump_sourced:FixtureDump"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      expect(run().code).toBe(0);
    }
  });

  it.each(['empty', 'absent'])('builds with an %s dump-sourced block', mode => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-zero-dump-'));
    const fixtureRules = join(tmp, 'knowledge');
    cpSync(RULES, fixtureRules, { recursive: true });
    const augPath = join(fixtureRules, 'catalogs', 'control-augmentations.yml');
    const original = readFileSync(augPath, 'utf8');
    writeFileSync(augPath, original.replace(
      /^dump_sourced_controls:\r?\n[\s\S]*?(?=^synthetic_controls:)/mu,
      mode === 'empty' ? 'dump_sourced_controls:\n\n' : '',
    ));
    try {
      const result = runCaptured({ APPFORGE_RULES_ROOT: fixtureRules });
      expect(result.code).toBe(0);
      expect(result.out).toContain('0 dump-sourced verified');
      const generated = readFileSync(join(MCP, 'src', 'generated', 'catalog.ts'), 'utf8');
      expect(generated).toContain('export const DUMP_SOURCED: string[] = []');
      expect(generated).not.toContain('"claim_ref": "dump_sourced:');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
      expect(run().code).toBe(0);
    }
  });

  it('fails with exit 1 and the retire message when a dump_sourced control also exists in the manifest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-dump-gate-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    // 'Label' is an extractor-reachable manifest control — a dump_sourced entry
    // for it must be rejected as stale. Insert it as the first entry right after
    // the dump_sourced_controls: header so it lands in that section regardless of
    // which section is trailing (synthetic_controls now follows dump_sourced).
    const tamper = `\n  Label:\n    family: Classic\n    version: "1.0.0"\n    variants: []\n    source: studio-export-2026-07-08\n    input_properties:\n      Foo: Text\n`;
    const aug = readFileSync(augPath, 'utf8');
    // Match the section header (colon-then-newline) — not the comment mention of
    // the name (colon-then-spaces) — and be CRLF-tolerant.
    writeFileSync(augPath, aug.replace(/dump_sourced_controls:\r?\n/, m => `${m}${tamper}`));
    const r = run([], { APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
    expect(r.code).toBe(1);
    expect(r.out).toContain('BUILD GATE');
    expect(r.out).toContain('retire its dump_sourced entry');
  });

  it('folds the CanvasComponent synthetic control into the generated catalog and exports SYNTHETIC', () => {
    const r = run();
    expect(r.code).toBe(0);
    const catalog = readFileSync(join(MCP, 'src', 'generated', 'catalog.ts'), 'utf8');
    expect(catalog).toContain('export const SYNTHETIC');
    expect(catalog).toContain('"CanvasComponent"');
    expect(catalog).toContain('"source": "synthetic"');
    // its synthetic input properties are present in CONTROL_PROPERTIES
    expect(catalog).toContain('"DisplayMode": "@enum:DisplayMode"');
  });

  it('fails with exit 1 when a synthetic control also exists in the manifest', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-synth-dup-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    // 'Label' is an extractor-reachable manifest control — a synthetic entry for
    // it must be rejected. Append a second synthetic control under the trailing
    // synthetic_controls section.
    const tamper = `\n  Label:\n    family: Synthetic\n    source: compile_canvas\n    requires_sibling: ComponentName\n    input_properties:\n      X: Number\n`;
    writeFileSync(augPath, readFileSync(augPath, 'utf8') + tamper);
    const r = run([], { APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
    expect(r.code).toBe(1);
    expect(r.out).toContain('BUILD GATE');
  });

  it('fails with exit 1 when a synthetic control lacks requires_sibling', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-synth-sibling-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const augPath = join(tmp, 'knowledge', 'catalogs', 'control-augmentations.yml');
    // Strip the requires_sibling line from the CanvasComponent synthetic entry.
    const stripped = readFileSync(augPath, 'utf8').replace(/\r?\n    requires_sibling: ComponentName/, '');
    writeFileSync(augPath, stripped);
    const r = run([], { APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
    expect(r.code).toBe(1);
    expect(r.out).toContain('BUILD GATE');
    expect(r.out).toContain('requires_sibling');
  });

  it('fails with exit 1 when the manifest count is tampered', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-gate-'));
    cpSync(RULES, join(tmp, 'knowledge'), { recursive: true });
    const manifestPath = join(tmp, 'knowledge', 'catalogs', 'control-manifest.yml');
    const manifest = readFileSync(manifestPath, 'utf8');
    writeFileSync(manifestPath, manifest.replace(/controls_in_this_file: \d+/, 'controls_in_this_file: 999'));
    const r = run([], { APPFORGE_RULES_ROOT: join(tmp, 'knowledge') });
    expect(r.code).toBe(1);
    expect(r.out).toContain('BUILD GATE');
  });
});


describe('legacy data-field family provenance', () => {
  it('changing ComboBoxDataField family leaves all lower-bound verdicts unchanged', () => {
    const classic = structuredClone(ANALYZER_CATALOG_DATA);
    const fluent = structuredClone(ANALYZER_CATALOG_DATA);
    for (const [catalog, family] of [[classic, 'Classic'], [fluent, 'FluentV9']] as const) {
      catalog.controls.find(control => control.type === 'ComboBoxDataField')!.family = family;
      catalog.dumpSourcedControls!.ComboBoxDataField.family = family;
    }
    for (const [variant, property] of [
      ['textualColumn', 'FieldName: ="Probe"'],
      ['textualColumn', 'Unrecorded: =1'],
      ['UnrecordedVariant', 'Order: =1'],
    ]) {
      const files = [{ name: 'data-field.pa.yaml', content: `- fldProbe:
    Control: ComboBoxDataField
    Variant: ${variant}
    Properties:
      ${property}
` }];
      const before = validateFiles(files, classic);
      const after = validateFiles(files, fluent);
      expect(after.summary).toEqual(before.summary);
      expect(after.issues).toEqual(before.issues);
    }
  });
});
