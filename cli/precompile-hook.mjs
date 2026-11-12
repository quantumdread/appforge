#!/usr/bin/env node
/**
 * Pre-compile_canvas hook for the canvas-authoring MCP.
 *
 * Registered by hooks/hooks.json (or manually in .claude/settings.json) before any caller
 * (canvas-apps skill, manual invocation, future AppForge pipeline) tries to
 * compile a directory of .pa.yaml files. Runs the AppForge validator and
 * blocks the tool call if any REFUSE-tier issues are found, unless configured otherwise.
 *
 * Hook contract:
 *   - Reads the tool invocation as JSON from stdin.
 *   - Exit 0 → allow compile_canvas to proceed.
 *   - Exit non-zero → block; stderr is surfaced to the agent.
 *
 * The hook is permissive on malformed/inapplicable hook input. Once validation
 * starts, REFUSE and validator-infrastructure failures block in block mode.
 */
import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = resolve(SCRIPT_DIR, 'validate.mjs');
const TAG = '[appforge gate]';
const configuredMode = process.env.CLAUDE_PLUGIN_OPTION_COMPILE_GATE // Claude Code plugin setting.
  ?? process.env.APPFORGE_COMPILE_GATE ?? 'block';
const mode = ['block', 'warn', 'off'].includes(configuredMode) ? configuredMode : 'block';
if (mode === 'off') process.exit(0);
if (mode !== configuredMode) console.error(`${TAG} unknown compile gate mode ${JSON.stringify(configuredMode)}; using block`);

const SETTINGS = 'The user can change the gate in /config (AppForge compile gate), or with APPFORGE_COMPILE_GATE in a manual setup.';

function allowWithContext(additionalContext, systemMessage) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', additionalContext },
    ...(systemMessage ? { systemMessage } : {}),
  }));
  process.exit(0);
}

function infrastructureFailure(detail, diagnostics = '') {
  if (mode === 'warn') {
    allowWithContext(
      `${TAG} ${detail}\n${String(diagnostics ?? '').split(/\r?\n/).filter(Boolean).slice(0, 20).join('\n')}\nMention this validation failure to the user. The compile gate is set to warn, so compilation is allowed.`,
      'AppForge could not complete validation and allowed the compile because the gate is set to warn.',
    );
  }
  console.error(`${TAG} ${detail}`);
  console.error(`${TAG} ${SETTINGS}`);
  process.exit(2);
}

// Reproduce the validator's ordinary text report from its structured output.
function renderText({ reports, tool }) {
  const out = [];
  for (const { file, issues, summary } of reports) {
    out.push(`\n── ${file} ──`);
    for (const [level, marker] of [['REFUSE', '✗'], ['WARN', '!']]) {
      const findings = issues.filter(issue => issue.level === level);
      if (!findings.length) continue;
      out.push(`\n${marker} ${level} (${findings.length})`);
      for (const issue of findings) {
        const subject = issue.property ? `${issue.type}.${issue.property}`
          : issue.variant ? `${issue.type}@${issue.variant}` : issue.type;
        out.push(`  ${file}:${issue.line}  ${issue.control}  ${subject}  → ${issue.detail}`);
      }
    }
    out.push(`\n  pass=${summary.pass}  warn=${summary.warn}  refuse=${summary.refuse}  controls=${summary.controls_seen}`);
  }
  const total = key => reports.reduce((sum, report) => sum + report.summary[key], 0);
  out.push(`\n══ analyzer-core v${tool.version} totals: refuse=${total('refuse')} warn=${total('warn')} files=${reports.length} ══`);
  return `${out.join('\n')}\n`;
}

function findingLine({ file, ...issue }) {
  return `${issue.level}: ${issue.rule ?? issue.detail} / ${file}:${issue.line} / ${issue.control} / ${issue.property ?? issue.variant ?? issue.type} — ${issue.detail}`
    .replace(/[\r\n]+/g, ' ');
}

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => stdinData += c);
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(stdinData); }
  catch {
    console.error(`${TAG} hook payload malformed; allowing tool to proceed`);
    process.exit(0);
  }

  const dir = payload?.tool_input?.directoryPath;
  if (typeof dir !== 'string' || !dir) { console.error(`${TAG} no directoryPath in tool input; allowing`); process.exit(0); }
  let st;
  try { st = statSync(dir); } catch { console.error(`${TAG} ${dir} not accessible; allowing`); process.exit(0); }
  if (!st.isDirectory()) { console.error(`${TAG} ${dir} is not a directory; allowing`); process.exit(0); }

  console.error(`${TAG} validating ${dir} against the catalog before compile_canvas...`);

  // An untouched copy synced before the change, in a sibling folder named
  // "before" (the edit-app layout), lets the validator tell new controls apart.
  const before = resolve(dir, '..', 'before');
  let hasBefore = false;
  try {
    hasBefore = resolve(dir) !== before && statSync(before).isDirectory()
      && readdirSync(before, { recursive: true }).some(name => String(name).endsWith('.pa.yaml'));
  } catch { hasBefore = false; }
  if (hasBefore) console.error(`${TAG} comparing with the earlier copy in ${before}`);
  const args = [VALIDATOR, dir, '--json', ...(hasBefore ? ['--before', before] : [])];
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (r.error) infrastructureFailure(`validator failed to launch: ${r.error.message} — fix the toolchain before compiling`, r.stderr);
  if (r.stderr) process.stderr.write(r.stderr);

  if (r.signal || r.status === null) {
    infrastructureFailure(`validator terminated without an exit status${r.signal ? ` (signal: ${r.signal})` : ''} — fix the toolchain before compiling`, r.stderr);
  }
  if (r.status === 3 || (r.status !== 0 && r.status !== 1)) {
    infrastructureFailure('validator infrastructure error — fix the toolchain before compiling.', r.stderr || r.stdout);
  }

  let result;
  let findings;
  let text;
  try {
    result = JSON.parse(r.stdout);
    findings = result.reports.flatMap(report => report.issues.map(issue => ({ ...issue, file: report.file })));
    text = renderText(result);
    if ((r.status === 1) !== findings.some(issue => issue.level === 'REFUSE')) throw new Error('inconsistent REFUSE status');
  } catch (error) {
    infrastructureFailure(`validator infrastructure error — invalid JSON report: ${error.message}`, r.stderr || r.stdout);
  }
  process.stderr.write(text);
  const refused = findings.filter(issue => issue.level === 'REFUSE');
  const warnings = findings.filter(issue => issue.level === 'WARN');
  const summary = `${TAG} ${refused.length} REFUSE issue(s), ${warnings.length} WARN issue(s).`;
  const lines = [...refused, ...warnings].slice(0, 20).map(findingLine);
  const omitted = refused.length + warnings.length - lines.length;
  const context = [summary, ...lines, ...(omitted ? [`${omitted} more finding(s) omitted.`] : []),
    'Mention these findings to the user.'].join('\n');
  if (refused.length) {
    if (mode === 'warn') {
      allowWithContext(`${context}\nThe compile gate is set to warn, so compilation is allowed.`,
        'AppForge found REFUSE issues and allowed the compile because the gate is set to warn.');
    }
    console.error(`${TAG} REFUSE — compile_canvas blocked. Fix the issues above before retrying. If a REFUSE looks wrong, use /appforge:report-issue.`);
    console.error(`${TAG} ${SETTINGS}`);
    process.exit(2);
  }
  console.error(`${TAG} PASS — proceeding to compile_canvas`);
  if (warnings.length) allowWithContext(context);
  process.exit(0);
});
