import { describe, expect, it } from 'vitest';
import { analyze } from '../src/core/snapshot';
import { buildModernizationInventory } from '../src/core/survey/inventories';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import { buildReport } from '../src/core/survey/build-report';
import { renderTechnical } from '../src/core/survey/render-technical';
import { validateReport } from '../src/core/survey/validate-report';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { buildEnvelope } from '../src/core/survey/envelope';

const ajvValidate = new Ajv({ strict: false }).compile(JSON.parse(readFileSync(
  new URL('../src/core/survey/analysis-report.schema.json', import.meta.url), 'utf8')));

const fixture = `Screens:
  Main:
    Children:
      - mechanical:
          Control: Label
          Properties:
            Text: ="Ready"
            Wrap: =false
            Color: =RGBA(0, 0, 0, 1)
            DisabledColor: =RGBA(1, 1, 1, 1)
            UnknownProperty: =1
      - reviewed:
          Control: Label
          Properties:
            Text: ="Click"
            Wrap: =false
            OnSelect: =Back()
      - toggle:
          Control: Classic/Toggle
          Properties:
            OnChange: =Back()
      - input:
          Control: Classic/TextInput
          Properties:
            Default: =""
      - icon:
          Control: Classic/Icon
      - gallery:
          Control: Gallery
      - reader1:
          Control: ModernText
          Properties:
            Text: =input.Text
      - reader2:
          Control: ModernText
          Properties:
            Text: =input.Text
      - scoped:
          Control: ModernText
          Properties:
            Text: =ForAll(rows, input.Text) & Self.Text
`;
function snapshotFor(content: string) {
  return analyze([{ name: 'test.pa.yaml', content }], ANALYZER_CATALOG_DATA);
}
function reportFor(content: string) {
  return buildReport(snapshotFor(content), {
    app_name: { value: 'Modernization test', resolved_by: 'manifest' },
    source_kind: 'inline', fingerprint_basis: 'modernization/test',
    files: [{ id: 'test.pa.yaml', sha256: '0'.repeat(64) }],
    limitations: [], connections: { state: 'empty', rows: [] },
  }, { now: '2026-10-06T00:00:00.000Z', report_id: 'm7b-test', analyzer_version: '3.2.1-test' });
}
function rowsFor(content = fixture) {
  const inventory = buildModernizationInventory(snapshotFor(content));
  expect(inventory.state).toBe('available');
  if (inventory.state !== 'available') throw new Error('Expected modernization candidates');
  return inventory.rows;
}

const modernApp = `Screens:
  Main:
    Children:
      - modern:
          Control: ModernText
          Properties:
            Text: ="Modern"
`;

