#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const compareLexically = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const INT64_MAX = 9223372036854775807n;

function requireFields(value, fields, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== fields.length
    || fields.some(field => !Object.hasOwn(value, field))) {
    throw new TypeError(`${label} must contain exactly its documented fields`);
  }
}

function metricCount(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError('Counts supplied as JSON numbers must be safe nonnegative integers');
    }
  } else if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,18})$/u.test(value)) {
    throw new TypeError('Counts must be canonical nonnegative decimal strings');
  }
  const count = BigInt(value);
  if (count > INT64_MAX) throw new RangeError('Count exceeds the signed-64-bit maximum');
  return count;
}

function metricPart(encoded) {
  let decoded;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    throw new TypeError('Relevant metric key contains an invalid URI encoding');
  }
  if (!encoded || encodeURIComponent(decoded) !== encoded) {
    throw new TypeError('Relevant metric key must use canonical nonempty encoded segments');
  }
  return decoded;
}

function hasFindings(rules) {
  return [...rules.values()].some(count => count > 0n);
}

function rankedRules(rules) {
  return [...rules].sort(([leftId, left], [rightId, right]) => (
    left > right ? -1 : left < right ? 1 : compareLexically(leftId, rightId)
  )).map(([rule_id, count]) => ({ rule_id, findings: count.toString() }));
}

/** Interpret a complete, local survey aggregate export without accessing services. */
export function readSurveyAggregates(value) {
  requireFields(value, ['schema', 'captured_at', 'complete_snapshot', 'rows'], 'Export');
  if (value.schema !== 'survey-aggregate-export/1') throw new TypeError('Unsupported export schema');
  if (typeof value.captured_at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.captured_at)
    || !Number.isFinite(Date.parse(value.captured_at))
    || new Date(value.captured_at).toISOString() !== value.captured_at) {
    throw new TypeError('Export captured_at must be a calendar-valid UTC timestamp with millisecond precision');
  }
  if (value.complete_snapshot !== true) {
    throw new TypeError('A declared complete_snapshot: true is required; partial snapshots cannot establish residual totals');
  }
  if (!Array.isArray(value.rows)) throw new TypeError('Export rows must be an array');
  let runs = 0n;
  let ignored = 0;
  const keys = new Set();
  const globalRules = new Map();
  const cohorts = new Map();
  for (const row of value.rows) {
    requireFields(row, ['metric_key', 'count'], 'Export row');
    if (typeof row.metric_key !== 'string' || !row.metric_key) {
      throw new TypeError('Metric keys must be nonempty strings');
    }
    if (keys.has(row.metric_key)) throw new TypeError('Export contains a duplicate metric key');
    keys.add(row.metric_key);
    const count = metricCount(row.count);
    if (row.metric_key === 'stats:survey') {
      runs = count;
    } else if (row.metric_key.startsWith('stats:survey:')) {
      throw new TypeError('Malformed global run metric key');
    } else if (row.metric_key === 'survey:rule' || row.metric_key.startsWith('survey:rule:')) {
      const segments = row.metric_key.split(':');
      if (segments.length !== 3) throw new TypeError('Malformed global rule metric key');
      globalRules.set(metricPart(segments[2]), count);
    } else if (row.metric_key === 'survey:cohort:v1' || row.metric_key.startsWith('survey:cohort:v1:')) {
      const segments = row.metric_key.split(':');
      const [, , , dimension, encodedCatalog, kind, encodedRule] = segments;
      if (dimension !== 'catalog'
        || !((segments.length === 6 && kind === 'runs') || (segments.length === 7 && kind === 'rule'))) {
        throw new TypeError('Malformed v1 catalog cohort metric key');
      }
      const catalog = metricPart(encodedCatalog);
      const cohort = cohorts.get(catalog) ?? { runs: null, rules: new Map() };
      if (kind === 'runs') cohort.runs = count;
      else cohort.rules.set(metricPart(encodedRule), count);
      cohorts.set(catalog, cohort);
    } else ignored += 1;
  }
  if ((globalRules.size || cohorts.size) && !keys.has('stats:survey')) {
    throw new TypeError('Relevant aggregate rows require the global accepted-run counter');
  }
  if (runs === 0n && hasFindings(globalRules)) {
    throw new TypeError('Global finding counts require accepted runs');
  }
  const legacyRules = new Map(globalRules);
  let legacyRuns = runs;
  for (const cohort of cohorts.values()) {
    if (cohort.runs === null) throw new TypeError('Each catalog cohort requires its accepted-run counter');
    if (cohort.runs === 0n && hasFindings(cohort.rules)) {
      throw new TypeError('Cohort finding counts require accepted runs');
    }
    legacyRuns -= cohort.runs;
    for (const [rule, count] of cohort.rules) {
      if (!legacyRules.has(rule)) throw new TypeError('Joint rule counts require a matching global rule counter');
      legacyRules.set(rule, legacyRules.get(rule) - count);
    }
  }
  if (legacyRuns < 0n || [...legacyRules.values()].some(count => count < 0n)) {
    throw new TypeError('Joint cohort totals exceed global totals');
  }
  if (legacyRuns === 0n && hasFindings(legacyRules)) {
    throw new TypeError('Unattributed finding counts require unattributed accepted runs');
  }
  return {
    schema: 'survey-aggregate-report/1',
    captured_at: value.captured_at,
    complete_snapshot: true,
    measurement: 'deduplicated_finding_counts_across_accepted_submissions',
    global: { accepted_runs: runs.toString(), rules: rankedRules(globalRules) },
    catalogs: [...cohorts].sort(([left], [right]) => compareLexically(left, right))
      .map(([catalog, cohort]) => ({
        catalog,
        accepted_runs: cohort.runs.toString(),
        rules: rankedRules(cohort.rules),
      })),
    legacy_unattributed: { accepted_runs: legacyRuns.toString(), rules: rankedRules(legacyRules) },
    ignored_metric_rows: ignored,
  };
}

