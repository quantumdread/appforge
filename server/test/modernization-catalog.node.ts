import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseManifest, parseProperties } from '../scripts/lib/catalog-source.mjs';
import { parseAugmentations } from '../scripts/lib/augmentation-catalog.mjs';

// Public seams authorized by M7a: strict source parser and injected build gate.
async function api() {
  const modulePath = '../scripts/lib/modernization-catalog.mjs';
  return import(modulePath);
}
const source = () => readFileSync(resolve(import.meta.dirname,
  '../../knowledge/catalogs/control-modernization.yml'), 'utf8');
const yaml = `schema_version: 1
last_reviewed: 2026-10-06
modernization:
  Classic/Test:
    target: ModernTest
    properties:
      X: same
    references:
      Value: Value
    verified: false
`;
function fixture() {
  return {
    parsed: { schema_version: 1, last_reviewed: '2026-10-06', modernization: {
      'Classic/Test': { target: 'ModernTest', properties: { X: 'same' },
        references: { Value: 'Value' }, verified: false },
    } },
    catalog: {
      manifestControls: [{ type: 'Classic/Test', family: 'Classic' }, { type: 'ModernTest', family: 'React' }],
      controlProperties: {
        'Classic/Test': { input_properties: { X: 'Number' }, output_properties: ['Value'] },
        ModernTest: { input_properties: { X: 'Number' }, output_properties: ['Value'] },
      },
      augmentations: {}, enums: {},
    },
  };
}

describe('modernization catalog parser', () => {
  it('M7b parses a deferred block list with one-line reasons', async () => {
    const { parseModernization, validateModernization } = await api();
    const parsed = parseModernization(yaml.replace('modernization:', `deferred:
  - source: Classic/Icon
    reason: "Icon sets differ."
modernization:`));
    expect(parsed.deferred).toEqual([{ source: 'Classic/Icon', reason: 'Icon sets differ.' }]);
    const { catalog } = fixture();
    catalog.manifestControls.push({ type: 'Classic/Icon', family: 'Classic' });
    expect(validateModernization(parsed, catalog).deferred).toEqual(parsed.deferred);
  });
  it.each(['missing type', 'paired type', 'duplicate', 'empty reason', 'unknown key', 'not a list'])('M7b rejects deferred %s', async name => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    const value: Record<string, unknown> = parsed;
    const deferred = { source: 'Classic/Icon', reason: 'Icon sets differ.' };
    catalog.manifestControls.push({ type: 'Classic/Icon', family: 'Classic' });
    value.deferred = [deferred];
    const errors: Record<string, RegExp> = {
      'missing type': /deferred.*absent/,
      'paired type': /deferred.*pair/,
      duplicate: /deferred.*duplicate/,
      'empty reason': /deferred.*reason/,
      'unknown key': /deferred.*unknown key/,
      'not a list': /deferred.*list/,
    };
    if (name === 'missing type') deferred.source = 'Classic/Missing';
    if (name === 'paired type') deferred.source = 'Classic/Test';
    if (name === 'duplicate') value.deferred = [deferred, deferred];
    if (name === 'empty reason') deferred.reason = '';
    if (name === 'unknown key') Object.assign(deferred, { surprise: 'value' });
    if (name === 'not a list') value.deferred = { 'Classic/Icon': 'Icon sets differ.' };
    expect(() => validateModernization(value, catalog)).toThrow(errors[name]);
  });
  it('accepts the committed classic and FluentV9 map', async () => {
    const { parseModernization } = await api();
    expect(Object.keys(parseModernization(source()).modernization)).toHaveLength(31);
  });
  it.each([
    ['unknown key', yaml.replace('    target:', '    surprise:')],
    ['duplicate pair', yaml + yaml.slice(yaml.indexOf('  Classic/Test:'))],
    ['malformed line', yaml.replace('      X: same', '      broken line')],
    ['bad indentation', yaml.replace('      X: same', '       X: same')],
    ['duplicate property', yaml.replace('      X: same', '      X: same\n      X: same')],
    ['invalid property shorthand', yaml.replace('      X: same', '      X: sam')],
    ['unknown transform key', yaml.replace('      X: same', '      X:\n        surprise: X')],
  ])('rejects %s with pair and line', async (_name, input) => {
    const { parseModernization } = await api();
    expect(() => parseModernization(input)).toThrow(/Classic\/Test.*line \d+/);
  });
});

