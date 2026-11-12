import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';

// v3.21: modern data grid paging (Reza Dorrani's walkthrough, 2026-11-12; not yet compile-observed).
const grid = (properties: string) => `Screens:
  Home:
    Children:
      - grdWork:
          Control: ModernDataGrid
          Properties:
${properties.split('\n').map(line => `            ${line}`).join('\n')}
`;
const hits = (content: string, rule: string, profile: 'worker' | 'cli' = 'worker') =>
  validateFiles([{name: 'Home.pa.yaml', content}], catalog, {lintProfile: profile})
    .issues.filter(issue => issue.rule === rule);

describe('datagrid-pagination-none', () => {
  it.each([
    ['Items: =WorkTracker', 'Items', 'not set'],
    ["Items: =Filter('Work Tracker', Status = \"Open\")", 'Items', 'not set'],
    ['Items: =WorkTracker\nPagination: =Pagination.None', 'Pagination', 'None'],
  ])('warns for a bound source without paging: %s', (properties, property, wording) => {
    for (const profile of ['worker', 'cli'] as const) {
      const issues = hits(grid(properties), 'datagrid-pagination-none', profile);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({level: 'WARN', property});
      expect(issues[0].detail).toContain(wording);
      expect(issues[0].detail).toContain('data row limit');
    }
  });
  it.each([
    'Items: =WorkTracker\nPagination: =Pagination.Auto',
    'Items: =WorkTracker\nPagination: =Pagination.Number',
    'Items: =colWork',
    'Items: =varRows',
    'Items: =[1, 2, 3]',
    'Pagination: =Pagination.None',
  ])('stays silent: %s', properties => {
    expect(hits(grid(properties), 'datagrid-pagination-none')).toHaveLength(0);
  });
  it('ignores other controls', () => {
    const gallery = grid('Items: =WorkTracker').replace('ModernDataGrid', 'Gallery');
    expect(hits(gallery, 'datagrid-pagination-none')).toHaveLength(0);
  });
});

describe('datagrid-delegate-search-unused', () => {
  it('warns when DelegateSearch is on and Items never reads SearchText', () => {
    for (const profile of ['worker', 'cli'] as const) {
      const issues = hits(grid('Items: =WorkTracker\nPagination: =Pagination.Auto\nDelegateSearch: =true'),
        'datagrid-delegate-search-unused', profile);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({level: 'WARN', property: 'DelegateSearch'});
      expect(issues[0].detail).toContain('SearchText');
    }
  });
  it('warns when SearchText only appears inside a string', () => {
    const issues = hits(grid('Items: =If(true, WorkTracker, Filter(WorkTracker, Title = "SearchText"))\nDelegateSearch: =true'),
      'datagrid-delegate-search-unused');
    expect(issues).toHaveLength(1);
  });
  it.each([
    'Items: =Filter(WorkTracker, StartsWith(Title, Self.SearchText))\nDelegateSearch: =true',
    'Items: =Filter(WorkTracker, StartsWith(Title, grdWork.SearchText))\nDelegateSearch: =true',
    'Items: =WorkTracker\nDelegateSearch: =false',
    'Items: =WorkTracker',
  ])('stays silent: %s', properties => {
    expect(hits(grid(properties), 'datagrid-delegate-search-unused')).toHaveLength(0);
  });
});
