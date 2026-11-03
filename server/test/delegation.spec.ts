import { describe, expect, it } from 'vitest';
import { extractBoundSource, LINT_RULES, runLintRules, type LintContext, type LintRule } from '../src/lib/lint';
import {
  hasAuthoritativeBackend,
  resolveDatasourceFromExportMetadata,
  resolveDatasourceReference,
} from '../src/core/datasource';
import { walkPaYaml } from '../src/lib/validator';
import { validateYaml } from '../src/tools/validator';

// Canonical compile-path App shape: properties nested under `Properties:`.
const CLEAN_APP = `App:
  Properties:
    OnStart: =false
`;

const toolBody = (datasources?: Record<string, unknown>) => {
  const result = validateYaml.handler({
    files: [{ name: 'App.pa.yaml', content: CLEAN_APP }],
    ...(datasources === undefined ? {} : { datasources }),
  } as never);
  return { result, body: result.isError ? null : JSON.parse(result.content[0].text) };
};

describe('extractBoundSource', () => {
  it.each([
    ['=Accounts', 'Accounts'],
    ['=Möten', 'Möten'],
    ['=Förfrågningar', 'Förfrågningar'],
    ['=Offertrader', 'Offertrader'],
    ['=Artiklar', 'Artiklar'],
    ['=Leveransrader', 'Leveransrader'],
    ['=Kontrollrapporter', 'Kontrollrapporter'],
    ['=Anställda', 'Anställda'],
    ["='Project Tasks'", 'Project Tasks'],
    ["='My-Source'", 'My-Source'],
    ["='My.Source'", 'My.Source'],
    ['=Filter(Accounts, Active = true)', 'Accounts'],
    ['=SortByColumns(Filter(Orders, Status = "Open"), "CreatedOn")', 'Orders'],
    ["=Sort(Search('Project Tasks', txtSearch.Value, Title), CreatedOn)", 'Project Tasks'],
    ["=Sort(SortByColumns(Search(Filter('Project Tasks', a), b, C), \"d\"), e)", 'Project Tasks'],
    ['=LookUp(Möten, x = 1)', 'Möten'],
    ['=FirstN(Artiklar, 10)', 'Artiklar'],
    ['=First(Förfrågningar)', 'Förfrågningar'],
    ['=Last(Offertrader)', 'Offertrader'],
    ['=LastN(Leveransrader, 10)', 'Leveransrader'],
    ['=AddColumns(Kontrollrapporter, Extra, 1)', 'Kontrollrapporter'],
    ['=ShowColumns(Anställda, Name)', 'Anställda'],
    ['=Global', 'Global'],
    ['=location', 'location'],
    ['=collection', 'collection'],
  ])('extracts a conservative bound source from %s', (value, expected) => {
    expect(extractBoundSource(value)).toBe(expected);
  });

  it.each([
    ['=Table({a:1})'],
    ['=Choices(Accounts.Status)'],
    ['=colCache'],
    ['=varSelectedAccounts'],
    ['=gblOrders'],
    ['=locSelected'],
    ['=[@Accounts]'],
    ['=Gallery1.AllItems'],
    ['=ThisItem.Orders'],
    ['=Office365Users.MyProfileV2()'],
    ['=Search(Gallery1.AllItems, txt.Value, Title)'],
    ["='Accounts'Extra"],
    ['=filter(Accounts, Active = true)'],
    ['=If(showAll, Accounts, Filter(Accounts, Active))'],
  ])('skips non-source-shaped expression %s', (value) => {
    expect(extractBoundSource(value)).toBeNull();
  });

  it('lets explicit input override an advisory naming convention', () => {
    expect(extractBoundSource('=gbl_Orders')).toBeNull();
    expect(extractBoundSource('=gbl_Orders', { gbl_Orders: 'sharepoint' })).toBe('gbl_Orders');
  });
});

