import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const script = resolve(__dirname, '../../cli/validate.mjs');
const content = 'Screens:\n  Home:\n    Children:\n      - Label1:\n          Control: Label\n          Properties:\n            Text: ="Title"\n';
const run = (args: string[]) => spawnSync(process.execPath, [script, 'rename', ...args], { encoding: 'utf8' });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'n1-cli-')), input = join(root, 'input'), out = join(root, 'out'), map = join(root, 'map.json');
  mkdirSync(input); writeFileSync(join(input, 'Home.pa.yaml'), content); writeFileSync(join(input, 'asset.bin'), Buffer.from([0, 255, 1]));
  writeFileSync(map, JSON.stringify({ Label1: 'lblHeading' }));
  return { root, input, out, map };
}
it('proposes without writes and optionally saves an editable map outside the app', () => {
  const { input, root } = fixture(), map = join(root, 'proposal.json');
  const response = run([input, '--propose', '--screen-prefix=auto', '--json']);
  expect(response.status, response.stderr).toBe(0);
  expect(JSON.parse(response.stdout).proposals[0].new).toBe('lblTitle');
  expect(readdirSync(input).sort()).toEqual(['Home.pa.yaml', 'asset.bin']);
  expect(run([input, '--propose', '--write-map', map]).status).toBe(0);
  expect(JSON.parse(readFileSync(map, 'utf8'))).toEqual({ Label1: 'lblTitle' });
});
it('applies only the map and preserves the complete source including binary assets', () => {
  const { input, out, map } = fixture();
  const response = run([input, '--map', map, '--out', out, '--json']);
  expect(response.status, response.stderr).toBe(0);
  expect(readFileSync(join(out, 'Home.pa.yaml'), 'utf8')).toBe(content.replace('Label1:', 'lblHeading:'));
  expect(readFileSync(join(out, 'asset.bin'))).toEqual(Buffer.from([0, 255, 1]));
  expect(readFileSync(join(input, 'Home.pa.yaml'), 'utf8')).toBe(content);
  expect(JSON.parse(readFileSync(join(out, 'rename-report.json'), 'utf8')).self_check.regression).toBe(false);
});
it.each(['same', 'inside', 'nonempty', 'junction'])('rejects unsafe output %s before writes', mode => {
  const { root, input, out, map } = fixture();
  let target = out;
  if (mode === 'same') target = input;
  if (mode === 'inside') target = join(input, 'new');
  if (mode === 'nonempty') { mkdirSync(out); writeFileSync(join(out, 'keep'), 'keep'); }
  if (mode === 'junction') { const alias = join(root, 'alias'); symlinkSync(input, alias, 'junction'); target = join(alias, 'new'); }
  const response = run([input, '--map', map, '--out', target]);
  expect(response.status, response.stderr).toBe(2);
  expect(existsSync(join(input, 'new'))).toBe(false);
});
it('rejects a map output in the source and never overwrites a map', () => {
  const { input, map } = fixture();
  expect(run([input, '--propose', '--write-map', join(input, 'map.json')]).status).toBe(2);
  expect(run([input, '--propose', '--write-map', map]).status).toBe(2);
});
it('rejects collisions without creating output and returns one for no changes', () => {
  const { input, map, out } = fixture();
  writeFileSync(map, JSON.stringify({ Label1: 'Home' }));
  expect(run([input, '--map', map, '--out', out]).status).toBe(2);
  expect(existsSync(out)).toBe(false);
  writeFileSync(map, '{}');
  expect(run([input, '--map', map, '--out', out]).status).toBe(1);
});
it.each([[], ['--propose'], ['a', '--propose', '--out', 'b'], ['a', '--map', 'm'], ['a', '--propose', '--propose'], ['a', '--propose', '--screen-prefix=false']].map(args => ({ args })))('returns two for invalid usage', ({ args }) => expect(run(args).status).toBe(2));
it('returns infrastructure exit three on missing input', () => {
  const { root } = fixture();
  expect(run([join(root, 'missing'), '--propose']).status).toBe(3);
});
it('returns one on a failed self-check without creating output', () => {
  const { input, map, out } = fixture();
  writeFileSync(join(input, 'Home.pa.yaml'), content.replace('="Title"', '=With({lblHeading: 1}, Label1.Text)'));
  const response = run([input, '--map', map, '--out', out]);
  expect(response.status).toBe(1);
  expect(response.stderr).toContain('self-check');
  expect(existsSync(out)).toBe(false);
});
it('prints prefixed proposals and preserves an existing empty output directory', () => {
  const { input, map, out } = fixture();
  const response = run([input, '--propose', '--screen-prefix', '--json']);
  expect(response.status).toBe(0);
  expect(JSON.parse(response.stdout).proposals[0].new).toBe('homLblTitle');
  mkdirSync(out);
  expect(run([input, '--map', map, '--out', out]).status).toBe(0);
});
