import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve(__dirname, '../../cli/validate.mjs');
const content = 'Screens:\n  Home:\n    Children:\n      - greeting:\n          Control: Label\n          Properties:\n            Text: ="Hi"\n';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'm7c-cli-'));
  const input = join(root, 'input'), output = join(root, 'output');
  mkdirSync(join(input, 'Screens'), { recursive: true });
  writeFileSync(join(input, 'Screens/Home.pa.yaml'), content);
  writeFileSync(join(input, '_EditorState.pa.yaml'), 'ScreensOrder:\n  - Home\n');
  writeFileSync(join(input, 'asset.bin'), Buffer.from([0, 255, 128, 1]));
  return { input, output };
}
const run = (args: string[]) => spawnSync(process.execPath, [script, 'modernize', ...args], { encoding: 'utf8' });
describe('modernize CLI', () => {
  it('writes a complete new folder and both report formats', () => {
    const { input, output } = fixture();
    const response = run([input, '--out', output, '--json']);
    expect(response.status, response.stderr).toBe(0);
    expect(JSON.parse(response.stdout).summary.converted).toBe(1);
    expect(readFileSync(join(output, 'Screens/Home.pa.yaml'), 'utf8')).toBe(content.replace('Label', 'ModernText') + '            PaddingTop: =0\n            PaddingBottom: =0\n            VerticalAlign: =VerticalAlign.Middle\n');
    expect(readFileSync(join(output, 'asset.bin'))).toEqual(Buffer.from([0, 255, 128, 1]));
    expect(readFileSync(join(output, 'modernize-report.md'), 'utf8')).toContain('verified: false');
    expect(JSON.parse(readFileSync(join(output, 'modernize-report.json'), 'utf8')).self_check.new_refusals).toEqual([]);
    expect(readFileSync(join(input, 'Screens/Home.pa.yaml'), 'utf8')).toBe(content);
  });
  it.each(['same', 'inside', 'nonempty'])('refuses unsafe output: %s', mode => {
    const { input, output } = fixture();
    const out = mode === 'same' ? input : mode === 'inside' ? join(input, 'new') : output;
    if (mode === 'nonempty') { mkdirSync(out); writeFileSync(join(out, 'keep.txt'), 'keep'); }
    const response = run([input, '--out', out]);
    expect(response.status).toBe(2);
    expect(response.stderr).toContain('output');
    if (mode === 'inside') expect(existsSync(out)).toBe(false);
  });
});

it('converts the repository template .yaml extension', () => {
  const { input, output } = fixture();
  writeFileSync(join(input, 'template.yaml'), content.replace('Home:', 'Template:').replace('greeting:', 'templateLabel:'));
  const response = run([input, '--out', output, '--json']);
  expect(response.status).toBe(0);
  expect(JSON.parse(response.stdout).summary.converted).toBe(2);
  expect(readFileSync(join(output, 'template.yaml'), 'utf8')).toContain('Control: ModernText');
});

it('refuses an output hidden inside the input by a junction', () => {
  const { input, output } = fixture();
  const alias = join(input, '..', 'alias');
  symlinkSync(input, alias, 'junction');
  const response = run([input, '--out', join(alias, 'new')]);
  expect(response.status).toBe(2);
  expect(existsSync(output)).toBe(false);
  expect(existsSync(join(input, 'new'))).toBe(false);
});

it('accepts an existing empty output directory and returns one when filters select nothing', () => {
  const { input, output } = fixture();
  mkdirSync(output);
  const response = run([input, '--out', output, '--types', 'Classic/Button', '--controls', 'greeting', '--json']);
  expect(response.status).toBe(1);
  expect(JSON.parse(response.stdout).summary.converted).toBe(0);
  expect(readFileSync(join(output, 'Screens/Home.pa.yaml'), 'utf8')).toBe(content);
});

it('returns zero and reports no new refusals after the review-mode Tooltip drop', () => {
  const { input, output } = fixture();
  writeFileSync(join(input, 'Screens/Home.pa.yaml'), content + '            Tooltip: ="help"\n');
  const response = run([input, '--out', output, '--include-review']);
  expect(response.status).toBe(0);
  expect(response.stdout).toContain('0 new REFUSE');
  expect(readFileSync(join(output, 'Screens/Home.pa.yaml'), 'utf8')).not.toContain('Tooltip:');
});

it.each([[], ['--out'], ['a', '--out', 'b', '--unknown'], ['a', '--out', 'b', '--types', ','], ['a', '--out', 'b', '--json', '--json']].map(args => ({ args })))('returns two for invalid arguments: %j', ({ args }) => {
  expect(run(args).status).toBe(2);
});

it('returns three for a missing input directory', () => {
  const { input, output } = fixture();
  const response = run([join(input, 'missing'), '--out', output]);
  expect(response.status).toBe(3);
  expect(response.stderr).toContain('infrastructure');
  expect(existsSync(output)).toBe(false);
});
