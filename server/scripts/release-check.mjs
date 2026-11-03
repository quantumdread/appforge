#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELP = `Usage: node scripts/release-check.mjs [--help]

Runs serially: catalog -> core -> local -> Worker -> Node -> TypeScript -> corpus.
Stops at the first failure. Uses installed dependencies; no install or deploy.
Reports configured/absent fixtures; a missing configured external root fails with its path.
Child tools retain their usual output. --help runs no build or tests.`;
const STEPS = [
  ['catalog build', ['scripts/build-catalog.mjs']],
  ['core build', ['scripts/build-core.mjs']],
  ['local build', ['scripts/build-local.mjs']],
  ['Worker tests', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts']],
  ['Node tests', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.node.config.mts']],
  ['TypeScript', ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.json']],
  ['corpus', ['../cli/diff-oracle.mjs']],
];

function runChild(executable, args, options) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, args, options);
    child.once('error', reject);
    child.once('close', (status, signal) => resolveResult({ status, signal }));
  });
}

function reportFixtures(env, log) {
  const externalConfigured = (env.APPFORGE_CORPUS_EXTERNAL_ROOTS ?? '')
    .split(delimiter).some(value => value.trim().length > 0);
  log(`[release:check] APPFORGE_CORPUS_EXTERNAL_ROOTS (delivery-repositories): ${
    externalConfigured ? 'configured' : 'absent (external corpus skipped)'}`);
  for (const name of ['APPFORGE_REAL_MSAPP', 'APPFORGE_REAL_SOLUTION']) {
    log(`[release:check] ${name}: ${env[name] !== undefined
      ? 'configured' : 'absent (real fixture coverage skipped when not required)'}`);
  }
  log(`[release:check] APPFORGE_REAL_SOLUTION_APP: ${env.APPFORGE_REAL_SOLUTION_APP !== undefined
    ? 'configured' : 'absent (default app selection)'}`);
  log(`[release:check] APPFORGE_REQUIRE_REAL_SURVEY: ${env.APPFORGE_REQUIRE_REAL_SURVEY === '1'
    ? 'enabled (missing real inputs fail the survey suite)' : 'disabled (real inputs optional)'}`);
}

/** Run the fixed release sequence; runner is the child-process boundary. */
export async function runReleaseCheck({
  args = [],
  env = process.env,
  runner = runChild,
  log = console.log,
} = {}) {
  if (args.length > 0) {
    log(HELP);
    return args.length === 1 && args[0] === '--help' ? 0 : 2;
  }
  reportFixtures(env, log);
  const externalRoots = (env.APPFORGE_CORPUS_EXTERNAL_ROOTS ?? '')
    .split(delimiter).map(value => value.trim()).filter(Boolean);
  for (const root of externalRoots) {
    if (!existsSync(root)) {
      log(`[release:check] configured external corpus root does not exist: ${root}`);
      return 1;
    }
  }
  for (const [label, args] of STEPS) {
    log(`[release:check] Running ${label}`);
    let result;
    try {
      result = await runner(process.execPath, args, {
        cwd: MCP,
        env,
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
      });
    } catch {
      log(`[release:check] ${label} failed: child process could not start.`);
      return 1;
    }
    if (result.error || result.signal || result.status !== 0) {
      const status = Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
      const reason = result.error ? 'spawn failure'
        : result.signal ? 'child terminated by signal'
        : `exit ${status}`;
      log(`[release:check] ${label} failed: ${reason}. Stopping.`);
      return status;
    }
  }
  log('[release:check] Command sequence passed; fixture skips remain as reported.');
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = await runReleaseCheck({ args: process.argv.slice(2) });
}