describe('DatasourceReference resolution', () => {
  it('resolves explicit input with high confidence', () => {
    expect(resolveDatasourceReference('Accounts', {
      datasources: { Accounts: 'dataverse' },
    })).toEqual({
      authoredName: 'Accounts',
      backend: 'dataverse',
      resolvedBy: 'explicit-input',
      confidence: 'high',
    });
  });

  it('keeps naming conventions advisory and unable to prove a backend', () => {
    const reference = resolveDatasourceReference('gbl_Orders');
    expect(reference).toEqual({
      authoredName: 'gbl_Orders',
      backend: 'collection',
      resolvedBy: 'naming-convention',
      confidence: 'low',
    });
    expect(hasAuthoritativeBackend(reference, 'collection')).toBe(false);
  });

  it('ships export metadata as an explicit unresolved stub', () => {
    expect(resolveDatasourceFromExportMetadata('Accounts', { connector: 'dataverse' })).toEqual({
      authoredName: 'Accounts',
      resolvedBy: 'unresolved',
      confidence: 'none',
    });
    expect(resolveDatasourceReference('Accounts')).toEqual({
      authoredName: 'Accounts',
      resolvedBy: 'unresolved',
      confidence: 'none',
    });
  });
});

describe('validate_yaml datasources plumbing', () => {
  it('accepts an allowed map and makes it available to lint rules', () => {
    const probe: LintRule = {
      id: 'test-datasource-context',
      level: 'WARN',
      docRef: 'test only',
      check(bundle, context) {
        if (context.datasources?.Accounts !== 'dataverse') return [];
        const control = bundle.app[0];
        return [{
          level: 'WARN',
          file: control.file,
          line: control.line,
          control: control.name,
          type: control.type ?? 'unknown',
          rule: this.id,
          detail: 'datasource context reached the lint rule',
        }];
      },
    };
    LINT_RULES.push(probe);

    try {
      const { result, body } = toolBody({ Accounts: 'dataverse', Cache: 'collection' });

      expect(result.isError).not.toBe(true);
      expect(body.issues.warn).toContainEqual(expect.objectContaining({
        rule: 'test-datasource-context',
      }));
    } finally {
      expect(LINT_RULES.pop()).toBe(probe);
    }
  });

  it('rejects an unknown datasource type with the complete allowed-value list', () => {
    const { result } = toolBody({ Accounts: 'oracle' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid datasources value for 'Accounts': 'oracle'");
    expect(result.content[0].text).toContain('dataverse, sharepoint, sql, excel, collection, other');
  });

  it('threads each map explicitly and defaults a following map-absent call cleanly', () => {
    const seenContexts: LintContext[] = [];
    const probe: LintRule = {
      id: 'test-datasource-context-isolation',
      level: 'WARN',
      docRef: 'test only',
      check(bundle, context) {
        seenContexts.push(context);
        const control = bundle.app[0];
        return [{
          level: 'WARN',
          file: control.file,
          line: control.line,
          control: control.name,
          type: control.type ?? 'unknown',
          rule: this.id,
          detail: context.datasources
            ? `datasources: ${JSON.stringify(context.datasources)}`
            : 'datasources: absent',
        }];
      },
    };
    LINT_RULES.push(probe);

    try {
      const mapped = toolBody({ Accounts: 'dataverse' });
      const absent = toolBody();

      expect(mapped.result.isError).not.toBe(true);
      expect(absent.result.isError).not.toBe(true);
      expect(mapped.body.issues.warn).toContainEqual(expect.objectContaining({
        rule: 'test-datasource-context-isolation',
        detail: 'datasources: {"Accounts":"dataverse"}',
      }));
      expect(absent.body.issues.warn).toContainEqual(expect.objectContaining({
        rule: 'test-datasource-context-isolation',
        detail: 'datasources: absent',
      }));
      expect(seenContexts).toHaveLength(2);
      expect(seenContexts[0].datasources?.Accounts).toBe('dataverse');
      expect(Object.getPrototypeOf(seenContexts[0].datasources!)).toBeNull();
      expect(seenContexts[0].datasources?.constructor).toBeUndefined();
      expect(seenContexts[0].datasources?.toString).toBeUndefined();
      expect(seenContexts[1].datasources).toBeUndefined();
    } finally {
      expect(LINT_RULES.pop()).toBe(probe);
    }
  });
});

// ─── Delegation rules ─────────────────────────────────────────────────────
const galleryWith = (props: string) => `- galX:
    Control: Gallery
    Properties:
${props.split('\n').map(line => `      ${line}`).join('\n')}
`;

const delegationIssues = (props: string, context?: LintContext) =>
  runLintRules(walkPaYaml(galleryWith(props), 't.pa.yaml'), context)
    .filter(candidate => candidate.rule?.startsWith('delegation-'));
const delegationRules = (props: string, context?: LintContext) =>
  delegationIssues(props, context).map(candidate => candidate.rule);

const sharepoint: LintContext = { datasources: { 'Möten': 'sharepoint' } };
const dataverse: LintContext = { datasources: { 'Möten': 'dataverse' } };
const collection: LintContext = { datasources: { 'Möten': 'collection' } };
const sql: LintContext = { datasources: { Ordrar: 'sql' } };
const excel: LintContext = { datasources: { Ark: 'excel' } };

describe('conditional delegation advice', () => {
  const oldAdvice = /StartsWith is (?:the delegable prefix search|SharePoint's delegable prefix search)|delegates either way|compare to Blank\(\) instead/;

  it('keeps unknown-source Search advice conditional without promising Excel delegation', () => {
    // The request is substring search: "art" should include "Cart". A prefix
    // alternative changes that request; this checks advice, not Power Fx runtime.
    const issues = delegationIssues('Items: =Search(Orders, "art", Title)');
    expect(issues.map(issue => issue.rule)).toEqual(['delegation-search-caveat']);
    expect(issues[0].detail).toContain('this checker has not established them');
    expect(issues[0].fix).toContain('only if prefix matching meets the request');
    expect(issues[0].fix).toContain('connector and column type support delegation');
    expect(issues[0].fix).toContain('prefix and substring matching are not equivalent');
    expect(issues[0].fix).toContain('StartsWith does not make Excel queries delegable');
    expect(`${issues[0].detail} ${issues[0].fix}`).not.toMatch(oldAdvice);
    const mapped = delegationIssues('Items: =Search(Ark, "art", Title)', excel);
    expect(mapped.map(issue => issue.rule)).toEqual(['delegation-excel-any']);
    expect(mapped[0].fix).not.toContain('StartsWith');
  });

  it.each([
    [{ datasources: { Möten: 'sharepoint' } }, 'explicit-input', 'high'],
    [{ exportDatasources: { Möten: 'sharepoint' } }, 'export-metadata', 'medium'],
  ] as const)('conditions SharePoint prefix advice while preserving %s provenance', (context, resolvedBy, confidence) => {
    const issues = delegationIssues('Items: =Search(Möten, "art", Titel)', context);
    expect(issues.map(issue => issue.rule)).toEqual(['delegation-sharepoint-search']);
    expect(issues[0].detail).toContain('SharePoint does not support delegation of Search');
    expect(issues[0].fix).toContain('only if prefix matching meets the request');
    expect(issues[0].fix).toContain('SharePoint column type supports delegation');
    expect(issues[0].fix).toContain('prefix and substring matching are not equivalent');
    expect(`${issues[0].detail} ${issues[0].fix}`).not.toMatch(oldAdvice);
    expect(issues[0].evidence).toMatchObject({ kind: 'bound-source', backend: 'sharepoint', resolvedBy, confidence });
  });

  it.each(['Titel', 'varSearch', '""'])('keeps SharePoint IsBlank(%s) as a conditional pattern warning', value => {
    const issues = delegationIssues(`Items: =Filter(Möten, IsBlank(${value}))`, sharepoint);
    expect(issues.map(issue => issue.rule)).toEqual(['delegation-sharepoint-isblank']);
    expect(issues[0].detail).toContain('has not established whether the tested value depends on each source row');
    expect(issues[0].fix).toContain('if the tested value is a column, check column support');
    expect(issues[0].fix).toContain('connector delegation support');
    expect(issues[0].fix).toContain('= Blank() does not treat empty strings as blank, unlike IsBlank');
    expect(issues[0].fix).toContain('no automatic replacement');
    expect(`${issues[0].detail} ${issues[0].fix}`).not.toMatch(oldAdvice);
    expect(issues[0].evidence).toMatchObject({ backend: 'sharepoint', resolvedBy: 'explicit-input', confidence: 'high' });
  });

  it.each(['Status', 'varSearch', '""'])('keeps SQL IsBlank(%s) unverified without a fallback assurance', value => {
    const issues = delegationIssues(`Items: =Filter(Ordrar, IsBlank(${value}))`, sql);
    expect(issues.map(issue => issue.rule)).toEqual(['delegation-sql-isblank']);
    expect(issues[0].detail).toContain('unverified and queued for tenant verification');
    expect(issues[0].detail).toContain('verification queue');
    expect(issues[0].detail).toContain('has not established whether the tested value depends on each source row');
    expect(issues[0].fix).toContain('establish row dependence, column type and connector support');
    expect(issues[0].fix).toContain('if the tested value is a column, check column support');
    expect(issues[0].fix).toContain('= Blank() does not treat empty strings as blank, unlike IsBlank');
    expect(issues[0].fix).toContain('no automatic replacement or delegation assurance');
    expect(`${issues[0].detail} ${issues[0].fix}`).not.toMatch(oldAdvice);
    expect(issues[0].evidence).toMatchObject({ backend: 'sql', resolvedBy: 'explicit-input', confidence: 'high' });
  });
});

describe('delegation core rules (source-agnostic)', () => {
  it('delegation-firstn-on-source fires on FirstN/Last/LastN over a bound source in an Items-class property', () => {
    expect(delegationRules('Items: =FirstN(Möten, 10)')).toContain('delegation-firstn-on-source');
    expect(delegationRules('Items: =LastN(Möten, 10)')).toContain('delegation-firstn-on-source');
    expect(delegationRules('Items: =Last(Möten)')).toContain('delegation-firstn-on-source');
    expect(delegationRules('Default: =FirstN(Möten, 1)')).toContain('delegation-firstn-on-source');
    expect(delegationIssues('Items: =FirstN(Möten, 10)')[0].detail).toContain("'Möten'");
  });

  it('delegation-firstn-on-source skips plain references, collections, dotted refs and other properties', () => {
    expect(delegationRules('Items: =Möten')).toEqual([]);
    expect(delegationRules('Items: =FirstN(colCache, 10)')).toEqual([]);
    expect(delegationRules('Items: =FirstN(gblOrders, 10)')).toEqual([]);
    expect(delegationRules('Items: =FirstN(locSelected, 10)')).toEqual([]);
    expect(delegationRules('Items: =FirstN(Gallery1.AllItems, 10)')).toEqual([]);
    expect(delegationRules('Text: =FirstN(Möten, 10)')).toEqual([]);
    expect(delegationRules('Items: =FirstN(Möten, 10)', collection)).toEqual([]);
  });

  it('delegation-forall-writes fires on ForAll over a bound source with a write in the body', () => {
    expect(delegationRules('OnSelect: =ForAll(Möten, Patch(Förfrågningar, ThisRecord))'))
      .toContain('delegation-forall-writes');
    expect(delegationRules('OnSelect: =ForAll(Möten, Remove(Förfrågningar, ThisRecord))'))
      .toContain('delegation-forall-writes');
  });

  it('delegation-forall-writes skips read-only ForAll bodies, collections and non-source iterations', () => {
    expect(delegationRules('OnSelect: =ForAll(Möten, Notify(ThisRecord.Titel))'))
      .toEqual(['delegation-forall-truncation']);
    expect(delegationRules('OnSelect: =ForAll(colRows, Patch(Förfrågningar, ThisRecord))')).toEqual([]);
    expect(delegationRules('OnSelect: =ForAll(Sequence(10), Patch(Förfrågningar, ThisRecord))')).toEqual([]);
    expect(delegationRules('OnSelect: =ForAll(Möten, Patch(Förfrågningar, ThisRecord))', collection)).toEqual([]);
  });

  it('delegation-search-caveat fires for any source the datasources map does not cover', () => {
    const search = 'Items: =Search(Möten, txtSearch.Value, Titel)';
    expect(delegationRules(search)).toEqual(['delegation-search-caveat']);
    expect(delegationIssues(search)[0].detail).toContain('supply `datasources`');
    expect(delegationIssues(search)[0].detail).toContain('matches none of the known variable prefixes (col, var, gbl, loc)');
    expect(delegationRules(search, dataverse)).toEqual([]);
    // Map supplied but THIS source unmapped: the caveat still applies — a partial
    // map must not silence the family (v2.4 review Fix 4).
    expect(delegationRules(search, { datasources: { Annat: 'sql' } })).toEqual(['delegation-search-caveat']);
    expect(delegationRules(search, { datasources: {} })).toEqual(['delegation-search-caveat']);
    expect(delegationRules(search, sharepoint)).toEqual(['delegation-sharepoint-search']);
    expect(delegationRules(search, collection)).toEqual([]);
  });

  it('delegation-search-caveat never fires on plain or in-memory references', () => {
    expect(delegationRules('Items: =Möten')).toEqual([]);
    expect(delegationRules('Items: =Search(Gallery1.AllItems, txtSearch.Value, Titel)')).toEqual([]);
    expect(delegationRules('Items: =Search(colCache, txtSearch.Value, Titel)')).toEqual([]);
  });
});

describe('delegation source-specific rules (require the datasources map)', () => {
  it('uses explicit provenance over a conflicting in-memory naming convention', () => {
    const search = 'Items: =Search(gbl_Orders, txtSearch.Value, Titel)';
    expect(delegationRules(search)).toEqual([]);
    expect(delegationRules(search, { datasources: { gbl_Orders: 'sharepoint' } }))
      .toEqual(['delegation-sharepoint-search']);

    const prefixedWrite = 'OnSelect: =ForAll(colCoverageOrders, Patch(colCoverageOrders, ThisRecord))';
    expect(delegationRules(prefixedWrite)).toEqual([]);
    expect(delegationRules(prefixedWrite, { datasources: { colCoverageOrders: 'sharepoint' } }))
      .toEqual(['delegation-forall-writes', 'delegation-forall-truncation']);
  });

  it('delegation-sharepoint-search fires on Search over a sharepoint source only', () => {
    const search = 'Items: =Search(Möten, txtSearch.Value, Titel)';
    expect(delegationRules(search, sharepoint)).toEqual(['delegation-sharepoint-search']);
    expect(delegationRules(search, dataverse)).toEqual([]);
    expect(delegationRules('Items: =Möten', sharepoint)).toEqual([]);
  });

  it('delegation-sharepoint-in fires on in/exactin/Not/!/EndsWith predicates', () => {
    expect(delegationRules('Items: =Filter(Möten, txtSearch.Value in Titel)', sharepoint))
      .toContain('delegation-sharepoint-in');
    expect(delegationRules('Items: =Filter(Möten, txtSearch.Value exactin Titel)', sharepoint))
      .toContain('delegation-sharepoint-in');
    expect(delegationRules('Items: =Filter(Möten, Not(Klar))', sharepoint))
      .toContain('delegation-sharepoint-in');
    expect(delegationRules('Items: =Filter(Möten, !Klar)', sharepoint))
      .toContain('delegation-sharepoint-in');
    expect(delegationRules('Items: =Filter(Möten, EndsWith(Titel, "x"))', sharepoint))
      .toContain('delegation-sharepoint-in');
    expect(delegationRules('Text: =LookUp(Möten, txtSearch.Value in Titel, Titel)', sharepoint))
      .toContain('delegation-sharepoint-in');
  });

  it('delegation-sharepoint-in skips delegable predicates, string literals and quoted column names', () => {
    expect(delegationRules('Items: =Filter(Möten, StartsWith(Titel, txtSearch.Value))', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, Titel = "check in")', sharepoint)).toEqual([]);
    expect(delegationRules("Items: =Filter(Möten, 'Check in date' = Today())", sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, Titel <> "x")', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, txtSearch.Value in Titel)', dataverse)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, txtSearch.Value in Titel)')).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, txtSearch.Value in Titel)', collection)).toEqual([]);
  });

  it('delegation-sharepoint-isblank fires on IsBlank, not on = Blank()', () => {
    expect(delegationRules('Items: =Filter(Möten, IsBlank(Titel))', sharepoint))
      .toContain('delegation-sharepoint-isblank');
    expect(delegationRules('Items: =Filter(Möten, Titel = Blank())', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, IsBlank(Titel))', dataverse)).toEqual([]);
  });

  it('delegation-sharepoint-text-functions fires on a text function wrapping a bare column', () => {
    expect(delegationRules('Items: =Filter(Möten, Lower(Titel) = "abc")', sharepoint))
      .toContain('delegation-sharepoint-text-functions');
    expect(delegationRules('Items: =Filter(Möten, Len(Titel) > 3)', sharepoint))
      .toContain('delegation-sharepoint-text-functions');
    expect(delegationRules('Items: =Filter(Möten, Titel = Lower(txtSearch.Value))', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, Len(varSearch) > 3)', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, Lower(Titel) = "abc")', dataverse)).toEqual([]);
  });

  it('delegation-sharepoint-id-operator fires on ID comparisons other than =', () => {
    expect(delegationRules('Items: =Filter(Möten, ID > 100)', sharepoint))
      .toContain('delegation-sharepoint-id-operator');
    expect(delegationRules('Items: =Filter(Möten, ID <> 100)', sharepoint))
      .toContain('delegation-sharepoint-id-operator');
    expect(delegationRules('Items: =Filter(Möten, ID = 100)', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, KundID > 100)', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, Nummer > ThisItem.ID)', sharepoint)).toEqual([]);
    expect(delegationRules('Items: =Filter(Möten, ID > 100)', dataverse)).toEqual([]);
  });

  it('delegation-sql-isblank fires on IsBlank over a sql source only', () => {
    expect(delegationRules('Items: =Filter(Ordrar, IsBlank(Status))', sql))
      .toEqual(['delegation-sql-isblank']);
    expect(delegationRules('Items: =Filter(Ordrar, Status = Blank())', sql)).toEqual([]);
    expect(delegationRules('Items: =Filter(Ordrar, IsBlank(Status))', { datasources: { Ordrar: 'dataverse' } }))
      .toEqual([]);
    expect(delegationRules('Items: =Filter(Ordrar, IsBlank(Status))', { datasources: { Ordrar: 'collection' } }))
      .toEqual([]);
  });

  it('delegation-excel-any fires on any query over an excel source', () => {
    expect(delegationRules('Items: =Filter(Ark, Klar = true)', excel)).toEqual(['delegation-excel-any']);
    expect(delegationRules('Items: =Sort(Ark, Titel)', excel)).toEqual(['delegation-excel-any']);
    expect(delegationRules('Items: =SortByColumns(Ark, "Titel")', excel)).toEqual(['delegation-excel-any']);
    expect(delegationRules('Text: =LookUp(Ark, Nummer = 1, Titel)', excel)).toEqual(['delegation-excel-any']);
    expect(delegationRules('Items: =Ark', excel)).toEqual([]);
    expect(delegationRules('Items: =Filter(Ark, Klar = true)', { datasources: { Ark: 'dataverse' } })).toEqual([]);
  });

  it('excludes a collection-mapped name from every delegation rule', () => {
    for (const props of [
      'Items: =FirstN(Möten, 10)',
      'Items: =Search(Möten, txtSearch.Value, Titel)',
      'Items: =Filter(Möten, txtSearch.Value in Titel)',
      'Items: =Filter(Möten, IsBlank(Titel))',
      'Items: =Filter(Möten, Lower(Titel) = "abc")',
      'Items: =Filter(Möten, ID > 100)',
      'OnSelect: =ForAll(Möten, Patch(Förfrågningar, ThisRecord))',
    ]) {
      expect(delegationRules(props, collection)).toEqual([]);
    }
  });
});

