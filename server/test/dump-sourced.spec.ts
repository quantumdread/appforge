import { describe, it, expect } from 'vitest';
import { validateFiles } from '../src/lib/validator';
import { validateYaml } from '../src/tools/validator';
import { getControlInfo } from '../src/tools/catalog';
import { getMergedControl } from '../src/lib/catalog';
import { AUGMENTATIONS, CONTROLS, CONTROL_PROPERTIES, DUMP_SOURCED } from '../src/generated/catalog';
import { declaredPropType } from '../src/core/catalog';
import { analyze } from '../src/core/snapshot';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const wrap = (body: string) => `Screens:\n  S:\n    Children:\n${body}`;

describe('unscoped Variant property resolution', () => {
  const probe = (control: string, property: string, value: string, variant?: string) => validateFiles([{
    name: 'variant.pa.yaml', content: wrap(`      - FixtureControl:\n          Control: ${control}\n${variant ? `          Variant: ${variant}\n` : ''}          Properties:\n            ${property}: ${value}\n`),
  }]);

  it('builds the common map and accepts Gallery.Items without a variant warning', () => {
    expect(CONTROL_PROPERTIES.Gallery.common_variant_properties.Items).toBe('Table');
    expect(CONTROL_PROPERTIES.Gallery.common_variant_properties).not.toHaveProperty('WrapCount');
    expect(declaredPropType(ANALYZER_CATALOG_DATA, 'Gallery', null, 'Items')).toBe('Table');
    const result = probe('Gallery', 'Items', '=Table()');
    expect(result.summary).toMatchObject({ pass: 1, refuse: 0 });
    expect(result.issues.some(issue => issue.rule?.includes('variant'))).toBe(false);
  });

  it.each([
    ['WrapCount', ['Horizontal', 'Vertical']],
    ['MaxTemplateSize', ['VariableHeight']],
  ])('WARNs on Gallery.%s and names only accepting bundles', (property, variants) => {
    const result = probe('Gallery', property, '=1');
    expect(result.summary).toMatchObject({ pass: 0, refuse: 0 });
    const issue = result.issues.find(issue => issue.property === property);
    expect(issue).toMatchObject({ level: 'WARN', rule: 'variant-unspecified-property',
      detail: `Gallery.${property} is declared by variants ${variants.join(', ')}; no Variant is authored.`,
      fix: 'declare Variant: with a variant that accepts this property' });
  });

  it('still refuses vocabulary absent from every bundle', () => {
    expect(probe('Gallery', 'FixtureNonsense', '=1').issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'unknown-property', property: 'FixtureNonsense',
    }));
  });

  it('preserves authored variants, including the existing verified WrapCount augmentation', () => {
    expect(probe('Gallery', 'WrapCount', '=1', 'VariableHeight').summary).toMatchObject({ pass: 1, refuse: 0 });
    expect(probe('Gallery', 'MaxTemplateSize', '=1', 'Horizontal').issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'unknown-property', property: 'MaxTemplateSize',
    }));
  });

  it.each([...AUGMENTATIONS.Gallery.legacy_variants, ...AUGMENTATIONS.Gallery.current_variants.map(entry => entry.name)])('uses only common properties for accepted preset %s', variant => {
    expect(probe('Gallery', 'Items', '=Table()', variant).summary).toMatchObject({ pass: 1, refuse: 0 });
    expect(declaredPropType(ANALYZER_CATALOG_DATA, 'Gallery', variant, 'Items')).toBe('Table');
    expect(probe('Gallery', 'WrapCount', '=1', variant).issues).toContainEqual(expect.objectContaining({
      level: 'WARN', rule: 'variant-unspecified-property', property: 'WrapCount',
      detail: `Gallery.WrapCount is declared by variants Horizontal, Vertical; authored variant ${variant} carries no platform scoping.`,
      fix: 'declare Variant: with a variant that accepts this property',
    }));
    expect(probe('Gallery', 'FixtureNonsense', '=1', variant).issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'unknown-property', property: 'FixtureNonsense',
    }));
  });

  it('still refuses an unknown Gallery variant without borrowing common properties', () => {
    expect(probe('Gallery', 'Items', '=Table()', 'FixtureUnknown').issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'unknown-variant', variant: 'FixtureUnknown',
    }));
    expect(declaredPropType(ANALYZER_CATALOG_DATA, 'Gallery', 'FixtureUnknown', 'Items')).toBeNull();
  });

  it.each(['observed', 'enumerated', 'empty-bundle'])('resolves an injected %s variant on an extracted control', kind => {
    const variant = 'FixtureVariant';
    const catalog = {
      ...ANALYZER_CATALOG_DATA,
      controls: ANALYZER_CATALOG_DATA.controls.map(control => control.type === 'Gallery' && kind !== 'observed'
        ? { ...control, variants: [...control.variants, variant] } : control),
      controlProperties: { ...ANALYZER_CATALOG_DATA.controlProperties,
        Gallery: { ...ANALYZER_CATALOG_DATA.controlProperties.Gallery,
          variant_input_properties: { ...ANALYZER_CATALOG_DATA.controlProperties.Gallery.variant_input_properties,
            ...(kind === 'empty-bundle' ? { [variant]: {} } : {}) },
        },
      },
      augmentations: { ...ANALYZER_CATALOG_DATA.augmentations,
        Gallery: { ...ANALYZER_CATALOG_DATA.augmentations.Gallery,
          ...(kind === 'observed' ? { observed_variants: { variants: [variant], evidence: {
            verified_by: 'runtime_observation' as const, claim_scope: 'studio_materializes' as const,
            environment: 'synthetic fixture', reproduction: 'load the fixture', falsifier: 'variant is rejected',
          } } } : {}),
        },
      },
    };
    const content = wrap(`      - FixtureControl:\n          Control: Gallery\n          Variant: ${variant}\n          Properties:\n            Items: =Table()\n            WrapCount: =1\n            FixtureNonsense: =1\n`);
    const result = analyze([{ name: 'injected.pa.yaml', content }], catalog).validation;
    if (kind === 'empty-bundle') {
      expect(result.issues).toContainEqual(expect.objectContaining({
        level: 'REFUSE', rule: 'unknown-property', property: 'Items',
      }));
      expect(declaredPropType(catalog, 'Gallery', variant, 'Items')).toBeNull();
      expect(result.issues.some(issue => issue.rule === 'variant-unspecified-property')).toBe(false);
    } else {
      expect(result.summary.pass).toBe(1);
      expect(declaredPropType(catalog, 'Gallery', variant, 'Items')).toBe('Table');
      expect(result.issues).toContainEqual(expect.objectContaining({
        level: 'WARN', rule: 'variant-unspecified-property', property: 'WrapCount',
        detail: `Gallery.WrapCount is declared by variants Horizontal, Vertical; authored variant ${variant} carries no platform scoping.`,
      }));
      expect(result.issues.filter(issue => issue.level === 'REFUSE')).toEqual([
        expect.objectContaining({ rule: 'unknown-property', property: 'FixtureNonsense' }),
      ]);
    }
    expect(result.issues.filter(issue => issue.rule === 'partial-catalog-data')).toHaveLength(kind === 'observed' ? 1 : 0);
  });

  it('applies the same bundle semantics to TypedDataCard.Required', () => {
    expect(probe('TypedDataCard', 'Required', '=true').issues).toContainEqual(expect.objectContaining({
      level: 'WARN', rule: 'variant-unspecified-property', property: 'Required',
    }));
    expect(probe('TypedDataCard', 'Required', '=true', 'ModernTextualView').issues).toContainEqual(expect.objectContaining({
      level: 'REFUSE', rule: 'unknown-property', property: 'Required',
    }));
    expect(probe('TypedDataCard', 'Required', '=true', 'TextualEdit').summary.refuse).toBe(0);
  });
});

