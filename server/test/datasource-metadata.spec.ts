import { describe, expect, it } from 'vitest';
import { resolveDatasourceFromExportMetadata } from '../src/core/datasource';
import { validateFiles } from '../src/lib/validator';

const GALLERY = (items: string) => `Screens:
  Main:
    Children:
      - galOrders:
          Control: Gallery
          Properties:
            AccessibleLabel: ="Order"
            Items: ${items}
`;

describe('export-metadata datasource resolution', () => {
  it('unlocks source-specific rules at medium confidence via injected export metadata', () => {
    const result = validateFiles(
      [{ name: 'a.pa.yaml', content: GALLERY('=Search(Orders, txtQ.Text, "Namn")') }],
      { exportDatasources: { Orders: 'sharepoint' } },
    );
    const issue = result.issues.find(i => i.rule === 'delegation-sharepoint-search');
    expect(issue).toBeTruthy();
    expect(issue?.evidence).toMatchObject({
      kind: 'bound-source',
      resolvedBy: 'export-metadata',
      confidence: 'medium',
      backend: 'sharepoint',
    });
  });

  it('explicit --datasources beats export metadata for the same name', () => {
    const result = validateFiles(
      [{ name: 'a.pa.yaml', content: GALLERY('=Filter(Orders, IsBlank(Note))') }],
      {
        datasources: { Orders: 'sql' } satisfies Record<string, 'sql'>,
        exportDatasources: { Orders: 'sharepoint' },
      },
    );
    const sql = result.issues.find(i => i.rule === 'delegation-sql-isblank');
    expect(sql).toBeTruthy();
    expect(sql?.evidence).toMatchObject({
      resolvedBy: 'explicit-input',
      confidence: 'high',
      backend: 'sql',
    });
    expect(result.issues.find(i => i.rule === 'delegation-sharepoint-isblank')).toBeUndefined();
  });

  it('export metadata outranks the naming convention (spec §3 ladder)', () => {
    const result = validateFiles(
      [{ name: 'a.pa.yaml', content: GALLERY('=Search(colOrders, txtQ.Text, "Namn")') }],
      { exportDatasources: { colOrders: 'sharepoint' } },
    );
    const issue = result.issues.find(i => i.rule === 'delegation-sharepoint-search');
    expect(issue?.evidence).toMatchObject({
      resolvedBy: 'export-metadata',
      confidence: 'medium',
      backend: 'sharepoint',
    });
  });

  it('an unmapped prefixed name still resolves by convention, with evidence saying so', () => {
    const result = validateFiles(
      [{ name: 'a.pa.yaml', content: GALLERY('=Search(colOrders, txtQ.Text, "Namn")') }],
      { exportDatasources: {} },
    );
    expect(result.issues.find(i => i.rule === 'delegation-sharepoint-search')).toBeUndefined();
    expect(result.issues.find(i => i.rule === 'delegation-search-caveat')).toBeUndefined();
  });

  it('threads metadata through ForAll writes: iterated source AND write target both resolve', () => {
    const yaml = `Screens:\n  Main:\n    Children:\n      - lblRun:\n          Control: Label\n          Properties:\n            Wrap: =false\n            Text: =ForAll(Orders, Patch(Archive, Defaults(Archive), {A: 1}))\n`;
    const result = validateFiles(
      [{ name: 'a.pa.yaml', content: yaml }],
      { exportDatasources: { Orders: 'sharepoint', Archive: 'sharepoint' } },
    );
    const forall = result.issues.find(i => i.rule === 'delegation-forall-writes');
    expect(forall).toBeTruthy();
    expect(forall?.evidence).toMatchObject({ resolvedBy: 'export-metadata' });
  });

  it('inherited keys and __proto__ are data, not matches', () => {
    const meta = JSON.parse('{"__proto__": "sharepoint"}');
    const result = validateFiles(
      [{ name: 'a.pa.yaml', content: GALLERY('=Search(toString, txtQ.Text, "N")') }],
      { exportDatasources: meta },
    );
    expect(result.issues.every(i => i.evidence?.resolvedBy !== 'export-metadata')).toBe(true);
  });

  it('an own property literally named __proto__ matches as ordinary data', () => {
    const meta = JSON.parse('{"__proto__": "sharepoint"}');
    expect(resolveDatasourceFromExportMetadata('__proto__', meta)).toEqual({
      authoredName: '__proto__',
      backend: 'sharepoint',
      resolvedBy: 'export-metadata',
      confidence: 'medium',
    });
    expect(resolveDatasourceFromExportMetadata('toString', {})).toMatchObject({
      resolvedBy: 'unresolved',
      confidence: 'none',
    });
  });

  it('no metadata supplied → behavior identical to today (unresolved)', () => {
    const result = validateFiles([
      { name: 'a.pa.yaml', content: GALLERY('=Search(Orders, txtQ.Text, "Namn")') },
    ]);
    const caveat = result.issues.find(i => i.rule === 'delegation-search-caveat');
    expect(caveat?.evidence).toMatchObject({ resolvedBy: 'unresolved' });
  });
});
