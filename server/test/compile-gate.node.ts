import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const PRE = join(ROOT, 'cli/precompile-hook.mjs');
const POST = join(ROOT, 'cli/postcompile-hook.mjs');
const FIXTURES = {
  clean: '00-clean.pa.yaml',
  warnings: '82-two-screen-cross-reference.pa.yaml',
  refused: '10-refuse-catalog.pa.yaml',
} as const;
const MODES = ['block', 'warn', 'off'] as const;
type Outcome = keyof typeof FIXTURES;
let temp: string;
const folders = {} as Record<Outcome, string>;

function run(script: string, input: string, pluginMode?: string, manualMode?: string, nodeArgs: string[] = []) {
  const env = { ...process.env };
  // Windows treats environment names case-insensitively.
  for (const key of Object.keys(env)) {
    if (['claude_plugin_option_compile_gate', 'appforge_compile_gate'].includes(key.toLowerCase())) delete env[key]; // Claude Code and manual settings.
  }
  if (pluginMode !== undefined) env.CLAUDE_PLUGIN_OPTION_COMPILE_GATE = pluginMode; // Claude Code plugin setting.
  if (manualMode !== undefined) env.APPFORGE_COMPILE_GATE = manualMode;
  const result = spawnSync(process.execPath, [...nodeArgs, script], { env, input, encoding: 'utf8', stdio: 'pipe' });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

function payload(directoryPath: string) {
  return JSON.stringify({ tool_name: 'mcp__canvas-authoring__compile_canvas', tool_input: { directoryPath } });
}

function preContext(stdout: string, userMessage: boolean) {
  const json = JSON.parse(stdout);
  expect(Object.keys(json).sort()).toEqual(userMessage ? ['hookSpecificOutput', 'systemMessage'] : ['hookSpecificOutput']);
  expect(json.hookSpecificOutput).toEqual({
    hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: expect.any(String),
  });
  expect(json.hookSpecificOutput.additionalContext).toContain('Mention these findings to the user');
  if (userMessage) expect(json.systemMessage).toContain('allowed the compile because the gate is set to warn');
  return json.hookSpecificOutput.additionalContext as string;
}

function postContext(stdout: string) {
  const json = JSON.parse(stdout);
  expect(json).toEqual({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: expect.any(String) } });
  const context = json.hookSpecificOutput.additionalContext as string;
  for (const text of [
    'even when its validation reports errors', 'Studio saves automatically', 'new, empty folder',
    'compiled folder as intended', 'new folder as synced', 'compare_child_order', 'control types',
    "only with the user's go-ahead", 'reload the app and never resume it', "every screen's tree",
    'leftover temporary names',
  ]) expect(context).toContain(text);
  expect(context).not.toMatch(/[\r\n]/);
}

beforeAll(() => {
  temp = mkdtempSync(join(tmpdir(), 'appforge-compile-gate-'));
  for (const outcome of Object.keys(FIXTURES) as Outcome[]) {
    folders[outcome] = join(temp, outcome);
    mkdirSync(folders[outcome]);
    copyFileSync(join(ROOT, 'cli/corpus/coverage', FIXTURES[outcome]), join(folders[outcome], 'screen.pa.yaml'));
  }
});
afterAll(() => rmSync(temp, { recursive: true, force: true }));

