import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getYamlRules, listRuleDocuments } from '../src/tools/rules';

const personas = [
  ['diagnostician', 'Job and boundaries'],
  ['diagnostician-artifacts', 'Private packet'],
  ['documenter', 'Establish the source and output'],
  ['documenter-artifacts', 'Package and authority'],
  ['renovator', 'Start with the authorized scope'],
] as const;

describe('persona reference documents', () => {
  it.each(personas)('serves the current %s prompt and a section through get_yaml_rules', (name, heading) => {
    const source = readFileSync(new URL(`../../knowledge/personas/${name}.md`, import.meta.url), 'utf8');
    const document = `persona-${name}`;
    const full = getYamlRules.handler({ document });
    expect(full.isError).toBeUndefined();
    expect(full.content[0].text).toBe(source);

    const section = getYamlRules.handler({ document, section: heading.toLowerCase() });
    expect(section.isError).toBeUndefined();
    const expected = source.split(`## ${heading}\n`)[1].split('\n## ')[0].trim();
    expect(section.content[0].text).toBe(`## ${heading}\n\n${expected}`);
  });

  it('discovers all five personas as prompts for a calling session', () => {
    const listed = JSON.parse(listRuleDocuments.handler().content[0].text);
    expect(listed.count).toBe(36); // 31 existing references plus five persona documents.
    expect(listed.documents).toHaveLength(36);
    expect(listed.documents.filter((name: string) => name.startsWith('persona-'))).toEqual([
      'persona-diagnostician', 'persona-diagnostician-artifacts',
      'persona-documenter', 'persona-documenter-artifacts', 'persona-renovator',
    ]);
    expect(listRuleDocuments.description).toContain('personas');
    expect(listRuleDocuments.description).toContain('prompts for a calling session to follow');
  });
});