describe('survey modernization inventory', () => {
  it('G2 flags classic icon names for review while preserving their actions', () => {
    const row = rowsFor(fixture.replace('Control: Classic/Icon', 'Control: Classic/Icon\n          Properties:\n            Icon: =Icon.Add\n            OnSelect: =Back()')).find(row => row.source_type === 'Classic/Icon');
    expect(row).toMatchObject({ target_type: 'ModernIcon', controls: 1, mechanical: 0, needs_review: 1,
      authored: { same: 1, renamed: 0, manual: 1, dropped_cosmetic: 0, dropped_behaviour: 0 },
      review_reasons: [{ property: 'Icon', controls: 1 }] });
    const deferred = rowsFor(fixture + '      - deferred:\n          Control: DataTable\n').find(row => row.source_type === 'DataTable');
    expect(deferred).toMatchObject({ target_type: null, mechanical: 0, needs_review: 1 });
  });
  it('G2 still counts checkbox output renames', () => {
    const app = fixture.replace('Control: Classic/TextInput', 'Control: Classic/CheckBox').replaceAll('input.Text', 'input.Value');
    expect(rowsFor(app).find(row => row.source_type === 'Classic/CheckBox')).toMatchObject({ target_type: 'ModernCheckbox', reference_rewrites: 2 });
  });

  it('omits unknown types and properties even when their names match object prototypes', () => {
    const app = fixture
      + '      - unknown:\n          Control: UnknownType\n          Properties:\n            Text: ="Unknown"\n';
    const snapshot = snapshotFor(app);
    // Exercise the inventory's public snapshot seam: the gate independently
    // rejects unknown controls before inventory classification.
    snapshot.bundle.screens[0].roots.find(node => node.name === 'unknown')!.type = 'constructor';
    snapshot.bundle.screens[0].roots[0].properties.find(property => property.name === 'UnknownProperty')!.name = 'constructor';
    const inventory = buildModernizationInventory(snapshot);
    if (inventory.state !== 'available') throw new Error('Expected candidates');
    const rows = inventory.rows;
    expect(rows.map(row => row.source_type)).toEqual(['Label', 'Classic/Icon', 'Classic/TextInput', 'Classic/Toggle']);
    expect(rows[0].authored.dropped_cosmetic).toBe(1);
  });
  it('counts reference occurrences, case-insensitive quoted heads and null mappings', () => {
    const app = fixture.replace('Text: =input.Text', "Text: ='INPUT'.'Text' & input.Text & input.Tooltip & record.input.Text & input.Width");
    expect(rowsFor(app).find(row => row.source_type === 'Classic/TextInput')).toMatchObject({
      reference_rewrites: 1, references_unmapped: 1,
    });
  });
  it.each([
    '=With({input: {Text: "local"}}, input.Text)',
    '=ForAll(rows As input, input.Text)',
    '=Filter(rows, input.Text = "local")',
    '=Self.Text & Parent.Text & ThisItem.Text & ThisRecord.Text',
    '=record.input.Text',
    '="input.Text" /* input.Text */',
    '=input.Text & (',
  ])('excludes ambiguous scope, nested, inert and partial reads: %s', formula => {
    const app = fixture.replaceAll('Text: =input.Text', `Text: ${formula}`);
    expect(rowsFor(app).find(row => row.source_type === 'Classic/TextInput')?.reference_rewrites).toBe(0);
  });
  it('skips ambiguous case-insensitive instance names across files', () => {
    const snapshot = analyze([
      { name: 'a.pa.yaml', content: fixture },
      { name: 'b.pa.yaml', content: 'Screens:\n  Other:\n    Children:\n      - INPUT:\n          Control: Classic/TextInput\n' },
    ], ANALYZER_CATALOG_DATA);
    const inventory = buildModernizationInventory(snapshot);
    expect(inventory.state === 'available' && inventory.rows.find(row => row.source_type === 'Classic/TextInput')?.reference_rewrites).toBe(0);
  });
  it('counts App and Screen references and skips known variable collisions', () => {
    const extra = `App:
  Properties:
    OnStart: =Set(result, input.Text)
Screens:
  Other:
    Properties:
      OnVisible: =Set(result, input.Text)
`;
    const snapshot = analyze([{ name: 'a.pa.yaml', content: fixture }, { name: 'b.pa.yaml', content: extra }], ANALYZER_CATALOG_DATA);
    const inventory = buildModernizationInventory(snapshot);
    expect(inventory.state === 'available' && inventory.rows.find(row => row.source_type === 'Classic/TextInput')?.reference_rewrites).toBe(0);
    const shadowed = analyze([{ name: 'a.pa.yaml', content: fixture }, { name: 'b.pa.yaml', content: extra.replaceAll('Set(result, input.Text)', 'Set(input, "local")') }], ANALYZER_CATALOG_DATA);
    const shadowedInventory = buildModernizationInventory(shadowed);
    expect(shadowedInventory.state === 'available' && shadowedInventory.rows.find(row => row.source_type === 'Classic/TextInput')?.reference_rewrites).toBe(0);
  });
  it('leaves findings, gate decisions and the telemetry envelope unchanged', () => {
    const report = reportFor(fixture);
    const withoutMap = buildReport(analyze([{ name: 'test.pa.yaml', content: fixture }], {
      ...ANALYZER_CATALOG_DATA, modernization: undefined,
    }), {
      app_name: { value: 'Modernization test', resolved_by: 'manifest' },
      source_kind: 'inline', fingerprint_basis: 'modernization/test',
      files: [{ id: 'test.pa.yaml', sha256: '0'.repeat(64) }],
      limitations: [], connections: { state: 'empty', rows: [] },
    }, { now: '2026-10-06T00:00:00.000Z', report_id: 'm7b-test', analyzer_version: '3.2.1-test' });
    expect(report.inventories.modernization.state).toBe('available');
    expect(withoutMap.inventories.modernization.state).toBe('unavailable');
    expect(report.gate).toEqual(withoutMap.gate);
    expect(report.findings).toEqual(withoutMap.findings);
    const options = {
      id: '123e4567-e89b-42d3-a456-426614174000',
      catalog_allowlist: { extractor_control_types: [], properties_by_control_type: {} },
    };
    const envelope = buildEnvelope(snapshotFor(fixture), report, options);
    expect(envelope).toEqual(buildEnvelope(snapshotFor(fixture), withoutMap, options));
    expect(JSON.stringify(envelope)).not.toContain('modernization');
  });
  it('renders modernization beside the other inventories', () => {
    const rendered = renderTechnical(reportFor(fixture));
    expect(rendered).toContain('### Modernization');
    expect(rendered).toContain('Label → ModernText; verified: false; controls: 2; mechanical: 2; needs review: 0');
    expect(rendered).toContain('Reference rewrites: 0; unmapped: 0');
    expect(rendered).not.toContain('OnSelect: 1');
    expect(rendered).toContain('toggle (1 total)');
  });
  it.each(['missing inventory', 'negative count', 'noninteger count', 'invalid target', 'too many samples', 'invalid reason count', 'missing authored kind'])('validates modernization %s with runtime and JSON schema', name => {
    const report = reportFor(fixture);
    expect(validateReport(report).valid).toBe(true);
    expect(ajvValidate(report)).toBe(true);
    const inventory = report.inventories.modernization;
    if (inventory.state !== 'available') throw new Error('Expected modernization rows');
    const row = inventory.rows[0];
    if (name === 'missing inventory') delete (report.inventories as Partial<typeof report.inventories>).modernization;
    if (name === 'negative count') row.controls = -1;
    if (name === 'noninteger count') row.reference_rewrites = 0.5;
    if (name === 'invalid target') Object.assign(row, { target_type: 4 });
    if (name === 'too many samples') row.sample_review_controls = Array(11).fill('reviewed');
    if (name === 'invalid reason count') row.review_reasons.push({ property: 'Live', controls: -1 });
    if (name === 'missing authored kind') delete (row.authored as Partial<typeof row.authored>).manual;
    expect({ runtime: validateReport(report).valid, schema: ajvValidate(report) }).toEqual({ runtime: false, schema: false });
  });
  it('reports empty for an app with only modern controls through the shared report', () => {
    expect(reportFor(modernApp).inventories.modernization).toEqual({ state: 'empty', rows: [] });
  });
  it('classifies only authored same, renamed, cosmetic and behaviour properties', () => {
    expect(rowsFor().find(row => row.source_type === 'Label')).toMatchObject({
      target_type: 'ModernText', verified: false, controls: 2, mechanical: 2, needs_review: 0,
      authored: { same: 6, renamed: 0, manual: 0, dropped_cosmetic: 1, dropped_behaviour: 0 },
      review_reasons: [],
      sample_review_controls: [], review_controls_total: 0,
    });
    expect(rowsFor().find(row => row.source_type === 'Label')?.note).toMatch(/unknown.*not counted/i);
  });
  it('marks a Toggle authoring manual OnChange for review', () => {
    expect(rowsFor().find(row => row.source_type === 'Classic/Toggle')).toMatchObject({
      controls: 1, mechanical: 0, needs_review: 1,
      authored: { same: 0, renamed: 0, manual: 1, dropped_cosmetic: 0, dropped_behaviour: 0 },
      review_reasons: [{ property: 'OnChange', controls: 1 }], sample_review_controls: ['toggle'],
    });
  });
  it('preserves TextInput.Text reads for the current target', () => {
    expect(rowsFor().find(row => row.source_type === 'Classic/TextInput')).toMatchObject({
      controls: 1, mechanical: 1, needs_review: 0, reference_rewrites: 0, references_unmapped: 0,
    });
  });
  it('reports Icon as a mapped candidate and retains the remaining deferred types', () => {
    const rows = rowsFor();
    expect(rows.find(row => row.source_type === 'Classic/Icon')).toMatchObject({
      target_type: 'ModernIcon', verified: false, controls: 1, mechanical: 1, needs_review: 0,
      authored: { same: 0, renamed: 0, manual: 0, dropped_cosmetic: 0, dropped_behaviour: 0 },
      review_reasons: [], sample_review_controls: [], review_controls_total: 0,
    });
    expect(rows.some(row => row.source_type === 'Gallery')).toBe(false);
  });
  it('orders candidates by count descending then type name', () => {
    expect(rowsFor().map(row => row.source_type)).toEqual([
      'Label', 'Classic/Icon', 'Classic/TextInput', 'Classic/Toggle',
    ]);
  });
  it('always partitions controls into mechanical and needs_review', () => {
    for (const row of rowsFor()) expect(row.mechanical + row.needs_review).toBe(row.controls);
  });
  it('caps review samples at ten names in source order and sorts review reasons', () => {
    const children = Array.from({ length: 12 }, (_, index) => `      - review${index + 1}:
          Control: Label
          Properties:
            OnSelect: =Back()
            Overflow: =Overflow.Scroll${index < 2 ? '\n            Live: =Live.Polite' : ''}`).join('\n');
    const row = rowsFor(`Screens:\n  Main:\n    Children:\n${children}\n`)[0];
    expect(row).toMatchObject({ controls: 12, mechanical: 0, needs_review: 12, review_controls_total: 12 });
    expect(row.sample_review_controls).toEqual([
      'review1', 'review2', 'review3', 'review4', 'review5', 'review6', 'review7', 'review8', 'review9', 'review10',
    ]);
    expect(row.review_reasons).toEqual([
      { property: 'Overflow', controls: 12 }, { property: 'Live', controls: 2 },
    ]);
  });
  it('is unavailable with an explanatory note when no modernization map is injected', () => {
    const snapshot = analyze([{ name: 'modern.pa.yaml', content: modernApp }], {
      ...ANALYZER_CATALOG_DATA, modernization: undefined,
    });
    expect(buildModernizationInventory(snapshot)).toEqual({
      state: 'unavailable', note: 'The injected catalog has no modernization map.',
    });
  });
});

