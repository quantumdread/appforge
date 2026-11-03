import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const script = resolve(__dirname, '../../cli/validate.mjs');
const files = (names: string[]) => `Screens:\n  Home:\n    Children:\n${names.map(name => `      - ${name}:\n          Control: Label\n`).join('')}`;
function fixture(expected: string, actual: string) {
  const root = mkdtempSync(join(tmpdir(), 't1-cli-'));
  const dirs = [join(root, 'expected'), join(root, 'actual')];
  for (const dir of dirs) mkdirSync(join(dir, 'Screens'), { recursive: true });
  writeFileSync(join(dirs[0], 'Screens/Home.pa.yaml'), expected);
  writeFileSync(join(dirs[1], 'Screens/Home.pa.yaml'), actual);
  return dirs;
}
const run = (args: string[]) => spawnSync(process.execPath, [script, 'compare-order', ...args], { encoding: 'utf8' });

describe('compare-order CLI', () => {
  it('exits one and emits JSON when Studio appends a new child', () => {
    const response = run([...fixture(files(['A', 'New', 'B']), files(['A', 'B', 'New'])), '--json']);
    expect(response.status).toBe(1);
    expect(JSON.parse(response.stdout)).toMatchObject({ identical: false, containers: [{ path: 'Home', status: 'reordered', appended_at_end: true }] });
  });
  it('exits zero when canonical property noise preserves child order', () => {
    const response = run([...fixture(files(['A', 'B']), files(['A', 'B']).replace('Control: Label', 'Control: Label\n          Properties:\n            Visible: =true')), '--json']);
    expect(response.status).toBe(0);
    expect(JSON.parse(response.stdout).identical).toBe(true);
  });
  it('prints actionable text for a reorder', () => {
    const response = run(fixture(files(['A', 'New', 'B']), files(['A', 'B', 'New'])));
    expect(response.status).toBe(1);
    expect(response.stdout).toContain('Home: reordered (appended at end)');
    expect(response.stdout).toContain('New: expected 2, actual 3');
  });
  it('exits one for membership changes', () => {
    const response = run([...fixture(files(['A', 'B']), files(['A'])), '--json']);
    expect(response.status).toBe(1);
    expect(JSON.parse(response.stdout).summary['membership-changed']).toBe(1);
  });
  it('prints editor render risk and the rename set for a moved control', () => {
    const response = run(fixture(files(['A']), files(['A']).replace('  Home:', '  Other:')));
    expect(response.status).toBe(1);
    expect(response.stdout).toContain('A: Home -> Other');
    expect(response.stdout).toContain('Editor render risk (1 controls): ');
    expect(response.stdout).toContain('  rename set: A\n');
  });
  it('prints type changes and keeps the order-only zero exit code', () => {
    const response = run(fixture(files(['A']).replace('Label', 'ModernText'), files(['A']).replace('Label', 'ModernButton')));
    expect(response.status).toBe(0);
    expect(response.stdout).toContain('A: type ModernText -> ModernButton');
    expect(response.stdout).toContain('Editor render risk (1 controls): ');
    expect(response.stdout).toContain('  rename set: A\n');
  });
  it.each([[], ['only-one'], ['a', 'b', '--wrong'], ['a', 'b', 'c'], ['a', 'b', '--json', '--json']].map(args => ({ args })))('exits two for usage errors: %j', ({ args }) => {
    const response = run(args);
    expect(response.status).toBe(2);
    expect(response.stderr).toContain('usage:');
  });
  it('exits two with a clear input error for unparseable PA-YAML', () => {
    const response = run([...fixture(files(['A']), '[broken\n'), '--json']);
    expect(response.status).toBe(2);
    expect(response.stderr).toContain('compare-order input error: actual: unable to parse');
  });
  it('exits three for an unreadable directory', () => {
    const root = mkdtempSync(join(tmpdir(), 't1-missing-'));
    const response = run([join(root, 'missing'), root]);
    expect(response.status).toBe(3);
    expect(response.stderr).toContain('infrastructure error');
  });
  it('exits two when given a file instead of a directory', () => {
    const dirs = fixture(files(['A']), files(['A']));
    const response = run([join(dirs[0], 'Screens/Home.pa.yaml'), dirs[1]]);
    expect(response.status).toBe(2);
    expect(response.stderr).toContain('expected a directory');
  });
});