// Each case below is CORRECT Power Apps code that the shipped rules warned on.
// A false WARN on correct code erodes the gate's authority, so every one of these
// keeps a paired true-positive assertion right next to it.
describe('no-false-WARN guards (v2.4 review fixes)', () => {
  const anstallda: LintContext = { datasources: { Anstallda: 'sharepoint' } };

  it('Fix 2: formula-shaped text inside a string literal or a comment is inert', () => {
    // Prose that merely mentions a query.
    expect(delegationRules('Text: ="Use Search(Products, x) to search"')).toEqual([]);
    // The same call for real still fires.
    expect(delegationRules('Items: =Search(Artiklar, txtSearch.Value, Titel)'))
      .toEqual(['delegation-search-caveat']);

    // A `//` comment inside a block-scalar predicate (the word "in" is prose here).
    const commented = `Items: |-
  =Filter(
    Möten,   // only the ones in scope
    Klar = true
  )`;
    expect(delegationRules(commented, sharepoint)).toEqual([]);
    // A `/* */` comment does not leak either.
    expect(delegationRules('Items: =Filter(Möten, /* in scope */ Klar = true)', sharepoint)).toEqual([]);
    // Single-quoted identifiers are NOT inert — a quoted source name still resolves.
    expect(delegationRules("Items: =Search('Anställda Lista', txtSearch.Value, Titel)",
      { datasources: { 'Anställda Lista': 'sharepoint' } })).toEqual(['delegation-sharepoint-search']);
    // …and the real `in` predicate is still caught next to a comment.
    expect(delegationRules(`Items: |-
  =Filter(
    Möten,   // scope note
    txtSearch.Value in Titel
  )`, sharepoint)).toEqual(['delegation-sharepoint-in']);
  });

  it('Fix 3: a ForAll that only shapes a collection performs no server writes', () => {
    // Collection destinations avoid server-write warnings; source iteration can still truncate.
    expect(delegationRules('OnSelect: =ForAll(Bokningar, Collect(colFlat, ThisRecord))'))
      .toEqual(['delegation-forall-truncation']);
    expect(delegationRules('OnSelect: =ForAll(Bokningar, ClearCollect(colFlat, ThisRecord))'))
      .toEqual(['delegation-forall-truncation']);
    expect(delegationRules('OnSelect: =ForAll(Bokningar, Collect(Cache, ThisRecord))',
      { datasources: { Cache: 'collection' } })).toEqual(['delegation-forall-truncation']);
    // A write to a real source still fires…
    expect(delegationRules('OnSelect: =ForAll(Möten, Patch(Förfrågningar, ThisRecord))'))
      .toEqual(['delegation-forall-writes', 'delegation-forall-truncation']);
    // …including when a collection write sits beside it.
    expect(delegationRules('OnSelect: =ForAll(Möten, If(true, Collect(colLog, ThisRecord), Patch(Förfrågningar, ThisRecord)))'))
      .toEqual(['delegation-forall-writes', 'delegation-forall-truncation']);
  });

  it('Fix 5: the documented In-Out pattern (query over an already-reduced set) stays silent', () => {
    const inOut = `Items: |-
  =Filter(
    Filter(Anstallda, Created > DateAdd(Today(), -30, Days)),
    Lower(Title) = Lower(txtSearch.Text)
  )`;
    expect(delegationRules(inOut, anstallda)).toEqual([]);
    // The same text predicate applied straight to the raw source still fires.
    expect(delegationRules('Items: =Filter(Anstallda, Lower(Title) = "abc")', anstallda))
      .toEqual(['delegation-sharepoint-text-functions']);
  });

  it('Fix 6: a text function in value position is not a column', () => {
    expect(delegationRules('Items: =Filter(Anstallda, StartsWith(Title, Trim(SearchText)))', anstallda)).toEqual([]);
    expect(delegationRules('Items: =Filter(Anstallda, Title = Upper(SearchText))', anstallda)).toEqual([]);
    // Column position — first argument of StartsWith, or left of a comparison.
    expect(delegationRules('Items: =Filter(Anstallda, StartsWith(Trim(Title), "abc"))', anstallda))
      .toEqual(['delegation-sharepoint-text-functions']);
    expect(delegationRules('Items: =Filter(Anstallda, Len(Title) > 3)', anstallda))
      .toEqual(['delegation-sharepoint-text-functions']);
  });

  it('Fix 10: FirstN over a delegable query chain is the top-N idiom, not the anti-pattern', () => {
    // The server already filtered and sorted, so the first N rows ARE the top N
    // within the row limit — warning on this is noise (shipped in
    // templates/screen-table-template-1.yaml).
    expect(delegationRules('Items: =FirstN(Sort(Filter(Möten, Klar = true), Datum), 10)')).toEqual([]);
    expect(delegationRules('Items: =FirstN(Filter(Möten, Klar = true), 10)')).toEqual([]);
    expect(delegationRules('Items: =LastN(SortByColumns(Möten, "Datum"), 10)')).toEqual([]);
    expect(delegationRules('Items: =Last(Sort(Möten, Datum))')).toEqual([]);
    // A Search-wrapped chain: firstn is silent, and only Search's own caveat is left.
    expect(delegationRules('Items: =FirstN(Search(Möten, txtSearch.Value, Titel), 10)'))
      .toEqual(['delegation-search-caveat']);
    // The real anti-pattern — N rows out of an arbitrary page of a raw source — still fires.
    expect(delegationRules('Items: =FirstN(Möten, 10)')).toEqual(['delegation-firstn-on-source']);
    expect(delegationRules('Items: =LastN(Möten, 10)')).toEqual(['delegation-firstn-on-source']);
    expect(delegationRules('Items: =Last(Möten)')).toEqual(['delegation-firstn-on-source']);
    // AddColumns/ShowColumns are shaping, not server-side reduction: still the raw-source shape.
    expect(delegationRules('Items: =FirstN(AddColumns(Möten, Extra, 1), 10)'))
      .toEqual(['delegation-firstn-on-source']);
  });

  it('Fix 7: the SQL IsBlank finding is worded as an unverified catalog claim', () => {
    const issues = delegationIssues('Items: =Filter(Ordrar, IsBlank(Status))', sql);

    expect(issues.map(issue => issue.rule)).toEqual(['delegation-sql-isblank']);
    expect(issues[0].detail).toContain('unverified');
    expect(issues[0].detail).toContain('queued for tenant verification');
    expect(issues[0].fix).toContain('no automatic replacement or delegation assurance');
  });
});