// Lower-bound semantics now use synthetic injected catalogs in coverage.spec.ts.
// These production checks verify retirement into complete extracted coverage.
describe('formerly dump-sourced controls: extracted coverage', () => {
  it('retires all seven dump entries and preserves their control names', () => {
    expect(DUMP_SOURCED).toEqual(['ComboBoxDataField', 'TableDataField']);
    expect(CONTROLS.map(control => control.type)).toEqual(
      expect.arrayContaining(['Circle', 'Classic/Icon', 'Form', 'ModernCheckbox', 'PartialCircle', 'Star', 'Triangle']),
    );
  });

  it('PASSes a dump-listed property on Classic/Icon', () => {
    const yaml = wrap(
      `      - ico1:\n          Control: Classic/Icon\n          Properties:\n            Icon: =Icon.Add\n            Color: =RGBA(0, 0, 0, 1)\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.summary.warn).toBe(0);
    expect(r.summary.pass).toBeGreaterThanOrEqual(2);
  });

  it('REFUSEs an unlisted property after extraction', () => {
    const yaml = wrap(
      `      - ico2:\n          Control: Classic/Icon\n          Properties:\n            MadeUpProp: =1\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.summary.refuse).toBe(1);
    const warn = r.issues.find(i => i.property === 'MadeUpProp');
    expect(warn?.level).toBe('REFUSE');
    expect(warn?.rule).toBe('unknown-property');
    expect(warn?.detail).toBe('property-not-in-catalog');
  });

  it('gate_decision is BLOCK for an unlisted extracted-control property', () => {
    const yaml = wrap(
      `      - ico3:\n          Control: Classic/Icon\n          Properties:\n            MadeUpProp: =1\n`,
    );
    const r = validateYaml.handler({ files: [{ name: 'a.pa.yaml', content: yaml }] });
    const body = JSON.parse(r.content[0].text);
    expect(body.gate_decision).toBe('BLOCK');
    expect(body.issues.refuse.some((i: any) => i.rule === 'unknown-property')).toBe(true);
  });

  it('REFUSEs an unknown variant after extraction', () => {
    const yaml = wrap(
      `      - star1:\n          Control: Star\n          Variant: NotARealVariant\n          Properties:\n            Fill: =RGBA(0, 0, 0, 1)\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.summary.refuse).toBe(1);
    const vwarn = r.issues.find(i => i.variant === 'NotARealVariant');
    expect(vwarn?.level).toBe('REFUSE');
    expect(vwarn?.rule).toBe('unknown-variant');
  });

  it('accepts a known variant of a dump-sourced control without a variant warning', () => {
    const yaml = wrap(
      `      - star2:\n          Control: Star\n          Variant: 5Points\n          Properties:\n            Fill: =RGBA(0, 0, 0, 1)\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.issues.some(i => i.variant === '5Points')).toBe(false);
  });

  it('does NOT leak WARN semantics to extractor-reachable controls (Label unknown prop still REFUSEs)', () => {
    const yaml = wrap(
      `      - lbl1:\n          Control: Label\n          Properties:\n            MadeUpProp: =1\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    const issue = r.issues.find(i => i.property === 'MadeUpProp');
    expect(issue?.level).toBe('REFUSE');
  });

  it('get_control_info(Star) surfaces extracted variants and complete coverage', () => {
    const r = getControlInfo.handler({ control_name: 'Star' });
    const body = JSON.parse(r.content[0].text);
    expect(body.variants).toContain('5Points');
    expect(body.partial).toBe(false);
    expect(body.source).toBeNull();
  });

  it('getMergedControl marks an extractor control as non-partial', () => {
    const m = getMergedControl('Label');
    expect(m?.partial).toBe(false);
  });

  it('PowerBI.WorkspaceId PASSes as a verified augmentation', () => {
    const yaml = wrap(
      `      - pbi1:\n          Control: PowerBI\n          Properties:\n            WorkspaceId: ="abc"\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.issues.some(i => i.property === 'WorkspaceId')).toBe(false);
  });
});

