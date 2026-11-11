import { describe, expect, it } from 'vitest';
import { MAX_HOSTED_CONTROLS, countControlDeclarations } from '../src/lib/hosted-limits';
import { validateYaml } from '../src/tools/validator';
import { surveyApp } from '../src/tools/survey';

const screen = (name: string, controls: number, offset = 0): string => {
  let yaml = `Screens:\n  ${name}:\n    Children:\n`;
  for (let i = 0; i < controls; i++) {
    yaml += `      - L${offset + i}:\n          Control: Label\n          Properties:\n            Text: ="x"\n`;
  }
  return yaml;
};

const split = (total: number) => [
  { name: 'A.pa.yaml', content: screen('A', Math.ceil(total / 2)) },
  { name: 'B.pa.yaml', content: screen('B', Math.floor(total / 2), Math.ceil(total / 2)) },
];

describe('hosted control cap', () => {
  it('counts Control declarations across files, including versioned and indented forms', () => {
    expect(countControlDeclarations([
      { content: '    Control: Label\n      Control: GroupContainer@1.5.0\nControl:\n  # Control: x' },
      { content: screen('S', 3) },
    ])).toBe(5);
  });

  it('validate_yaml accepts exactly the cap and refuses one over, summed across files', () => {
    const exact = validateYaml.handler({ files: split(MAX_HOSTED_CONTROLS) });
    expect(exact.isError).toBeUndefined();

    const over = validateYaml.handler({ files: split(MAX_HOSTED_CONTROLS + 1) });
    expect(over.isError).toBe(true);
    expect(over.content[0].text).toBe(
      `Input too large for one request: ${MAX_HOSTED_CONTROLS + 1} controls exceeds the ${MAX_HOSTED_CONTROLS}-control cap per request. Split the validation into batches of screens, or run the local CLI (node cli/validate.mjs <dir>), which has no such cap.`,
    );
  });

  it('survey_app refuses over the cap as a bounded input error before analysis', async () => {
    const over: any = await surveyApp.handler(
      { files: split(MAX_HOSTED_CONTROLS + 1) } as any,
      { env: {}, ctx: { waitUntil() {} } } as any,
    );
    expect(over.isError).toBe(true);
    expect(over.content[0].text).toBe(
      `survey input error: ${MAX_HOSTED_CONTROLS + 1} controls exceeds the per-request ${MAX_HOSTED_CONTROLS}-control cap; run the local CLI (node cli/validate.mjs survey <dir>), which has no such cap`,
    );
  });
});
