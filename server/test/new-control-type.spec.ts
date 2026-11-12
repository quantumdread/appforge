import { describe, expect, it } from 'vitest';
import { controlNamesOf, validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA as catalog } from '../src/lib/catalog-data';
import { validateYaml } from '../src/tools/validator';

// v3.20: a control added by this change must not copy a superseded type from
// the rest of the app (field report 2026-11-12: new buttons built as Button
// because the app already had them).
const screen = (children: Array<[string, string]>) => `Screens:
  Home:
    Children:
${children.map(([name, type]) => `      - ${name}:
          Control: ${type}
          Properties:
            Text: ="x"`).join('\n')}
`;
const before = [{name: 'Home.pa.yaml', content: screen([['btnOld', 'Button'], ['lblOld', 'Text']])}];
const after = [{name: 'Home.pa.yaml', content: screen([
  ['btnOld', 'Button'], ['lblOld', 'Text'], ['btnNew', 'Button'], ['btnGood', 'ModernButton'], ['lblNew', 'Text'],
])}];
const run = (existingControls?: string[], profile: 'worker' | 'cli' = 'worker') =>
  validateFiles(after, catalog, {lintProfile: profile, lintContext: existingControls ? {existingControls} : {}}).issues;
const ruleHits = (issues: ReturnType<typeof run>, rule: string) => issues.filter(issue => issue.rule === rule);

describe('new-control-superseded-type', () => {
  it('lists the names of the earlier copy', () => {
    expect(controlNamesOf(before)).toEqual(['btnOld', 'lblOld']);
  });

  it.each(['worker', 'cli'] as const)('warns once per new control with a superseded type (%s profile)', profile => {
    const issues = run(controlNamesOf(before), profile);
    const fresh = ruleHits(issues, 'new-control-superseded-type');
    expect(fresh.map(issue => issue.control)).toEqual(['btnNew', 'lblNew']);
    expect(fresh[0]).toMatchObject({level: 'WARN'});
    expect(fresh[0].detail).toContain('superseded by ModernButton');
    expect(fresh[0].detail).toContain('no reason to copy it');
    expect(fresh[0].fix).toBe('use ModernButton; keep Button only when the user asked to match the existing controls');
    // The bundled advice (Worker profile only) keeps the controls that were already there.
    const existing = ruleHits(issues, 'superseded-control-type');
    if (profile === 'cli') expect(existing).toEqual([]);
    else expect(existing.map(issue => issue.controls)).toEqual([['btnOld', 'lblOld']]);
  });

  it('stays silent without an earlier copy, and the bundled advice keeps every control', () => {
    const issues = run();
    expect(ruleHits(issues, 'new-control-superseded-type')).toEqual([]);
    expect(ruleHits(issues, 'superseded-control-type')[0].controls).toEqual(['btnOld', 'lblOld', 'btnNew', 'lblNew']);
  });

  it('stays silent when nothing new uses a superseded type', () => {
    const issues = run(['btnOld', 'lblOld', 'btnNew', 'btnGood', 'lblNew']);
    expect(ruleHits(issues, 'new-control-superseded-type')).toEqual([]);
  });

  it('is never REFUSE', () => {
    expect(run(controlNamesOf(before)).filter(issue => issue.level === 'REFUSE')).toEqual([]);
  });
});

describe('validate_yaml before_files', () => {
  const parse = (result: {content: Array<{text: string}>}) => JSON.parse(result.content[0].text);
  it('reports new controls when before_files is passed', () => {
    const body = parse(validateYaml.handler({files: after, before_files: before}));
    const fresh = body.issues.warn.filter((issue: {rule: string}) => issue.rule === 'new-control-superseded-type');
    expect(fresh.map((issue: {control: string}) => issue.control)).toEqual(['btnNew', 'lblNew']);
  });
  it('rejects malformed before_files', () => {
    const result = validateYaml.handler({files: after, before_files: [{name: 'x'} as never]});
    expect(result.isError).toBe(true);
  });
});
