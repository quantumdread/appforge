import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';

describe('gallery template field-report exclusions', () => {
  it.each(['card-template-1.yaml', 'screen-table-template-1.yaml', 'table-template-1.yaml'])('accepts direct-child Select(Parent) in %s', name => {
    const content = readFileSync(new URL(`../../knowledge/templates/${name}`, import.meta.url), 'utf8');
    const issues = validateFiles([{ name, content }], catalog, { lintProfile: 'cli' }).issues;
    expect(issues.filter(issue => issue.rule === 'select-parent-in-gallery')).toEqual([]);
  });
});
