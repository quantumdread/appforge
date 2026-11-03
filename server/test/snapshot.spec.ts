import { describe, it, expect } from 'vitest';
import { analyze, validateFiles } from '../src/lib/validator';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const file = (content: string) => [{ name: 'a.pa.yaml', content }];

function propertyFile(formula: string, property = 'OnSelect') {
  return file(`Screens:
  Main:
    Children:
      - subject:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Subject"
            ${property}: |-
${formula.split('\n').map(line => `              ${line}`).join('\n')}
`);
}

const CLEAN = `Screens:
  Main:
    Children:
      - btnGo:
          Control: ModernButton
          Properties:
            Text: ="Go"
            OnSelect: =Back()
`;
const WARNING = `Screens:
  Main:
    Children:
      - lblOne:
          Control: Label
          Properties:
            Text: ="hi"
            TabIndex: =3
`;
const REFUSING = `Screens:
  Main:
    Children:
      - lblOne:
          Control: NoSuchControlType
          Properties:
            Text: ="hi"
`;

describe('gate decision', () => {
  it('is CLEAR with no findings', () => {
    expect(validateFiles(file(CLEAN)).gateDecision).toBe('CLEAR');
  });

  it('is PROCEED_WITH_WARNINGS with warnings only', () => {
    const result = validateFiles(file(WARNING));
    expect(result.summary.refuse).toBe(0);
    expect(result.summary.warn).toBeGreaterThan(0);
    expect(result.gateDecision).toBe('PROCEED_WITH_WARNINGS');
  });

  it('is BLOCK when anything refuses', () => {
    expect(validateFiles(file(REFUSING)).gateDecision).toBe('BLOCK');
  });
});

