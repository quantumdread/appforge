import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runReleaseCheck } from '../scripts/release-check.mjs';

const MCP = resolve(__dirname, '..');

describe('release check command', () => {
  it('awaits the catalog, core, local, Worker, Node, typecheck and corpus commands in order', async () => {
    const commands: Array<{ executable: string; args: string[]; options: Record<string, unknown> }> = [];
    const env = { PATH: 'test-path' };
    let active = false;
    const status = await runReleaseCheck({
      env,
      log: () => {},
      runner: async (executable: string, args: string[], options: Record<string, unknown>) => {
        expect(active).toBe(false);
        active = true;
        commands.push({ executable, args, options });
        await new Promise(resolve => setTimeout(resolve, 1));
        active = false;
        return { status: 0, signal: null };
      },
    });

    expect(status).toBe(0);
    expect(commands.map(command => command.args)).toEqual([
      ['scripts/build-catalog.mjs'],
      ['scripts/build-core.mjs'],
      ['scripts/build-local.mjs'],
      ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts'],
      ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.node.config.mts'],
      ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json'],
      ['../cli/diff-oracle.mjs'],
    ]);
    for (const command of commands) {
      expect(command.executable).toBe(process.execPath);
      expect(command.options).toMatchObject({ cwd: MCP, env, shell: false, windowsHide: true });
      expect(command.options.env).toBe(env);
    }
  });

  it.each([
    ['nonzero exit', { status: 7, signal: null }, 7],
    ['signal', { status: null, signal: 'SIGTERM' }, 1],
    ['spawn result error', { status: null, signal: null, error: new Error('private path') }, 1],
    ['missing exit status', { status: null, signal: null }, 1],
  ])('stops after a %s and returns a nonzero aggregate status', async (_name, result, expected) => {
    const commands: string[] = [];
    const lines: string[] = [];
    const status = await runReleaseCheck({
      env: {},
      log: (line: string) => lines.push(line),
      runner: async (_executable: string, args: string[]) => {
        commands.push(args[0]);
        return commands.length === 4 ? result : { status: 0, signal: null };
      },
    });
    expect(status).toBe(expected);
    expect(commands).toEqual([
      'scripts/build-catalog.mjs',
      'scripts/build-core.mjs',
      'scripts/build-local.mjs',
      'node_modules/vitest/vitest.mjs',
    ]);
    expect(lines.join('\n')).toContain('Worker tests failed');
    expect(lines.join('\n')).not.toContain('private path');
  });

  it('stops on a thrown spawn failure without exposing the error payload', async () => {
    const lines: string[] = [];
    let attempts = 0;
    const status = await runReleaseCheck({
      env: {},
      log: (line: string) => lines.push(line),
      runner: () => {
        attempts += 1;
        throw new Error('private path');
      },
    });
    expect(status).toBe(1);
    expect(attempts).toBe(1);
    expect(lines.join('\n')).toContain('catalog build failed');
    expect(lines.join('\n')).not.toContain('private path');
  });

  it('reports absent real and external fixtures as skipped coverage, not passed checks', async () => {
    const lines: string[] = [];
    await runReleaseCheck({
      env: { APPFORGE_CORPUS_EXTERNAL_ROOTS: ` ${delimiter} ` },
      log: (line: string) => lines.push(line),
      runner: async () => ({ status: 0, signal: null }),
    });
    const output = lines.join('\n');
    expect(output).toContain('APPFORGE_CORPUS_EXTERNAL_ROOTS (delivery-repositories): absent (external corpus skipped)');
    expect(output).toContain('APPFORGE_REAL_MSAPP: absent (real fixture coverage skipped when not required)');
    expect(output).toContain('APPFORGE_REAL_SOLUTION: absent (real fixture coverage skipped when not required)');
    expect(output).toContain('APPFORGE_REAL_SOLUTION_APP: absent (default app selection)');
    expect(output).toContain('APPFORGE_REQUIRE_REAL_SURVEY: disabled (real inputs optional)');
    expect(output).toContain('Command sequence passed; fixture skips remain as reported.');
  });

  it('reports configured fixture names and required coverage without printing their values', async () => {
    const lines: string[] = [];
    const env = {
      APPFORGE_CORPUS_EXTERNAL_ROOTS: tmpdir(),
      APPFORGE_REAL_MSAPP: 'private-archive.msapp',
      APPFORGE_REAL_SOLUTION: 'private-solution.zip',
      APPFORGE_REAL_SOLUTION_APP: 'private-app-selection',
      APPFORGE_REQUIRE_REAL_SURVEY: '1',
    };
    await runReleaseCheck({
      env,
      log: (line: string) => lines.push(line),
      runner: async () => ({ status: 0, signal: null }),
    });
    const output = lines.join('\n');
    expect(output).toContain('APPFORGE_CORPUS_EXTERNAL_ROOTS (delivery-repositories): configured');
    expect(output).toContain('APPFORGE_REAL_MSAPP: configured');
    expect(output).toContain('APPFORGE_REAL_SOLUTION: configured');
    expect(output).toContain('APPFORGE_REAL_SOLUTION_APP: configured');
    expect(output).toContain('APPFORGE_REQUIRE_REAL_SURVEY: enabled (missing real inputs fail the survey suite)');
    expect(output).not.toContain('private-');
  });

  it('treats empty real fixture values as configured because the suites validate them instead of skipping', async () => {
    const lines: string[] = [];
    await runReleaseCheck({
      env: {
        APPFORGE_CORPUS_EXTERNAL_ROOTS: '',
        APPFORGE_REAL_MSAPP: '',
        APPFORGE_REAL_SOLUTION: '',
        APPFORGE_REAL_SOLUTION_APP: '',
      },
      log: (line: string) => lines.push(line),
      runner: async () => ({ status: 0, signal: null }),
    });
    const output = lines.join('\n');
    expect(output).toContain('APPFORGE_CORPUS_EXTERNAL_ROOTS (delivery-repositories): absent (external corpus skipped)');
    expect(output).toContain('APPFORGE_REAL_MSAPP: configured');
    expect(output).toContain('APPFORGE_REAL_SOLUTION: configured');
    expect(output).toContain('APPFORGE_REAL_SOLUTION_APP: configured');
    expect(output).not.toContain('real fixture coverage skipped');
    expect(output).not.toContain('default app selection');
  });

  it('anchors every command to the script directory when invoked from another cwd', async () => {
    const originalCwd = process.cwd();
    const commandDirectories: string[] = [];
    try {
      process.chdir(tmpdir());
      await runReleaseCheck({
        env: {},
        log: () => {},
        runner: async (_executable: string, _args: string[], options: { cwd: string }) => {
          commandDirectories.push(options.cwd);
          return { status: 0, signal: null };
        },
      });
    } finally {
      process.chdir(originalCwd);
    }
    expect(commandDirectories).toEqual([MCP, MCP, MCP, MCP, MCP, MCP, MCP]);
  });

  it('wires the npm script to executable help without running a nested release sequence', () => {
    const result = spawnSync(process.execPath, [resolve(MCP, 'scripts/release-check.mjs'), '--help'], {
      cwd: tmpdir(),
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: node scripts/release-check.mjs [--help]');
    expect(result.stdout).toContain('catalog -> core -> local -> Worker -> Node -> TypeScript -> corpus');
    expect(result.stdout).not.toContain('[release:check] Running');
    expect(result.stderr).toBe('');
    const { scripts } = JSON.parse(readFileSync(resolve(MCP, 'package.json'), 'utf8'));
    expect(scripts['release:check']).toBe('node scripts/release-check.mjs');
    expect(scripts.predeploy).toBe('npm run build:core');
  });

  it('rejects unsupported CLI arguments before running a child command', () => {
    const result = spawnSync(process.execPath, [resolve(MCP, 'scripts/release-check.mjs'), '--unexpected'], {
      cwd: tmpdir(),
      encoding: 'utf8',
      windowsHide: true,
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Usage: node scripts/release-check.mjs [--help]');
    expect(result.stdout).not.toContain('[release:check] Running');
  });
});


describe('release external corpus preflight', () => {
  it.each(['missing alone', 'present then missing'])('fails a configured missing root (%s) before running any gates', async mode => {
    const missing = resolve(MCP, 'test/fixtures/v314-nonexistent-root');
    const lines: string[] = [];
    let attempted = false;
    const status = await runReleaseCheck({
      env: { APPFORGE_CORPUS_EXTERNAL_ROOTS: mode === 'missing alone' ? missing : `${tmpdir()}${delimiter}${missing}` },
      log: (line: string) => lines.push(line),
      runner: async () => { attempted = true; return { status: 0, signal: null }; },
    });
    expect(status).toBe(1);
    expect(attempted).toBe(false);
    expect(lines.join('\n')).toContain(`configured external corpus root does not exist: ${missing}`);
  });
});