describe.each(MODES)('compile gate in %s mode', mode => {
  it.each(Object.keys(FIXTURES) as Outcome[])('handles a %s folder before compile', outcome => {
    const result = run(PRE, payload(folders[outcome]), mode);
    expect(result.status).toBe(mode === 'block' && outcome === 'refused' ? 2 : 0);
    if (mode === 'off') {
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('');
    } else if (outcome === 'clean') {
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('PASS — proceeding to compile_canvas');
    } else if (outcome === 'refused' && mode === 'block') {
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('REFUSE — compile_canvas blocked');
      for (const text of ['DefinitelyNotAControl', 'DefinitelyNotAProperty', 'ghostCoverage', 'screen.pa.yaml',
        '/config (AppForge compile gate)', 'APPFORGE_COMPILE_GATE', '/appforge:report-issue']) {
        expect(result.stderr).toContain(text);
      }
    } else {
      const context = preContext(result.stdout, outcome === 'refused');
      expect(context).toContain(outcome === 'warnings' ? '0 REFUSE issue(s), 1 WARN issue(s)' : '6 REFUSE issue(s), 1 WARN issue(s)');
      expect(context).toContain('screen.pa.yaml');
      expect(context).toContain(outcome === 'warnings' ? 'perf-cross-screen-reference' : 'control-type-not-in-manifest');
      expect(context).toContain(outcome === 'warnings' ? 'lblAlpha / Text' : 'ghostCoverage / DefinitelyNotAControl');
      if (outcome === 'refused') expect(context.indexOf('\nREFUSE:')).toBeLessThan(context.indexOf('\nWARN:'));
    }
  });

  it.each(['not JSON', '{}', '{"tool_input":{}}', '{"tool_input":{"directoryPath":42}}'])('allows inapplicable input before compile: %s', input => {
    const result = run(PRE, input, mode);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    if (mode === 'off') expect(result.stderr).toBe('');
    else expect(result.stderr).toContain('allowing');
    expect(result.stderr).not.toContain('validating');
  });

  it.each(['missing', 'file'])('allows a %s directoryPath before compile', kind => {
    const target = kind === 'missing' ? join(temp, 'absent') : join(folders.clean, 'screen.pa.yaml');
    const result = run(PRE, payload(target), mode);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    if (mode === 'off') expect(result.stderr).toBe('');
    else expect(result.stderr).toContain('allowing');
  });

  it.each(Object.keys(FIXTURES) as Outcome[])('reminds after compiling a %s folder', outcome => {
    const result = run(POST, payload(folders[outcome]), mode);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    if (mode === 'off') expect(result.stdout).toBe('');
    else postContext(result.stdout);
  });

  it('silently ignores malformed input after compile', () => {
    const result = run(POST, 'not JSON', mode);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it('still reminds after compile when directoryPath is missing', () => {
    const result = run(POST, '{"tool_input":{}}', mode);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    if (mode === 'off') expect(result.stdout).toBe('');
    else postContext(result.stdout);
  });

  it('handles a missing validator artifact according to the mode', () => {
    const tools = join(temp, `tools-${mode}`);
    mkdirSync(tools);
    const copied = join(tools, 'precompile-hook.mjs');
    copyFileSync(PRE, copied);
    copyFileSync(join(ROOT, 'cli/validate.mjs'), join(tools, 'validate.mjs'));
    const result = run(copied, payload(folders.clean), mode);
    expect(result.status).toBe(mode === 'block' ? 2 : 0);
    if (mode === 'warn') {
      const json = JSON.parse(result.stdout);
      expect(json.hookSpecificOutput).toEqual({
        hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: expect.any(String),
      });
      expect(json.hookSpecificOutput.additionalContext).toContain('unable to load analyzer core artifact');
      expect(json.systemMessage).toContain('gate is set to warn');
    } else {
      expect(result.stdout).toBe('');
    }
    if (mode === 'off') expect(result.stderr).toBe('');
    else expect(result.stderr).toContain('validator infrastructure error');
  });
});

describe('compile gate settings and bounded findings', () => {
  it('keeps malformed postcompile input silent even with an unknown setting', () => {
    const result = run(POST, 'not JSON', 'unknown');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });

  it.each([
    ['launch failure', "{ error: new Error('synthetic launch failure'), status: null, signal: null, stderr: null }", 'validator failed to launch'],
    ['signal', "{ status: null, signal: 'SIGTERM' }", 'validator terminated without an exit status'],
    ['missing status', '{ status: null, signal: null }', 'validator terminated without an exit status'],
    ['unexpected exit', '{ status: 7, signal: null }', 'validator infrastructure error'],
    ['malformed report', "{ status: 0, signal: null, stdout: 'not JSON' }", 'invalid JSON report'],
  ])('allows warn mode on a validator %s', (name, childResult, detail) => {
    const preload = join(temp, `${name.replaceAll(' ', '-')}.mjs`);
    writeFileSync(preload, `import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
childProcess.spawnSync = () => (${childResult});
syncBuiltinESMExports();
`);
    // Isolate the simulated child result in this hook process only.
    const result = run(PRE, payload(folders.clean), 'warn', undefined, ['--import', pathToFileURL(preload).href]);
    expect(result.status).toBe(0);
    const json = JSON.parse(result.stdout);
    expect(json.hookSpecificOutput).toEqual({
      hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext: expect.any(String),
    });
    expect(json.hookSpecificOutput.additionalContext).toContain(detail);
    expect(json.systemMessage).toContain('gate is set to warn');
  });

  it('defaults to block', () => {
    const result = run(PRE, payload(folders.refused));
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('REFUSE — compile_canvas blocked');
  });

  it.each([PRE, POST])('falls back to block with a note for an unknown mode: %s', script => {
    const result = run(script, payload(folders.refused), 'unknown', 'off');
    expect(result.stderr).toContain('unknown compile gate mode "unknown"; using block');
    if (script === PRE) {
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('REFUSE — compile_canvas blocked');
    } else {
      expect(result.status).toBe(0);
      postContext(result.stdout);
    }
  });

  it.each([PRE, POST])('uses the manual environment setting when no plugin setting exists: %s', script => {
    const result = run(script, payload(folders.refused), undefined, 'off');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    const warned = run(script, payload(folders.refused), undefined, 'warn');
    expect(warned.status).toBe(0);
    if (script === PRE) preContext(warned.stdout, true);
    else postContext(warned.stdout);
  });

  it.each([PRE, POST])('gives the plugin setting precedence over the manual setting: %s', script => {
    const disabled = run(script, payload(folders.refused), 'off', 'block');
    expect(disabled.status).toBe(0);
    expect(disabled.stdout).toBe('');
    expect(disabled.stderr).toBe('');
    const enabled = run(script, payload(folders.refused), 'block', 'off');
    expect(enabled.status).toBe(script === PRE ? 2 : 0);
    if (script === PRE) {
      expect(enabled.stdout).toBe('');
      expect(enabled.stderr).toContain('REFUSE — compile_canvas blocked');
    } else postContext(enabled.stdout);
  });

  it.each(['block', 'warn'])('caps WARN context at 20 finding lines in %s mode', mode => {
    const folder = join(temp, `many-warnings-${mode}`);
    mkdirSync(folder);
    const yaml = readFileSync(join(folders.warnings, 'screen.pa.yaml'), 'utf8');
    for (let index = 0; index < 21; index++) {
      writeFileSync(join(folder, `${index}.pa.yaml`), yaml.replaceAll('Alpha', `Alpha${index}`).replaceAll('Beta', `Beta${index}`));
    }
    const warnings = run(PRE, payload(folder), mode);
    expect(warnings.status).toBe(0);
    const context = preContext(warnings.stdout, false);
    expect(context).toContain('0 REFUSE issue(s), 21 WARN issue(s)');
    expect(context.split('\n').filter(line => line.startsWith('WARN:'))).toHaveLength(20);
    expect(context).toContain('1 more finding(s) omitted');
    if (mode === 'warn') {
      copyFileSync(join(folders.refused, 'screen.pa.yaml'), join(folder, 'refuse.pa.yaml'));
      const mixed = run(PRE, payload(folder), mode);
      expect(mixed.status).toBe(0);
      const mixedContext = preContext(mixed.stdout, true);
      const lines = mixedContext.split('\n').filter(line => /^(REFUSE|WARN):/.test(line));
      expect(lines).toHaveLength(20);
      expect(lines.slice(0, 6).every(line => line.startsWith('REFUSE:'))).toBe(true);
      expect(lines.slice(6).every(line => line.startsWith('WARN:'))).toBe(true);
      expect(mixedContext).toContain('8 more finding(s) omitted');
    }
  });
});