describe('analyze() snapshot', () => {
  const yaml = `Screens:
  Main:
    Children:
      - btnGo:
          Control: ModernButton
          Properties:
            Text: ="Go"
`;

  it('returns validation identical to validateFiles for the same input', () => {
    const snapshot = analyze(file(yaml), ANALYZER_CATALOG_DATA);
    const direct = validateFiles(file(yaml));
    expect(snapshot.validation.summary).toEqual(direct.summary);
    expect(snapshot.validation.issues).toEqual(direct.issues);
    expect(snapshot.validation.gateDecision).toBe(direct.gateDecision);
  });

  it('exposes the validated bundle, source lines and catalog metadata', () => {
    const now = Date.parse(ANALYZER_CATALOG_DATA.extractedAt) + (3.5 * 86_400_000);
    const snapshot = analyze(file(yaml), ANALYZER_CATALOG_DATA, { now: () => now });
    expect(snapshot.bundle).toBe(snapshot.validation.bundle);
    expect(snapshot.bundle.screens.map(screen => screen.name)).toEqual(['Main']);
    expect(snapshot.files).toHaveLength(1);
    expect(snapshot.files[0].id).toBe('a.pa.yaml');
    expect(snapshot.files[0].lines[0]).toBe('Screens:');
    expect(snapshot.catalogMetadata.catalogVersion).toBe(ANALYZER_CATALOG_DATA.catalogVersion);
    expect(snapshot.catalogMetadata.extractedAt).toBe(ANALYZER_CATALOG_DATA.extractedAt);
    expect(snapshot.catalogMetadata.stalenessDays).toBe(3);
    expect(snapshot.catalogMetadata.versionKnowledge)
      .toBe(ANALYZER_CATALOG_DATA.versionKnowledge);
    expect(snapshot.catalogMetadata.evidenceClasses)
      .toBe(ANALYZER_CATALOG_DATA.evidenceClasses);
  });

  it('carries coverage counters from validation', () => {
    const snapshot = analyze(file(yaml), ANALYZER_CATALOG_DATA);
    expect(snapshot.coverage).toBe(snapshot.validation.coverage);
    expect(snapshot.coverage.tiers.extractor_verified).toBeGreaterThan(0);
  });

  it('collects a clean Items binding without depending on a warning', () => {
    const content = `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Orders
            AccessibleLabel: ="Orders"
`;
    const snapshot = analyze(file(content), ANALYZER_CATALOG_DATA);
    const direct = validateFiles(file(content));

    expect(snapshot.validation.issues.filter(issue => issue.level !== 'PASS')).toEqual([]);
    expect(snapshot.validation.summary).toEqual(direct.summary);
    expect(snapshot.validation.issues).toEqual(direct.issues);
    expect(snapshot.validation.gateDecision).toBe('CLEAR');
    expect(snapshot.datasourceReferences).toEqual([
      { authoredName: 'Orders', resolvedBy: 'unresolved', confidence: 'none' },
    ]);
  });

  it('collects exact first-argument targets and nested wrappers across parsed properties', () => {
    const files = propertyFile(`=Filter(Orders, Active);
Search('Open Orders', "text", Title);
LookUp(Customers, Active);
Sort(SortRows, Title);
SortByColumns(SortColumnsRows, "Title");
First(FirstRows);
FirstN(FirstNRows, 5);
Last(LastRows);
LastN(LastNRows, 5);
Patch(WriteRows, Defaults(WriteRows), {Title: "new"});
Collect(colCache, First(RemoteRows));
ClearCollect(colFresh, Search(OtherRows, "text", Title));
Remove(RemoveRows, First(RemoveRows));
RemoveIf(RemoveIfRows, true);
ShowColumns(ShowRows, Title);
AddColumns(AddRows, Value, 1);
fIrStN(sOrTbYcOlUmNs(fIlTeR('O''Brien Orders', Active), "Title"), 5);
Patch(Orders, Defaults(Orders), {});`);
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences.map(reference => reference.authoredName)).toEqual([
      'AddRows', 'Customers', 'FirstNRows', 'FirstRows', 'LastNRows', 'LastRows',
      "O'Brien Orders", 'Open Orders', 'Orders', 'OtherRows', 'RemoteRows', 'RemoveIfRows',
      'RemoveRows', 'ShowRows', 'SortColumnsRows', 'SortRows', 'WriteRows', 'colCache', 'colFresh',
    ]);
    const direct = validateFiles(files);
    expect(snapshot.validation.summary).toEqual(direct.summary);
    expect(snapshot.validation.issues).toEqual(direct.issues);
    expect(snapshot.validation.gateDecision).toBe(direct.gateDecision);
  });

  it.each([
    ['With local scope', '=With({rows: Orders}, First(rows)); Patch(SafeRows, {}, {})', ['SafeRows']],
    ['ForAll local scope', '=ForAll(Orders, Collect(colRows, First(LocalRows))); First(SafeRows)', ['SafeRows']],
    ['As alias scope', '=First(Filter(Orders As row, true)); Collect(colScoped, Orders As row); First(SafeRows)', ['SafeRows']],
    ['row expressions', '=Filter(Orders, First(LocalRows).Enabled); LookUp(Customers, First(LocalCustomers).Enabled)', ['Customers', 'Orders']],
    ['all row-scope functions', '=Sort(SortRows, First(LocalSort)); AddColumns(AddRows, Value, First(LocalAdd)); RemoveIf(RemoveRows, First(LocalRemove))', ['AddRows', 'RemoveRows', 'SortRows']],
    ['wrapper first arguments', '=FirstN(Filter(Search(Orders, "text", Title), First(LocalRows).Enabled), 2)', ['Orders']],
    ['scope spellings in opaque tokens', '=First(Orders) /* With ForAll As */; First(\'With\'); First(\'As\'); Notify("ForAll(As);; With")', ['As', 'Orders', 'With']],
    ['partial tokenization', '=First(SafeRows); Filter(Orders, true', []],
    ['interpolation', '=First(SafeRows); Notify($"{First(HiddenRows)}")', []],
    ['locale double chaining', '=First(SafeRows);; First(Orders)', []],
    ['locale call separators', '=First(SafeRows); Filter(Orders; true)', []],
  ] as const)('conservatively bounds %s while retaining safe source candidates', (_label, formula, expected) => {
    const snapshot = analyze(propertyFile(formula), ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences.map(reference => reference.authoredName)).toEqual(expected);
  });

  it('collects calls only from formula values after YAML scalar decoding', () => {
    const files = file(`Screens:
  Main:
    Children:
      - quotedText:
          Control: Label
          Properties:
            Text: "First(QuotedTextRows)"
      - unquotedText:
          Control: Label
          Properties:
            Text: First(UnquotedTextRows)
      - quotedFormula:
          Control: Label
          Properties:
            Text: "=First(FormulaRows)"
`);
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences.map(reference => reference.authoredName)).toEqual(['FormulaRows']);
    const direct = validateFiles(files);
    expect(snapshot.validation.issues).toEqual(direct.issues);
    expect(snapshot.validation.summary).toEqual(direct.summary);
    expect(snapshot.validation.gateDecision).toBe(direct.gateDecision);
  });

  it.each([
    ['ordinary string', '="First(Orders); Filter(Customers, true)"', []],
    ['line comments preserve their newline boundary', '=First(Orders) // First(HiddenRows)\n; First(Customers)', ['Customers', 'Orders']],
    ['qualified function', '=Connector.Filter(Orders, true)', []],
    ['qualified function with comments', '=Connector. /* connector method */ Filter(Orders, true)', []],
    ['function prefix', '=FilterMore(Orders, true)', []],
    ['qualified source', '=First(Gallery1.Items)', []],
    ['source arithmetic', '=First(Orders + OtherRows)', []],
    ['unknown wrapper', '=First(UnknownWrapper(Orders))', []],
    ['record source', '=First({Rows: Orders})', []],
    ['table source', '=First([Orders])', []],
    ['global disambiguation', '=First([@Orders])', []],
    ['plain constants', '=First(true); First(FALSE); First(Blank)', []],
    ['quoted reserved names', '=First(\'true\'); First(\'Blank\')', ['Blank', 'true']],
    ['SubmitForm does not resolve a form binding', '=SubmitForm(frmOrders)', []],
    ['supported query within unknown wrapper', '=UnknownWrapper(First(Orders))', ['Orders']],
  ] as const)('does not invent sources for %s', (_label, formula, expected) => {
    const snapshot = analyze(propertyFile(formula), ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences.map(reference => reference.authoredName)).toEqual(expected);
  });

  it.each([
    ['Items', 'Orders', ['Orders']],
    ['Items', "'Open Orders'", ['Open Orders']],
    ['DataSource', "='O''Brien Orders'", ["O'Brien Orders"]],
    ['DataSource', '=Orders', ['Orders']],
    ['Items', '=Gallery1.Items', []],
    ['DataSource', '=Orders + OtherRows', []],
    ['Items', 'First(Orders)', []],
    ['Items', '="Orders"', []],
    ['Items', '=true', []],
  ] as const)('collects only whole binding names for %s: %s', (property, formula, expected) => {
    const snapshot = analyze(propertyFile(formula, property), ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences.map(reference => reference.authoredName)).toEqual(expected);
  });

  it('resolves exact authored spelling with explicit, export, naming and unresolved provenance', () => {
    const files = propertyFile('=First(Orders); First(orders); First(ExportRows); First(colOrders); First(colCache); First(Unresolved); First(__proto__)');
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA, {
      lintContext: {
        datasources: { Orders: 'sql', orders: 'sharepoint', colOrders: 'excel', Unused: 'dataverse', ['__proto__']: 'sql' },
        exportDatasources: { Orders: 'sharepoint', ExportRows: 'dataverse', colOrders: 'collection' },
      },
    });
    expect(snapshot.datasourceReferences).toEqual([
      { authoredName: 'ExportRows', backend: 'dataverse', resolvedBy: 'export-metadata', confidence: 'medium' },
      { authoredName: 'Orders', backend: 'sql', resolvedBy: 'explicit-input', confidence: 'high' },
      { authoredName: 'Unresolved', resolvedBy: 'unresolved', confidence: 'none' },
      { authoredName: '__proto__', backend: 'sql', resolvedBy: 'explicit-input', confidence: 'high' },
      { authoredName: 'colCache', backend: 'collection', resolvedBy: 'naming-convention', confidence: 'low' },
      { authoredName: 'colOrders', backend: 'excel', resolvedBy: 'explicit-input', confidence: 'high' },
      { authoredName: 'orders', backend: 'sharepoint', resolvedBy: 'explicit-input', confidence: 'high' },
    ]);
  });

  it('collects original App and component properties as well as their children', () => {
    const files = file(`App:
  Properties:
    OnStart: =First(AppRows)
ComponentDefinitions:
  Example:
    Properties:
      OnReset: =First(ComponentRows)
    Children:
      - galChild:
          Control: Gallery
          Properties:
            Items: =ChildRows
`);
    const snapshot = analyze(files, ANALYZER_CATALOG_DATA);
    expect(snapshot.datasourceReferences.map(reference => reference.authoredName)).toEqual([
      'AppRows', 'ChildRows', 'ComponentRows',
    ]);
  });
});
