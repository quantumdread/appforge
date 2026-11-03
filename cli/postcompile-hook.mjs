#!/usr/bin/env node
/** Post-compile reminder for the canvas-authoring MCP. */
const configuredMode = process.env.CLAUDE_PLUGIN_OPTION_COMPILE_GATE // Claude Code plugin setting.
  ?? process.env.APPFORGE_COMPILE_GATE ?? 'block';
const mode = ['block', 'warn', 'off'].includes(configuredMode) ? configuredMode : 'block';
if (mode === 'off') process.exit(0);

let stdinData = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => stdinData += chunk);
process.stdin.on('end', () => {
  try { JSON.parse(stdinData); } catch { process.exit(0); }
  if (mode !== configuredMode) console.error(`[appforge gate] unknown compile gate mode ${JSON.stringify(configuredMode)}; using block`);
  const additionalContext = 'AppForge after compile_canvas: a compile is applied to the open app even when its validation reports errors, so check the result. Studio saves automatically. Sync to a new, empty folder (not the folder you compiled), run AppForge compare_child_order with the compiled folder as intended and the new folder as synced, and check the control types too. If it reports reordered or retyped controls, recompile only with the user\'s go-ahead. If Studio says the session expired, reload the app and never resume it. After a bulk rename, ask the user to check every screen\'s tree for leftover temporary names.';
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext } }));
});