function textReport(report) {
  const ruleLines = rules => rules.length
    ? rules.map(row => `  ${JSON.stringify(row.rule_id)}: ${row.findings}`)
    : ['  No reported findings.'];
  const lines = [
    'Survey finding counts by exact catalog',
    `Captured at: ${JSON.stringify(report.captured_at)}`,
    'Counts are deduplicated fingerprint findings across accepted submissions,',
    'not unique apps, users, raw occurrences, or proof of defects.',
    'Catalog accepted runs are not per-rule opportunity denominators.',
    'Completeness is an operator assertion; this reader cannot authenticate the capture.',
    '',
    `Global accepted runs: ${report.global.accepted_runs}`,
    ...ruleLines(report.global.rules),
  ];
  if (report.catalogs.length === 0) lines.push('', 'No attributable rule-by-catalog data.');
  for (const cohort of report.catalogs) {
    lines.push('', `Catalog ${JSON.stringify(cohort.catalog)}; accepted runs: ${cohort.accepted_runs}`,
      ...ruleLines(cohort.rules));
  }
  lines.push('', `Legacy unattributed accepted runs: ${report.legacy_unattributed.accepted_runs}`,
    ...ruleLines(report.legacy_unattributed.rules),
    `Ignored metric rows: ${report.ignored_metric_rows}`);
  return lines.join('\n');
}

function main(args) {
  if (args.length < 1 || args.length > 2 || args[0].startsWith('--')
    || (args.length === 2 && args[1] !== '--json')) {
    process.stderr.write('Usage: node scripts/read-survey-aggregates.mjs <export.json> [--json]\n');
    return 2;
  }
  let raw;
  try {
    raw = readFileSync(args[0]);
  } catch {
    process.stderr.write('Cannot read the local survey aggregate export file.\n');
    return 3;
  }
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  } catch {
    process.stderr.write('Survey aggregate export must contain complete, valid UTF-8 JSON.\n');
    return 2;
  }
  let report;
  try {
    report = readSurveyAggregates(value);
  } catch (error) {
    process.stderr.write(`Survey aggregate export rejected: ${error.message}\n`);
    return 2;
  }
  process.stdout.write(`${args[1] === '--json' ? JSON.stringify(report, null, 2) : textReport(report)}\n`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
