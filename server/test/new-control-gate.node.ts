import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// v3.20: the CLI's --before and the compile gate's sibling "before" folder.
const ROOT = resolve(__dirname, '../..');
const CLI = join(ROOT, 'cli/validate.mjs');
const PRE = join(ROOT, 'cli/precompile-hook.mjs');
const screen = (names: string[]) => `Screens:
  Home:
    Children:
${names.map(name => `      - ${name}:
          Control: ${name.startsWith('mod') ? 'ModernButton' : 'Button'}
          Properties:
            Text: ="x"`).join('\n')}
`;
let temp: string;
let source: string;
let before: string;

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), 'appforge-new-control-'));
  source = join(temp, 'source');
  before = join(temp, 'before');
  mkdirSync(source);
  mkdirSync(before);
  writeFileSync(join(before, 'Home.pa.yaml'), screen(['btnOld']));
  writeFileSync(join(source, 'Home.pa.yaml'), screen(['btnOld', 'btnNew', 'modOk']));
});
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const rules = (stdout: string) => JSON.parse(stdout).reports
  .flatMap((report: { issues: Array<{ rule: string; control: string }> }) => report.issues)
  .filter((issue: { rule: string }) => issue.rule === 'new-control-superseded-type')
  .map((issue: { control: string }) => issue.control);

describe('validate.mjs --before', () => {
  it('names the new control only', () => {
    const result = spawnSync(process.execPath, [CLI, source, '--json', '--before', before], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(rules(result.stdout)).toEqual(['btnNew']);
  });
  it('is silent without --before', () => {
    const result = spawnSync(process.execPath, [CLI, source, '--json'], { encoding: 'utf8' });
    expect(rules(result.stdout)).toEqual([]);
  });
  it('fails clearly on an empty --before folder', () => {
    const empty = join(temp, 'empty');
    mkdirSync(empty, { recursive: true });
    const result = spawnSync(process.execPath, [CLI, source, '--json', '--before', empty], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unable to load --before');
  });
});

describe('compile gate with a sibling "before" folder', () => {
  it('passes the earlier copy to the validator and reports the new control', () => {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (['claude_plugin_option_compile_gate', 'appforge_compile_gate'].includes(key.toLowerCase())) delete env[key]; // Claude Code and manual settings.
    }
    const input = JSON.stringify({ tool_name: 'mcp__canvas-authoring__compile_canvas', tool_input: { directoryPath: source } });
    const result = spawnSync(process.execPath, [PRE], { env, input, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('comparing with the earlier copy');
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext as string;
    expect(context).toContain('new-control-superseded-type');
    expect(context).toContain('btnNew');
    expect(context).not.toMatch(/new-control-superseded-type[^\n]*btnOld/);
  });
});

describe('compile-gate profile closes the 2026-10-06 gap', () => {
  it.each([
    ['AccessibleLabel: ="Gauge: " & Text(64) & " percent"', 'block-scalar-required'],
    ['Text: hello', 'formula-missing-equals'],
    ['Color: =Red', 'bare-color-name'],
  ])('refuses %s', (line, rule) => {
    const type = line.startsWith('Color') ? 'Label' : 'Image';
    const dir = mkdtempSync(join(temp, 'gap-'));
    writeFileSync(join(dir, 'Home.pa.yaml'), `Screens:
  Home:
    Children:
      - ctlX:
          Control: ${type}
          Properties:
            ${line}
`);
    const result = spawnSync(process.execPath, [CLI, dir, '--json'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    const issues = JSON.parse(result.stdout).reports.flatMap((report: { issues: unknown[] }) => report.issues);
    expect(issues).toContainEqual(expect.objectContaining({ level: 'REFUSE', rule }));
  });
});
