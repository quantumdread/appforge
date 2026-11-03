import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AugmentationCatalogError, parseAugmentations, validateAugmentations } from '../scripts/lib/augmentation-catalog.mjs';
import { parseManifest, parseProperties } from '../scripts/lib/catalog-source.mjs';

const validCatalog = `schema_version: 7
version_knowledge:
  "Button@0.0.45":
    target_type: ModernButton
    target_version: "1.0.0"
    property_renames: []
    formula_rewrites: []
    evidence: studio-export-2026-08-26
    observed_at: "2026-08-26"
    lower_bound: true
augmentations:
  Gallery:
    additional_input_properties:
      OnSelect: { type: Event, verified: true, verified_by: compile_canvas }
dump_sourced_controls:
  Circle:
    family: Shapes
    source: studio-export-2026-08-26
    input_properties:
      Width: Number
synthetic_controls:
  CanvasComponent:
    family: Component
    source: compile_canvas
    requires_sibling: ComponentName
    input_properties:
      Width: Number
`;
const manifestControls = [{ type: 'Gallery', variants: [] }];

describe('historical augmentation parser boundary', () => {
  it('records compile-verified current variants missing from the extractor', () => {
    const source = validCatalog.replace('    additional_input_properties:', `    current_variants:
      - { name: CurrentPreset, verified: true, verified_at: 2026-10-06, verified_by: compile_canvas }
    additional_input_properties:`);
    const result = validateAugmentations(parseAugmentations(source), {manifestControls});
    expect(result.catalog.controls.Gallery.current_variants).toEqual([
      {name: 'CurrentPreset', verified: true, verified_at: '2026-10-06', verified_by: 'compile_canvas'},
    ]);
    expect(result.catalog.controls.Gallery.legacy_variants).toEqual([]);
  });
  it.each([
    'name: CurrentPreset, verified: false, verified_at: 2026-10-06, verified_by: compile_canvas',
    'name: CurrentPreset, verified: true, verified_at: 2026-02-30, verified_by: compile_canvas',
    'name: CurrentPreset, verified: true, verified_at: 2026-10-06, verified_by: runtime_observation',
    'name: CurrentPreset, verified: true, verified_by: compile_canvas',
    'name: CurrentPreset, verified: true, verified_at: 2026-10-06, verified_by: compile_canvas, unknown: value',
  ])('rejects current variants without compile evidence: %s', fields => {
    const source = validCatalog.replace('    additional_input_properties:', `    current_variants:\n      - { ${fields} }\n    additional_input_properties:`);
    expect(() => validateAugmentations(parseAugmentations(source), {manifestControls})).toThrow(/current_variants/);
  });
  it('rejects duplicate current names, retired extractor names and legacy overlap', () => {
    const entry = '      - { name: CurrentPreset, verified: true, verified_at: 2026-10-06, verified_by: compile_canvas }\n';
    const source = validCatalog.replace('    additional_input_properties:', `    current_variants:\n${entry}    additional_input_properties:`);
    expect(() => validateAugmentations(parseAugmentations(source.replace(entry, entry + entry)), {manifestControls})).toThrow(/repeats/);
    expect(() => validateAugmentations(parseAugmentations(source), {manifestControls: [{type: 'Gallery', variants: ['CurrentPreset']}]})).toThrow(/retire/);
    expect(() => validateAugmentations(parseAugmentations(source.replace('    current_variants:', '    legacy_variants:\n      - CurrentPreset\n    current_variants:')), {manifestControls})).toThrow(/overlaps/);
  });
  it('parses source text into the existing semantic shape and null evidence defaults', () => {
    const parsed = parseAugmentations(`schema_version: 7
augmentations:
  Gallery:
    notes:
      - "A preserved note"
    additional_input_properties:
      OnSelect: Event
      Width: { type: Number, verified: true, verified_at: 2026-05-10, verified_by: compile_canvas }
`);
    expect(parsed).toEqual({
      schemaVersion: 7,
      controls: {
        Gallery: {
          notes: ['A preserved note'], legacy_variants: [], observed_variants: null,
          additional_input_properties: {
            OnSelect: {
              type: 'Event', verified: false, verified_at: null, verified_by: null,
              claim_scope: null, environment: null, reproduction: null, falsifier: null,
            },
            Width: {
              type: 'Number', verified: true, verified_at: '2026-05-10', verified_by: 'compile_canvas',
              claim_scope: null, environment: null, reproduction: null, falsifier: null,
            },
          },
        },
      },
      dumpSourced: {}, synthetic: {}, versionKnowledge: {},
    });
  });

  it('can be imported from an empty directory without generating files or console output', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'appforge-pure-augmentation-'));
    try {
      const moduleUrls = ['augmentation-catalog.mjs', 'catalog-source.mjs']
        .map(name => pathToFileURL(resolve(__dirname, '../scripts/lib', name)).href);
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', `for (const url of ${JSON.stringify(moduleUrls)}) await import(url);`], {
        cwd: scratch, encoding: 'utf8', stdio: 'pipe',
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
      expect(readdirSync(scratch)).toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it('retains historical evidence acceptance and normalized output without mutating parsed input', () => {
    const parsed = parseAugmentations(validCatalog);
    const result = validateAugmentations(parsed, { manifestControls });
    expect(result.catalog.controls.Gallery).not.toHaveProperty('observed_variants');
    expect(result.catalog.versionKnowledge['Button@0.0.45']).not.toHaveProperty('migration_note');
    expect(result.catalog.controls.Gallery.additional_input_properties.OnSelect).toMatchObject({
      verified: true, verified_by: 'compile_canvas', verified_at: null,
    });
    expect(parsed.controls.Gallery).toHaveProperty('observed_variants', null);
    expect(result.evidenceDeprecations).toEqual([]);
  });

  it.each([
    ['schema_version: 7', 'schema_version: 6', 'schema_version must be 7'],
    ['verified_by: compile_canvas', 'verified_by: eyewitness', '.verified_by'],
    ['    requires_sibling: ComponentName\n', '', 'has no requires_sibling'],
  ])('throws a typed gate error for invalid historical source %s', (before, after, message) => {
    const parsed = parseAugmentations(validCatalog.replace(before, after));
    expect(() => validateAugmentations(parsed, { manifestControls })).toThrow(AugmentationCatalogError);
    expect(() => validateAugmentations(parsed, { manifestControls })).toThrow(message);
  });

  it('keeps the historical runtime alias with its deprecation instead of applying the new-input gate', () => {
    const parsed = parseAugmentations(validCatalog.replace('verified_by: compile_canvas',
      'verified_by: studio-observation, claim_scope: studio_renders, environment: "Studio test", reproduction: "Open test control", falsifier: "Control does not render"'));
    const result = validateAugmentations(parsed, { manifestControls });
    expect(result.evidenceDeprecations).toEqual(['augmentations.Gallery.additional_input_properties.OnSelect']);
    expect(result.catalog.controls.Gallery.additional_input_properties.OnSelect.verified_by).toBe('studio-observation');
  });
});

