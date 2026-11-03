import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ISSUE_KINDS, reportIssue } from '../src/tools/report-issue';
import { issueInput } from './helpers/report-issue-contract';

const ROOT = resolve(__dirname, '../..');
// The forms deliberately use JSON syntax, a YAML subset, so no YAML dependency is needed.
const readYamlForm = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

describe('public issue forms', () => {
  it.each(ISSUE_KINDS)('accepts every prefilled field for %s and requires containment', kind => {
    const result = reportIssue.handler({ ...issueInput, kind });
    const url = new URL(result.content[0].text.split('\n')[0]);
    const form = readYamlForm(`.github/ISSUE_TEMPLATE/${url.searchParams.get('template')}`);
    const fields = new Map<string, any>(form.body.filter((field: any) => field.id).map((field: any) => [field.id, field]));
    expect(form.body.filter((field: any) => field.id)).toHaveLength(fields.size);
    for (const id of url.searchParams.keys()) {
      if (id !== 'template' && id !== 'title') expect(fields.has(id), id).toBe(true);
    }
    expect(fields.get('kind').attributes.options).toContain(kind);
    expect(fields.get('summary').type).toBe('textarea');
    expect(fields.get('appforge_version').type).toBe('input');
    expect(fields.get('evidence_class').attributes.options).toEqual(['compile_canvas', 'studio_observation', 'visual', 'inferred']);
    expect(fields.get('repro_yaml').attributes.render).toBe('yaml');
    const containment = fields.get('containment');
    expect(containment.type).toBe('checkboxes');
    expect(containment.validations.required).toBe(true);
    expect(containment.attributes.options).toEqual([
      { label: 'I removed customer and company names, tenant, environment and app ids, internal URLs and real data', required: true },
      { label: 'The repro is the smallest YAML that shows the problem', required: true },
    ]);
    const required = kind.startsWith('false-') ? ['rule_id', 'expected', 'actual']
      : kind === 'catalog-gap' ? ['control_type', 'property_or_variant']
        : kind === 'tool-behaviour' ? ['tool_name', 'expected', 'actual']
          : kind === 'doc-error' ? ['document', 'section'] : [];
    for (const id of required) expect(fields.has(id), id).toBe(true);
  });

  it('disables blank issues', () => {
    expect(readFileSync(resolve(ROOT, '.github/ISSUE_TEMPLATE/config.yml'), 'utf8').trim()).toBe('blank_issues_enabled: false');
  });
});

describe('plugin packaging', () => {
  it('ships compile hooks with exact tool matchers and executable argument paths', () => {
    const config = readYamlForm('hooks/hooks.json');
    expect(Object.keys(config)).toEqual(['hooks']);
    expect(Object.keys(config.hooks).sort()).toEqual(['PostToolUse', 'PreToolUse']);
    for (const [event, script, timeout] of [
      ['PreToolUse', 'precompile-hook.mjs', 120],
      ['PostToolUse', 'postcompile-hook.mjs', 10],
    ] as const) {
      expect(config.hooks[event]).toHaveLength(1);
      const entry = config.hooks[event][0];
      expect(entry.matcher).toBe('^mcp__.*__compile_canvas$');
      const matcher = new RegExp(entry.matcher);
      for (const name of [
        'mcp__plugin_canvas-apps_canvas-authoring__compile_canvas',
        'mcp__canvas-authoring__compile_canvas',
      ]) expect(matcher.test(name), name).toBe(true);
      for (const name of ['compile_canvas_v2', 'mcp__x__compile_canvas_v2', 'mcp__x__compile_canvas_extra']) {
        expect(matcher.test(name), name).toBe(false);
      }
      expect(entry.hooks).toEqual([{
        type: 'command', command: 'node', args: [`\${CLAUDE_PLUGIN_ROOT}/cli/${script}`], timeout,
      }]);
      for (const hook of entry.hooks) {
        for (const arg of hook.args) expect(existsSync(arg.replace('${CLAUDE_PLUGIN_ROOT}', ROOT))).toBe(true);
      }
    }
  });

  it('offers exactly block, warn and off with block as the default compile gate', () => {
    const option = readYamlForm('.claude-plugin/plugin.json').userConfig.compile_gate;
    expect(option.type).toBe('string');
    expect(option.options).toEqual(['block', 'warn', 'off']);
    expect(option.default).toBe('block');
    expect(option.title.trim().length).toBeGreaterThan(0);
    expect(option.description.trim().length).toBeGreaterThan(0);
  });

  it('matches the package version and points its inline MCP server at an existing artifact', () => {
    const plugin = readYamlForm('.claude-plugin/plugin.json');
    const pkg = readYamlForm('server/package.json');
    expect(plugin.name).toBe('appforge');
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.license).toBe('MIT');
    expect(plugin.homepage).toBe('https://github.com/quantumdread/appforge');
    expect(plugin.repository).toBe(plugin.homepage);
    expect(plugin.keywords.length).toBeGreaterThan(0);
    expect(plugin.mcpServers.appforge).toEqual({
      command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/server/dist-local/appforge-mcp.mjs'],
    });
    for (const arg of plugin.mcpServers.appforge.args) {
      expect(existsSync(arg.replace('${CLAUDE_PLUGIN_ROOT}', ROOT))).toBe(true);
    }
    expect(existsSync(resolve(ROOT, '.mcp.json'))).toBe(false);
  });

  it('lists exactly one plugin at the marketplace root', () => {
    const marketplace = readYamlForm('.claude-plugin/marketplace.json');
    expect(marketplace.name).toBe('appforge');
    expect(marketplace.owner).toEqual({ name: 'quantumdread' });
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]).toMatchObject({ name: 'appforge', source: './' });
    expect(marketplace.plugins[0].source).not.toContain('..');
  });
});