describe('modernization completeness gate', () => {
  it.each([
    ['FluentV9', 'ModernTest'], ['React', 'Test'], ['Classic', 'ModernTest'],
  ])('G2 rejects target family %s and type %s', async (family, type) => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    parsed.modernization['Classic/Test'].target = type;
    catalog.manifestControls[1] = { type, family };
    expect(() => validateModernization(parsed, catalog)).toThrow(/Modern\*.*React/);
  });
  it.each(['studio-update-2026-10-06', 'version-knowledge-Button@0.0.45',
    'version-knowledge-TextInput@0.0.54'])('G2 accepts evidence basis %s', async basis => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(parsed.modernization['Classic/Test'].properties, { X: { to: 'X', basis } });
    expect(validateModernization(parsed, catalog).summary.renamed).toBe(1);
  });
  it.each(['studio-update-2026-10-07', 'version-knowledge-Button@99.0.0', 'verified'])('G2 rejects unsupported basis %s', async basis => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(parsed.modernization['Classic/Test'].properties, { X: { to: 'X', basis } });
    expect(() => validateModernization(parsed, catalog)).toThrow(/basis/);
  });
  it('G2 targets the exact current types with classic inputs and readable outputs', async () => {
    const { parseModernization } = await api();
    const map = parseModernization(source()).modernization;
    expect(Object.fromEntries(Object.entries(map).filter(([source]) => source === 'Label' || source.startsWith('Classic/')).map(([source, pair]) => [source, pair.target]))).toEqual({
      Label: 'ModernText', 'Classic/TextInput': 'ModernTextInput', 'Classic/Button': 'ModernButton',
      'Classic/CheckBox': 'ModernCheckbox', 'Classic/ComboBox': 'ModernCombobox',
      'Classic/DatePicker': 'ModernDatePicker', 'Classic/DropDown': 'ModernDropdown',
      'Classic/Radio': 'ModernRadio', 'Classic/Slider': 'ModernSlider',
      'Classic/Toggle': 'ModernToggle', 'Classic/Icon': 'ModernIcon',
    });
    expect(map.Label.properties.OnSelect).toBe('same');
    // Classic Size is in points, Modern* in pixels: Label 14 matched ModernText 19 (scratch app, 2026-10-07).
    expect(map.Label.properties.Size).toEqual({ to: 'Size', scale: '4/3', basis: 'scratch-compile-2026-10-07' });
    expect(map['Classic/Icon'].properties.OnSelect).toBe('same');
    expect(map['Classic/Icon'].properties.Icon).toMatchObject({ to: 'Icon', values: { 'Icon.Check': '"Checkmark"' }, basis: 'field-report-2026-10-08#9' });
    expect(map['Classic/TextInput'].properties.Default).toBe('same');
    expect(map['Classic/TextInput'].references.Text).toBe('Text');
    expect(map['Classic/TextInput'].properties.Mode).toMatchObject({ to: 'Type' });
    expect(map['Classic/CheckBox'].properties.Default).toBe('same');
    expect(map['Classic/CheckBox'].references.Value).toBe('Checked');
    expect(map['Classic/Radio'].properties.LineHeight).toBe('same');
    expect(map['Classic/DropDown'].properties.Default).toMatchObject({ to: 'Default', transform: 'value-record' });
  });

  it.each(['extracted', 'augmentation'])('M7b rejects a dropped input still present on the target via %s', async surface => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(parsed.modernization['Classic/Test'].properties, {
      X: { drop: 'No equivalent input.', impact: 'cosmetic', basis: 'inferred' },
    });
    if (surface === 'augmentation') {
      delete (catalog.controlProperties.ModernTest.input_properties as Record<string, string>).X;
      Object.assign(catalog.augmentations, { ModernTest: {
        additional_input_properties: { X: { type: 'Number', verified: false } },
      } });
    }
    expect(() => validateModernization(parsed, catalog)).toThrow(/drop.*X.*present.*ModernTest/);
  });
  it.each([
    ['missing', undefined, /missing impact/],
    ['invalid', 'data', /impact must be cosmetic or behaviour/],
  ])('round 2 impact rejects %s drop impact', async (_name, impact, error) => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(parsed.modernization['Classic/Test'].properties, {
      X: { drop: 'No equivalent styling input.', ...(impact === undefined ? {} : { impact }), basis: 'inferred' },
    });
    expect(() => validateModernization(parsed, catalog)).toThrow(error);
  });
  it('round 2 impact accepts both drop impacts and a manual conversion in a complete map', async () => {
    const { parseModernization, validateModernization, modernizationSummary } = await api();
    const input = yaml.replace('      X: same', `      X:
        manual: "Choose the corresponding target value."
        targets:
        - X
        basis: inferred
      HoverFill:
        drop: "The theme derives hover styling."
        impact: cosmetic
        basis: inferred
      OnSelect:
        drop: "No click event handler."
        impact: behaviour
        basis: inferred`);
    const { catalog } = fixture();
    Object.assign(catalog.controlProperties['Classic/Test'].input_properties, { HoverFill: 'Color', OnSelect: 'Behavior' });
    const { summary } = validateModernization(parseModernization(input), catalog);
    expect(modernizationSummary(summary)).toBe('✓ modernization gate: 1 pairs, 3 properties (0 same, 0 renamed, 1 manual, 1 dropped-cosmetic, 1 dropped-behaviour), 3 inferred, 0 verified');
  });
  it('round 2 manual accepts a conversion with catalog and augmentation targets', async () => {
    const { parseModernization, validateModernization } = await api();
    const input = yaml.replace('      X: same', `      X:
        manual: "Append the formula to both events after their existing formulas."
        targets:
          - X
          - Added
        basis: inferred`);
    const { catalog } = fixture();
    Object.assign(catalog.augmentations, { ModernTest: {
      additional_input_properties: { Added: { type: 'Text', verified: false } },
    } });
    expect(validateModernization(parseModernization(input), catalog).summary.manual).toBe(1);
  });
  it.each([
    ['missing', undefined, /missing targets/],
    ['empty', [], /targets must be a nonempty/],
    ['unknown', ['Missing'], /target input property 'Missing'/],
    ['duplicate', ['X', 'X'], /duplicate target 'X'/],
  ])('round 2 manual rejects %s targets', async (_name, targets, error) => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(parsed.modernization['Classic/Test'].properties, {
      X: { manual: 'Choose a conversion.', ...(targets === undefined ? {} : { targets }), basis: 'inferred' },
    });
    expect(() => validateModernization(parsed, catalog)).toThrow(error);
  });
  it('checks all committed pairs against the extracted catalog and augmentations', async () => {
    const { parseModernization, validateModernization } = await api();
    const base = resolve(import.meta.dirname, '../../knowledge/catalogs');
    const read = (name: string) => readFileSync(resolve(base, name), 'utf8');
    const manifest = parseManifest(read('control-manifest.yml'));
    const properties = parseProperties(read('control-properties.yml'));
    const augmentations = parseAugmentations(read('control-augmentations.yml'));
    const { summary } = validateModernization(parseModernization(source()), {
      manifestControls: manifest.controls, controlProperties: properties.controls,
      augmentations: augmentations.controls, enums: properties.enums,
    });
    expect(summary.pairs).toBe(31);
    expect(summary.verified).toBe(0);
  });
  it('accepts a complete in-memory map', async () => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    expect(validateModernization(parsed, catalog).summary).toEqual({
      pairs: 1, properties: 1, same: 1, renamed: 0, manual: 0,
      droppedCosmetic: 0, droppedBehaviour: 0, inferred: 0, verified: 0,
    });
  });
  it.each([
    'missing source property', 'extra property', 'same missing on target', 'to nonexistent property',
    'enum mismatch without values', 'invalid target enum value', 'scale on non-Number',
    'reference outside readable surface', 'missing basis',
  ])('rejects %s', async name => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    const pair = parsed.modernization['Classic/Test'];
    // Mutations describe invalid public inputs, not parser implementation details.
    const properties: Record<string, unknown> = pair.properties;
    const inputs: Record<string, string> = catalog.controlProperties['Classic/Test'].input_properties;
    const targets: Record<string, string> = catalog.controlProperties.ModernTest.input_properties;
    const refs: Record<string, string | null> = pair.references;
    const errors: Record<string, RegExp> = {
      'missing source property': /missing source property/,
      'extra property': /outside source input/,
      'same missing on target': /target input.*X/,
      'to nonexistent property': /target input.*Missing/,
      'enum mismatch without values': /enum mismatch/,
      'invalid target enum value': /enum.*Missing/,
      'scale on non-Number': /scale.*Number/,
      'reference outside readable surface': /readable surface/,
      'missing basis': /basis/,
    };
    if (name === 'missing source property') delete properties.X;
    if (name === 'extra property') properties.Extra = 'same';
    if (name === 'same missing on target') delete targets.X;
    if (name === 'to nonexistent property') properties.X = { to: 'Missing', basis: 'inferred' };
    if (name === 'enum mismatch without values' || name === 'invalid target enum value') {
      inputs.X = '@enum:Old'; targets.X = '@enum:New';
      Object.assign(catalog.enums, { Old: ['Bold'], New: ['Regular'] });
      if (name === 'invalid target enum value') properties.X = {
        to: 'X', values: { 'Old.Bold': '"Missing"' }, basis: 'inferred',
      };
    }
    if (name === 'scale on non-Number') {
      targets.X = 'Text'; properties.X = { to: 'X', scale: '4/3', basis: 'inferred' };
    }
    if (name === 'reference outside readable surface') refs.Value = 'Missing';
    if (name === 'missing basis') properties.X = { drop: 'No counterpart.', impact: 'cosmetic' };
    expect(() => validateModernization(parsed, catalog)).toThrow(errors[name]);
  });
  it('includes augmentation-only inputs in completeness and readable surfaces', async () => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(catalog.augmentations, { 'Classic/Test': {
      additional_input_properties: { Added: { type: 'Text', verified: false } },
    } });
    expect(() => validateModernization(parsed, catalog)).toThrow(/missing source property 'Added'/);
    Object.assign(parsed.modernization['Classic/Test'].properties, {
      Added: { drop: 'No equivalent input.', impact: 'cosmetic', basis: 'inferred' },
    });
    Object.assign(parsed.modernization['Classic/Test'].references, { Added: null });
    expect(validateModernization(parsed, catalog).summary.properties).toBe(2);
  });
  it.each(['"Regular"', 'New.Regular'])('accepts mapped target enum formula %s', async formula => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    catalog.controlProperties['Classic/Test'].input_properties.X = '@enum:Old';
    catalog.controlProperties.ModernTest.input_properties.X = '@enum:New';
    Object.assign(catalog.enums, { Old: ['Normal'], New: ['Regular'] });
    Object.assign(parsed.modernization['Classic/Test'].properties, {
      X: { to: 'X', values: { 'Old.Normal': formula }, basis: 'inferred' },
    });
    expect(validateModernization(parsed, catalog).summary.renamed).toBe(1);
  });
  it.each(['0', '-1', '1/0', '0/3', 'NaN', '1e2', '4/3/2'])('rejects invalid scale %s', async scale => {
    const { validateModernization } = await api();
    const { parsed, catalog } = fixture();
    Object.assign(parsed.modernization['Classic/Test'].properties, {
      X: { to: 'X', scale, basis: 'inferred' },
    });
    expect(() => validateModernization(parsed, catalog)).toThrow(/positive rational/);
  });
});