/**
 * `observed_variants:` (schema_version 7, maintainer ruling 2026-08-31) applies the
 * dump-sourced lower-bound doctrine at VARIANT granularity. Real production apps
 * carry TypedDataCard variants from a pre-2026 Studio generation that current
 * Studio still ACCEPTS but no longer EMITS — so they can never earn fresh
 * studio-export evidence, and REFUSEing them on a compiling app was the D1
 * false-REFUSE flood (the cardinal gate failure). They now WARN under the
 * already-registered `partial-catalog-data` rule; the control's PROPERTIES are
 * still validated normally against TypedDataCard's extracted table.
 */
const OBSERVED_TDC_VARIANTS = ['TextualEdit', 'ComboBoxEdit', 'DateEdit', 'DateTimeEdit', 'TextualView'] as const;

const typedCard = (variant: string, props = '            DisplayName: ="Ordered on"\n            Width: =461\n') =>
  wrap(`      - card1:\n          Control: TypedDataCard\n          Variant: ${variant}\n          Properties:\n${props}`);

describe('formerly observed variants: extracted vocabulary', () => {
  it('moves the five formerly observed TypedDataCard variants into extraction', () => {
    const observed = (AUGMENTATIONS as Record<string, any>).TypedDataCard?.observed_variants;
    expect(observed).toBeUndefined();
    expect(CONTROLS.find(control => control.type === 'TypedDataCard')?.variants)
      .toEqual(expect.arrayContaining([...OBSERVED_TDC_VARIANTS]));
  });

  it.each(OBSERVED_TDC_VARIANTS)('PASSes extracted Variant: %s without a lower-bound warning', variant => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: typedCard(variant) }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.issues.filter(i => i.rule === 'unknown-variant')).toEqual([]);
    const warns = r.issues.filter(i => i.rule === 'partial-catalog-data');
    expect(warns).toHaveLength(0);
  });

  it('validates card properties against the extracted TypedDataCard table', () => {
    // Extracted properties and variants PASS.
    const clean = validateFiles([{ name: 'a.pa.yaml', content: typedCard('TextualEdit') }]);
    expect(clean.summary.refuse).toBe(0);
    expect(clean.summary.warn).toBe(0);
    expect(clean.summary.pass).toBeGreaterThanOrEqual(2);
    // ...and a bogus property on the SAME card still REFUSEs: an observed variant
    // does not turn an extractor-reachable control into a lower bound.
    const bogus = validateFiles([{
      name: 'a.pa.yaml',
      content: typedCard('TextualEdit', '            MadeUpProp: =1\n'),
    }]);
    const propIssue = bogus.issues.find(i => i.property === 'MadeUpProp');
    expect(propIssue?.level).toBe('REFUSE');
    expect(propIssue?.rule).toBe('unknown-property');
  });

  it('PASSes a legacy_variants name with no variant warning at all', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: typedCard('ClassicTextualEdit') }]);
    expect(r.summary.refuse).toBe(0);
    expect(r.summary.warn).toBe(0);
    expect(r.issues.some(i => i.variant !== undefined)).toBe(false);
  });

  it('still REFUSEs (unknown-variant) a variant in no vocabulary', () => {
    const r = validateFiles([{ name: 'a.pa.yaml', content: typedCard('Bogus') }]);
    const refusals = r.issues.filter(i => i.rule === 'unknown-variant');
    expect(refusals).toHaveLength(1);
    expect(refusals[0].level).toBe('REFUSE');
    expect(refusals[0].variant).toBe('Bogus');
    expect(refusals[0].detail).toBe('variant-not-in-catalog');
  });

  it('gate_decision is CLEAR for a formerly observed variant', () => {
    const r = validateYaml.handler({
      files: [{ name: 'a.pa.yaml', content: typedCard('DateTimeEdit') }],
    });
    const body = JSON.parse(r.content[0].text);
    expect(body.gate_decision).toBe('CLEAR');
    expect(body.summary.refuse).toBe(0);
    expect(body.issues.warn.some((i: any) => i.rule === 'partial-catalog-data')).toBe(false);
  });

  it('does not leak the WARN to an unlisted variant on a sibling extractor control', () => {
    const yaml = wrap(
      `      - grp1:\n          Control: GroupContainer\n          Variant: TextualEdit\n          Properties:\n            Height: =120\n`,
    );
    const r = validateFiles([{ name: 'a.pa.yaml', content: yaml }]);
    expect(r.issues.some(i => i.rule === 'unknown-variant' && i.variant === 'TextualEdit')).toBe(true);
    expect(r.issues.some(i => i.rule === 'partial-catalog-data')).toBe(false);
  });
});
