import { describe, it, expect } from 'vitest';
import { validateFiles } from '../src/lib/validator';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import { analyze } from '../src/core/snapshot';
import { assertValidAugmentationCatalog } from '../src/core/catalog';

const run = (content: string, name = 'a.pa.yaml') =>
  validateFiles([{ name, content }]);

describe('coverage counters', () => {
  it('preserves lower-bound WARNs through an injected dump control and observed variant', () => {
    const catalog = {
      ...ANALYZER_CATALOG_DATA,
      controls: [...ANALYZER_CATALOG_DATA.controls,
        { type: 'FixtureDump', variants: ['Known'] },
        { type: 'FixtureObserved', variants: [] }],
      controlProperties: { ...ANALYZER_CATALOG_DATA.controlProperties,
        FixtureDump: { input_properties: { Width: 'Number' } },
        FixtureObserved: { input_properties: { Width: 'Number' } } },
      dumpSourced: ['FixtureDump'],
      dumpSourcedControls: { FixtureDump: {
        family: 'Classic', version: null, variants: ['Known'], source: 'studio-export-2026-09-20',
        verified: true, verified_by: 'studio-export-2026-09-20' as const, input_properties: { Width: 'Number' },
      } },
      augmentations: { ...ANALYZER_CATALOG_DATA.augmentations, FixtureObserved: {
        observed_variants: { variants: ['Observed'], evidence: {
          verified_by: 'runtime_observation' as const, claim_scope: 'studio_materializes' as const,
          environment: 'synthetic fixture', reproduction: 'load the fixture', falsifier: 'variant is rejected',
        } },
      } },
    };
    expect(() => assertValidAugmentationCatalog(catalog)).not.toThrow();
    const probe = (type: string, variant: string, property: string) => analyze([{
      name: 'injected.pa.yaml', content: `Screens:\n  Main:\n    Children:\n      - probe:\n          Control: ${type}\n          Variant: ${variant}\n          Properties:\n            ${property}: =1\n`,
    }], catalog).validation;
    for (const result of [probe('FixtureDump', 'Known', 'UnknownProperty'),
      probe('FixtureDump', 'UnknownVariant', 'Width'), probe('FixtureObserved', 'Observed', 'Width')]) {
      expect(result.summary.refuse).toBe(0);
      expect(result.issues.filter(issue => issue.level !== 'PASS')).toEqual([
        expect.objectContaining({ level: 'WARN', rule: 'partial-catalog-data' }),
      ]);
    }
    const extractedUnknown = probe('FixtureObserved', 'Observed', 'UnknownProperty');
    expect(extractedUnknown.issues).toContainEqual(expect.objectContaining({ level: 'REFUSE', rule: 'unknown-property' }));
  });

  it('accepts zero dump entries without lower-bound coverage or dump claim refs', () => {
    const catalog = {
      ...ANALYZER_CATALOG_DATA,
      dumpSourced: [],
      dumpSourcedControls: {},
      evidenceClasses: ANALYZER_CATALOG_DATA.evidenceClasses.filter(
        entry => !entry.claim_ref.startsWith('dump_sourced:'),
      ),
    };
    expect(() => assertValidAugmentationCatalog(catalog)).not.toThrow();
    const snapshot = analyze([{
      name: 'empty-dump.pa.yaml',
      content: 'Screens:\n  Main:\n    Children:\n      - label:\n          Control: Label\n          Properties:\n            Text: ="ready"\n',
    }], catalog);
    expect(snapshot.validation.summary.refuse).toBe(0);
    expect(snapshot.coverage.tiers.dump_sourced_lower_bound).toBe(0);
    expect(snapshot.catalogMetadata.evidenceClasses.some(
      entry => entry.claim_ref.startsWith('dump_sourced:'),
    )).toBe(false);
  });

  it('counts classified property occurrences by trust tier', () => {
    const yaml = `Screens:
  Main:
    Children:
      - btnGo:
          Control: ModernButton
          Properties:
            Text: ="Go"
      - galResults:
          Control: Gallery
          Variant: Vertical
          Properties:
            OnSelect: =Notify("selected")
      - icoStar:
          Control: Star
          Properties:
            Fill: =RGBA(1, 1, 1, 1)
`;
    const { coverage } = run(yaml);
    expect(coverage.tiers.extractor_verified).toBeGreaterThan(0);
    expect(coverage.tiers.dump_sourced_lower_bound).toBe(0);
    expect(Object.values(coverage.tiers).every(n => Number.isInteger(n) && n >= 0)).toBe(true);
    expect(coverage.tiers).toEqual({
      extractor_verified: 2,
      augmentation_verified: 1,
      dump_sourced_lower_bound: 0,
      component_defined: 0,
      unknown: 0,
    });
    expect(Object.values(coverage.tiers).reduce((sum, count) => sum + count, 0)).toBe(3);
  });

  it('excludes properties on an unrecognized control type from every tier', () => {
    const yaml = `Screens:
  Main:
    Children:
      - mystery:
          Control: UnrecognizedFixtureControl
          Properties:
            Text: ="authored"
            OnSelect: =Notify("authored")
`;
    const { coverage } = run(yaml);

    expect(coverage.tiers).toEqual({
      extractor_verified: 0,
      augmentation_verified: 0,
      dump_sourced_lower_bound: 0,
      component_defined: 0,
      unknown: 0,
    });
  });

  it('classifies a formerly observed variant through the refreshed extractor table', () => {
    const yaml = `Screens:
  Main:
    Children:
      - card1:
          Control: TypedDataCard
          Variant: TextualEdit
          Properties:
            DisplayName: ="Ordered on"
            Width: =461
`;
    const { coverage, summary } = run(yaml);
    expect(summary.warn).toBe(0);
    expect(coverage.tiers).toEqual({
      extractor_verified: 2,
      augmentation_verified: 0,
      dump_sourced_lower_bound: 0,
      component_defined: 0,
      unknown: 0,
    });
  });

  it('counts declared and unknown component properties exactly', () => {
    const yaml = `ComponentDefinitions:
  cCoverage:
    DefinitionType: CanvasComponent
    CustomProperties:
      DeclaredInput:
        PropertyKind: Input
        DataType: Number
        Default: =0
    Properties:
      DeclaredInput: =1
      UnrecognizedDefinitionProperty: =2
Screens:
  Main:
    Children:
      - cmpCoverage:
          Control: CanvasComponent
          ComponentName: cCoverage
          Properties:
            DeclaredInput: =1
            UnrecognizedInstanceProperty: =2
`;
    const { coverage } = run(yaml);

    expect(coverage.tiers).toEqual({
      extractor_verified: 0,
      augmentation_verified: 0,
      dump_sourced_lower_bound: 0,
      component_defined: 2,
      unknown: 2,
    });
    expect(Object.values(coverage.tiers).reduce((sum, count) => sum + count, 0)).toBe(4);
  });

  it('reports recognized roots per file', () => {
    const yaml = `Screens:
  Main:
    Children:
      - btnGo:
          Control: ModernButton
          Properties:
            Text: ="Go"
`;
    const { coverage } = run(yaml);
    expect(coverage.files).toEqual([
      { file: 'a.pa.yaml', recognizedRoots: 1, unrecognizedLines: 0, unrecognizedSpans: [] },
    ]);
  });

  it('attributes recognized roots to each file in a multi-file batch', () => {
    const twoScreens = `Screens:
  Main:
    Children:
      - btnMain:
          Control: ModernButton
          Properties:
            Text: ="Main"
  Details:
    Children:
      - btnDetails:
          Control: ModernButton
          Properties:
            Text: ="Details"
`;
    const oneScreen = `Screens:
  Settings:
    Children:
      - btnSettings:
          Control: ModernButton
          Properties:
            Text: ="Settings"
`;
    const { coverage } = validateFiles([
      { name: 'two-screens.pa.yaml', content: twoScreens },
      { name: 'one-screen.pa.yaml', content: oneScreen },
    ]);

    expect(coverage.files).toEqual([
      { file: 'two-screens.pa.yaml', recognizedRoots: 2, unrecognizedLines: 0, unrecognizedSpans: [] },
      { file: 'one-screen.pa.yaml', recognizedRoots: 1, unrecognizedLines: 0, unrecognizedSpans: [] },
    ]);
  });

  it('reports zero recognized roots for content the walker cannot read', () => {
    const { coverage } = run('this: is not\n  pa-yaml: at all\n');
    expect(coverage.files[0].recognizedRoots).toBe(0);
  });
});