describe('modernization build and adapters', () => {
  it('fails the build before generated writes on an incomplete modernization map', () => {
    const mcp = resolve(import.meta.dirname, '..');
    const rules = resolve(mcp, '../knowledge');
    const scratch = mkdtempSync(resolve(tmpdir(), 'appforge-modernization-'));
    const generated = ['catalog.ts', 'content.ts', 'powerfx.ts'].map(name => resolve(mcp, 'src/generated', name));
    const before = generated.map(path => readFileSync(path, 'utf8'));
    try {
      cpSync(rules, resolve(scratch, 'rules'), { recursive: true });
      const path = resolve(scratch, 'rules/catalogs/control-modernization.yml');
      const original = readFileSync(path, 'utf8');
      const incomplete = original.replace('      X: same\n', '');
      expect(incomplete).not.toBe(original);
      writeFileSync(path, incomplete);
      const result = spawnSync(process.execPath, [resolve(mcp, 'scripts/build-catalog.mjs')], {
        encoding: 'utf8', env: { ...process.env, APPFORGE_RULES_ROOT: resolve(scratch, 'rules') },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/BUILD GATE.*Label.*missing source property 'X'/);
      expect(generated.map(path => readFileSync(path, 'utf8'))).toEqual(before);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
  it('injects the complete generated map through both Worker and CLI adapters', async () => {
    vi.stubGlobal('__ANALYZER_CORE_VERSION__', 'modernization-test');
    try {
      const { ANALYZER_CATALOG_DATA } = await import('../src/lib/catalog-data');
      const { loadCatalog } = await import('../src/cli-artifact');
      const { parseModernization } = await api();
      const expected = parseModernization(source()).modernization;
      expect(ANALYZER_CATALOG_DATA.modernization).toEqual(expected);
      expect(loadCatalog().modernization).toEqual(expected);
      const deferred = parseModernization(source()).deferred;
      expect(ANALYZER_CATALOG_DATA.modernizationDeferred).toEqual(deferred);
      expect(loadCatalog().modernizationDeferred).toEqual(deferred);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

it('M7d accepts a FluentV9 source', async () => {
  const { validateModernization } = await api();
  const { parsed, catalog } = fixture();
  catalog.manifestControls[0].family = 'FluentV9';
  expect(validateModernization(parsed, catalog).summary.pairs).toBe(1);
});
it.each(['React', 'PCF', null])('M7d rejects source family %s', async family => {
  const { validateModernization } = await api();
  const { parsed, catalog } = fixture();
  Object.assign(catalog.manifestControls[0], { family });
  expect(() => validateModernization(parsed, catalog)).toThrow(/source.*Classic.*FluentV9/);
});
it('M7d rejects a FluentV9 source that also appears as a target', async () => {
  const { validateModernization } = await api();
  const { parsed, catalog } = fixture();
  catalog.manifestControls[0].family = 'FluentV9';
  Object.assign(parsed.modernization, { ModernTest: { ...parsed.modernization['Classic/Test'], target: 'Classic/Test' } });
  expect(() => validateModernization(parsed, catalog)).toThrow(/FluentV9 source.*target/);
});