describe('delegation end-to-end through validate_yaml', () => {
  const SWEDISH_SCREEN = `Screens:
  VisitsScreen:
    Children:
      - galVisits:
          Control: Gallery
          Properties:
            Items: =Filter(Möten, txtSearch.Value in Titel)
`;

  const run = (datasources?: Record<string, unknown>) => {
    const result = validateYaml.handler({
      files: [{ name: 'Visits.pa.yaml', content: SWEDISH_SCREEN }],
      ...(datasources === undefined ? {} : { datasources }),
    } as never);
    const body = JSON.parse(result.content[0].text);
    return {
      body,
      delegation: body.issues.warn.filter((issue: { rule?: string }) => issue.rule?.startsWith('delegation-')),
    };
  };

  it('sharpens a SharePoint-mapped Swedish source and keeps the non-ASCII name intact', () => {
    const { body, delegation } = run({ 'Möten': 'sharepoint' });

    expect(delegation.map((issue: { rule: string }) => issue.rule)).toEqual(['delegation-sharepoint-in']);
    expect(delegation[0].detail).toContain("'Möten'");
    expect(delegation[0].file).toBe('Visits.pa.yaml');
    expect(body.gate_decision).toBe('PROCEED_WITH_WARNINGS');
    expect(body.summary.refuse).toBe(0);
  });

  it('stays source-agnostic for the same screen with no map', () => {
    const { body, delegation } = run();

    expect(delegation).toEqual([]);
    expect(body.summary.refuse).toBe(0);
  });
});
