import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { readSurveyAggregates } from '../scripts/read-survey-aggregates.mjs';

const CAPTURED_AT = '2026-09-08T09:00:00.000Z';
const CATALOG_A = '2026-08-30T08:00:00.000Z';
const CATALOG_B = '2026-08-30T08:00:00.001Z';
const COHORT_A = 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.000Z';
const COHORT_B = 'survey:cohort:v1:catalog:2026-08-30T08%3A00%3A00.001Z';
const MCP = resolve(__dirname, '..');
const CLI = join(MCP, 'scripts/read-survey-aggregates.mjs');
const temporaryDirectories: string[] = [];

function runCli(raw: string | Uint8Array, args: string[] = []) {
  const directory = mkdtempSync(join(tmpdir(), 'appforge-survey-export-'));
  temporaryDirectories.push(directory);
  const path = join(directory, 'capture.json');
  writeFileSync(path, raw);
  return spawnSync(process.execPath, [CLI, path, ...args], { cwd: directory, encoding: 'utf8', windowsHide: true });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'appforge-survey-export-')) {
      throw new Error('Unexpected temporary test directory');
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

function capture(rows: Array<[string, string | number]>) {
  return {
    schema: 'survey-aggregate-export/1',
    captured_at: CAPTURED_AT,
    complete_snapshot: true,
    rows: rows.map(([metric_key, count]) => ({ metric_key, count })),
  };
}

describe('offline survey aggregate reader', () => {
  it.each([
    ['wrong schema', { ...capture([]), schema: 'other' }],
    ['unknown header', { ...capture([]), extra: 'private value' }],
    ['missing timestamp', { schema: 'survey-aggregate-export/1', complete_snapshot: true, rows: [] }],
    ['invalid timestamp', { ...capture([]), captured_at: 'not a date' }],
    ['impossible calendar date', { ...capture([]), captured_at: '2026-02-30T00:00:00.000Z' }],
    ['numeric date shorthand', { ...capture([]), captured_at: '0' }],
    ['partial snapshot', { ...capture([]), complete_snapshot: false }],
    ['nonboolean snapshot', { ...capture([]), complete_snapshot: 'true' }],
    ['nonarray rows', { ...capture([]), rows: {} }],
    ['extra row field', { ...capture([]), rows: [{ metric_key: 'stats:survey', count: '1', private: 'data' }] }],
    ['missing row field', { ...capture([]), rows: [{ metric_key: 'stats:survey' }] }],
    ['empty metric key', capture([['', '0']])],
    ['duplicate relevant key', capture([['stats:survey', '1'], ['stats:survey', '1']])],
    ['duplicate unknown key', capture([['future:key', '0'], ['future:key', '0']])],
    ['negative decimal', capture([['stats:survey', '-1']])],
    ['leading zero', capture([['stats:survey', '01']])],
    ['noncanonical zero', capture([['stats:survey', '-0']])],
    ['decimal fraction', capture([['stats:survey', '1.5']])],
    ['exponent string', capture([['stats:survey', '1e3']])],
    ['overflow decimal', capture([['stats:survey', '9223372036854775808']])],
    ['unsafe JSON number', capture([['stats:survey', 9007199254740992]])],
    ['negative number', capture([['stats:survey', -1]])],
    ['fractional number', capture([['stats:survey', 1.5]])],
    ['invalid unknown count', capture([['future:private', '-1']])],
    ['missing global rule id', capture([['survey:rule:', '1']])],
    ['unescaped separator', capture([['survey:rule:some:rule', '1']])],
    ['noncanonical escaped character', capture([['survey:rule:%61', '1']])],
    ['broken escape', capture([['survey:rule:%GG', '1']])],
    ['wrong cohort dimension', capture([['survey:cohort:v1:source:x:runs', '1']])],
    ['missing cohort suffix', capture([[COHORT_A, '1']])],
    ['extra cohort segment', capture([[`${COHORT_A}:runs:extra`, '1']])],
    ['missing cohort rule id', capture([[`${COHORT_A}:rule:`, '1']])],
    ['missing cohort catalog', capture([['survey:cohort:v1:catalog::runs', '1']])],
    ['lowercase escape', capture([['survey:cohort:v1:catalog:2026-08-30T08%3a00%3A00.000Z:runs', '1']])],
    ['missing global runs', capture([['survey:rule:unknown-control', '1']])],
    ['missing cohort runs', capture([['stats:survey', '1'], ['survey:rule:unknown-control', '1'], [`${COHORT_A}:rule:unknown-control`, '1']])],
    ['negative run residual', capture([['stats:survey', '1'], [`${COHORT_A}:runs`, '2']])],
    ['negative rule residual', capture([['stats:survey', '1'], ['survey:rule:unknown-control', '1'], [`${COHORT_A}:runs`, '1'], [`${COHORT_A}:rule:unknown-control`, '2']])],
    ['missing global rule', capture([['stats:survey', '1'], [`${COHORT_A}:runs`, '1'], [`${COHORT_A}:rule:unknown-control`, '1']])],
    ['global findings without runs', capture([['stats:survey', '0'], ['survey:rule:unknown-control', '1']])],
    ['cohort findings without runs', capture([['stats:survey', '1'], ['survey:rule:unknown-control', '1'], [`${COHORT_A}:runs`, '0'], [`${COHORT_A}:rule:unknown-control`, '1']])],
  ])('rejects %s instead of inventing a complete cohort report', (_label, value) => {
    expect(() => readSurveyAggregates(value)).toThrow();
  });

  it('ranks exact catalog cohorts and preserves global and unattributed counts independently', () => {
    const result = readSurveyAggregates(capture([
      ['stats:survey', '6'],
      ['survey:rule:unknown-control', '10'],
      ['survey:rule:label-missing-wrap', '12'],
      [`${COHORT_B}:rule:unknown-control`, '7'],
      [`${COHORT_A}:runs`, '2'],
      [`${COHORT_B}:runs`, '3'],
      [`${COHORT_A}:rule:unknown-control`, '2'],
      [`${COHORT_A}:rule:label-missing-wrap`, '9'],
      [`${COHORT_B}:rule:label-missing-wrap`, '1'],
      ['survey:version:catalog:2026-08-30T08%3A00%3A00.000Z', '5'],
      ['future:private-name-formula-or-path', '99'],
    ]));
    expect(result).toEqual({
      schema: 'survey-aggregate-report/1',
      captured_at: CAPTURED_AT,
      complete_snapshot: true,
      measurement: 'deduplicated_finding_counts_across_accepted_submissions',
      global: {
        accepted_runs: '6',
        rules: [{ rule_id: 'label-missing-wrap', findings: '12' }, { rule_id: 'unknown-control', findings: '10' }],
      },
      catalogs: [
        { catalog: CATALOG_A, accepted_runs: '2', rules: [{ rule_id: 'label-missing-wrap', findings: '9' }, { rule_id: 'unknown-control', findings: '2' }] },
        { catalog: CATALOG_B, accepted_runs: '3', rules: [{ rule_id: 'unknown-control', findings: '7' }, { rule_id: 'label-missing-wrap', findings: '1' }] },
      ],
      legacy_unattributed: {
        accepted_runs: '1',
        rules: [{ rule_id: 'label-missing-wrap', findings: '2' }, { rule_id: 'unknown-control', findings: '1' }],
      },
      ignored_metric_rows: 2,
    });
    expect(JSON.stringify(result)).not.toContain('private-name-formula-or-path');
  });

  it('refuses unattributed findings when all accepted runs already have cohorts', () => {
    expect(() => readSurveyAggregates(capture([
      ['stats:survey', '1'], ['survey:rule:unknown-control', '2'],
      [`${COHORT_A}:runs`, '1'], [`${COHORT_A}:rule:unknown-control`, '1'],
    ]))).toThrow('Unattributed finding counts require unattributed accepted runs');
  });

  it('prints a machine-readable report from an external working directory', () => {
    const result = runCli(JSON.stringify(capture([['stats:survey', '2']])), ['--json']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema: 'survey-aggregate-report/1', global: { accepted_runs: '2' },
      catalogs: [], legacy_unattributed: { accepted_runs: '2' },
    });
  });

  it('retains zero-finding cohorts and uses lexical rule ids to break count ties', () => {
    const value = capture([
      ['stats:survey', 4], ['survey:rule:unknown-control', 3], ['survey:rule:label-missing-wrap', 3],
      [`${COHORT_B}:runs`, 3], [`${COHORT_A}:runs`, 1],
      [`${COHORT_A}:rule:unknown-control`, 3], [`${COHORT_A}:rule:label-missing-wrap`, 3],
    ]);
    const report = readSurveyAggregates(value);
    expect(report.catalogs).toEqual([
      { catalog: CATALOG_A, accepted_runs: '1', rules: [{ rule_id: 'label-missing-wrap', findings: '3' }, { rule_id: 'unknown-control', findings: '3' }] },
      { catalog: CATALOG_B, accepted_runs: '3', rules: [] },
    ]);
    expect(readSurveyAggregates({ ...value, rows: [...value.rows].reverse() })).toEqual(report);
    const displayed = runCli(JSON.stringify(value));
    expect(displayed.status).toBe(0);
    expect(displayed.stdout).toContain(`Catalog "${CATALOG_B}"; accepted runs: 3\n  No reported findings.`);
  });

  it('decodes canonical encoded segments without conflating URI delimiter text', () => {
    const report = readSurveyAggregates(capture([
      ['stats:survey', '1'], ['survey:rule:rule%3A%2F%25!', '2'],
      [`${COHORT_A}:runs`, '1'], [`${COHORT_A}:rule:rule%3A%2F%25!`, '2'],
      ['survey:cohort:v2:private-source:value:runs', '9'],
    ]));
    expect(report.catalogs[0].rules).toEqual([{ rule_id: 'rule:/%!', findings: '2' }]);
    expect(report.ignored_metric_rows).toBe(1);
    expect(JSON.stringify(report)).not.toContain('private-source');
  });

  it.each([
    ['truncated JSON', '{"private_name":"sensitive",'],
    ['invalid UTF-8', Uint8Array.of(0xff)],
    ['partial export', JSON.stringify({ ...capture([]), complete_snapshot: false })],
    ['invalid schema', JSON.stringify({ ...capture([]), schema: 'private-name' })],
    ['unsafe number', '{"schema":"survey-aggregate-export/1","captured_at":"2026-09-08T09:00:00.000Z","complete_snapshot":true,"rows":[{"metric_key":"stats:survey","count":9223372036854775807}]}'],
    ['malformed encoded key', JSON.stringify(capture([['survey:rule:private-name:extra', '1']]))],
  ])('rejects %s with no partial report or input disclosure', (_label, raw) => {
    const result = runCli(raw, ['--json']);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toMatch(/private-name|private_name|sensitive|survey:rule/);
  });

  it('rejects unknown options and a missing local capture without leaking its path', () => {
    expect(runCli(JSON.stringify(capture([])), ['--unknown']).status).toBe(2);
    const missing = spawnSync(process.execPath, [CLI, join(MCP, 'private-missing-capture.json')], {
      cwd: MCP, encoding: 'utf8', windowsHide: true,
    });
    expect(missing.status).toBe(3);
    expect(missing.stdout).toBe('');
    expect(missing.stderr).toBe('Cannot read the local survey aggregate export file.\n');
    const usage = spawnSync(process.execPath, [CLI], { cwd: MCP, encoding: 'utf8', windowsHide: true });
    expect(usage.status).toBe(2);
    expect(usage.stdout).toBe('');
    expect(usage.stderr).toContain('Usage:');
  });

  it('explains legacy-only totals without allocating catalog marginals', () => {
    const result = runCli(JSON.stringify(capture([
      ['stats:survey', '6'], ['survey:rule:unknown-control', '9'],
      ['survey:version:catalog:2026-08-30T08%3A00%3A00.000Z', '6'],
    ])));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('No attributable rule-by-catalog data');
    expect(result.stdout).toContain('Global accepted runs: 6');
    expect(result.stdout).toContain('"unknown-control": 9');
    expect(result.stdout).toContain('Legacy unattributed accepted runs: 6');
    expect(result.stdout).not.toContain(CATALOG_A);
    expect(result.stdout).toContain('not unique apps, users, raw occurrences, or proof of defects');
  });

  it.each([false, true])('executes the exact operator SQL locally (int64 rows: %s) and reads its cell', (hasRows) => {
    const sql = readFileSync(join(MCP, 'scripts/sql/export-survey-aggregates.sql'), 'utf8');
    const db = new DatabaseSync(':memory:');
    let cell: string;
    try {
      db.exec('CREATE TABLE survey_aggregates (metric_key TEXT PRIMARY KEY, count INTEGER NOT NULL)');
      if (hasRows) db.exec(`
        INSERT INTO survey_aggregates(metric_key, count) VALUES
          ('stats:survey', 9223372036854775807),
          ('survey:rule:unknown-control', 9223372036854775807),
          ('${COHORT_A}:runs', 9223372036854775806),
          ('${COHORT_A}:rule:unknown-control', 9223372036854775805);
      `);
      cell = db.prepare(sql).get()!.export_json as string;
    } finally {
      db.close();
    }
    const exported = JSON.parse(cell);
    expect(exported.complete_snapshot).toBe(true);
    expect(new Date(exported.captured_at).toISOString()).toBe(exported.captured_at);
    if (hasRows) expect(exported.rows.find((row: {metric_key: string}) => row.metric_key === 'stats:survey').count)
      .toBe('9223372036854775807');
    else expect(exported.rows).toEqual([]);
    const result = runCli(cell, ['--json']);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report.global.accepted_runs).toBe(hasRows ? '9223372036854775807' : '0');
    expect(report.legacy_unattributed.accepted_runs).toBe(hasRows ? '1' : '0');
    expect(report.legacy_unattributed.rules).toEqual(hasRows ? [{ rule_id: 'unknown-control', findings: '2' }] : []);
  });
});