describe('historical extractor source parser boundary', () => {
  it('preserves manifest metadata and exact control generations from source text', () => {
    expect(parseManifest(`extracted_at: 2026-08-26T00:00:00Z
source:
  environment: "synthetic fixture"
counts:
  controls_in_this_file: 1
controls:
  - type: "Classic/Icon"
    family: Classic
    version: null
    variants: [Default, Focused]
`)).toEqual({
      extractedAt: '2026-08-26T00:00:00Z', source: { environment: 'synthetic fixture' },
      counts: { controls_in_this_file: 1 },
      controls: [{ type: 'Classic/Icon', family: 'Classic', version: null, variants: ['Default', 'Focused'] }],
    });
  });

  it('preserves property, enum, variant and parent-context source semantics', () => {
    expect(parseProperties(`enums:
  "TextMode": [SingleLine, Multiline]
parent_context_properties:
  layout_child:
    FillPortions: Number
controls:
  TextInput:
    family: Input
    variants: [SingleLine]
    output_properties: [Value]
    parent_context: [layout_child]
    input_properties:
      Mode: "@enum:TextMode"
    variant_input_properties:
      SingleLine:
        Width: Number
`)).toEqual({
      enums: { TextMode: ['SingleLine', 'Multiline'] }, parentContext: { layout_child: { FillPortions: 'Number' } },
      controls: {
        TextInput: {
          family: 'Input', variants: ['SingleLine'], output_properties: ['Value'], parent_context: ['layout_child'],
          input_properties: { Mode: '@enum:TextMode' }, variant_input_properties: { SingleLine: { Width: 'Number' } },
          common_variant_properties: { Width: 'Number' }, variant_property_variants: { Width: ['SingleLine'] },
        },
      },
    });
  });
});