it('M7d inventories FluentV9 candidates alongside unchanged classic rows', () => {
  const content = fixture + '      - oldText:\n          Control: Text\n          Properties:\n            FontColor: =Color.Red\n            Weight: ="Semibold"\n            Size: =15\n'
    + '      - oldTabs:\n          Control: TabList\n          Properties:\n            DefaultSelectedItems: =Table({Value: "A"})\n'
    + '      - oldInput:\n          Control: TextInput\n          Properties:\n            Value: ="Ready"\n'
    + '      - reader:\n          Control: ModernText\n          Properties:\n            Text: =oldInput.Value\n';
  const rows = rowsFor(content);
  expect(rows.find(row => row.source_type === 'Text')).toMatchObject({ target_type: 'ModernText', controls: 1, mechanical: 1, needs_review: 0, authored: { same: 1, renamed: 2 } });
  expect(rows.find(row => row.source_type === 'TabList')).toMatchObject({ target_type: 'ModernTabList', controls: 1, mechanical: 0, needs_review: 1, authored: { manual: 1 }, review_reasons: [{ property: 'DefaultSelectedItems', controls: 1 }] });
  expect(rows.find(row => row.source_type === 'TextInput')).toMatchObject({ target_type: 'ModernTextInput', reference_rewrites: 1 });
  expect(rows.filter(row => row.source_type === 'Label' || row.source_type.startsWith('Classic/'))).toEqual(rowsFor());
});
