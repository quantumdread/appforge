import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveIntake } from '../../cli/lib/intake.mjs';

type SourceKind = 'directory' | 'msapp' | 'solution';
type ResolvedBy = 'manifest' | 'directory' | 'archive-entry' | 'unresolved';
type DatasourceType = 'dataverse' | 'sharepoint' | 'sql' | 'excel';
type LimitationKind =
  | 'metadata-absent'
  | 'metadata-unsupported'
  | 'metadata-malformed'
  | 'skipped-symlink'
  | 'skipped-legacy-source';
type LimitationSource =
  | 'datasources'
  | 'connections'
  | 'customizations'
  | 'manifest'
  | 'filesystem'
  | 'dialect';

interface IntakeResult {
  source_kind: SourceKind;
  app_name: {
    value: string | null;
    resolved_by: ResolvedBy;
  };
  files: Array<{
    id: string;
    content: string;
    sha256: string;
  }>;
  datasources: Record<string, DatasourceType>;
  connections: Array<{
    connector_type: string;
    count: number;
  }>;
  limitations: Array<{
    kind: LimitationKind;
    source: LimitationSource;
    detail: string;
  }>;
  fingerprint_basis: string;
}

const LIMITATION_KINDS = new Set<LimitationKind>([
  'metadata-absent',
  'metadata-unsupported',
  'metadata-malformed',
  'skipped-symlink',
  'skipped-legacy-source',
]);
const LIMITATION_SOURCES = new Set<LimitationSource>([
  'datasources',
  'connections',
  'customizations',
  'manifest',
  'filesystem',
  'dialect',
]);
const RESOLVED_BY = new Set<ResolvedBy>([
  'manifest',
  'directory',
  'archive-entry',
  'unresolved',
]);
const DATASOURCE_TYPES = new Set<DatasourceType>([
  'dataverse',
  'sharepoint',
  'sql',
  'excel',
]);
const FINGERPRINT_PATTERNS: Record<SourceKind, RegExp> = {
  directory: /^directory\/src-stripped\/v1$/u,
  msapp: /^msapp\/src-stripped\/v1$/u,
  solution: /^solution\/[^/]+\/src-stripped\/v1$/u,
};

const REAL_MSAPP = process.env.APPFORGE_REAL_MSAPP;
const REAL_SOLUTION = process.env.APPFORGE_REAL_SOLUTION;
const REAL_SOLUTION_APP = process.env.APPFORGE_REAL_SOLUTION_APP;

function compareLexically(left: string, right: string) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function configuredPath(value: string | undefined, envName: string) {
  expect(value, `${envName} must be set for this real-export gate`).toBeDefined();
  if (value === undefined) {
    throw new Error(`${envName} is unexpectedly unset`);
  }
  expect(
    existsSync(value),
    `${envName} is set but does not point to an existing file`,
  ).toBe(true);
  return value;
}

function structuralChecks(result: IntakeResult, expectedSourceKind: SourceKind) {
  expect(result.source_kind).toBe(expectedSourceKind);

  expect(result.files.length).toBeGreaterThan(0);
  const ids = result.files.map(file => file.id);
  for (const file of result.files) {
    expect(file.id.length).toBeGreaterThan(0);
    expect(file.id.includes('\\')).toBe(false);
    expect(file.id.startsWith('/')).toBe(false);
    expect(file.id.startsWith('Src/')).toBe(false);
    const segs = file.id.split('/');
    expect(segs.includes('') || segs.includes('.') || segs.includes('..')).toBe(false);
    expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(typeof file.content).toBe('string');
  }
  expect(ids.every((id, index) => index === 0 || ids[index - 1] <= id)).toBe(true);
  expect(new Set(ids.map(id => id.toLowerCase())).size).toBe(ids.length);

  expect(RESOLVED_BY.has(result.app_name.resolved_by)).toBe(true);
  if (result.app_name.resolved_by === 'unresolved') {
    expect(result.app_name.value === null).toBe(true);
  } else {
    expect(typeof result.app_name.value).toBe('string');
    expect(result.app_name.value).not.toBeNull();
  }

  expect(Object.values(result.datasources).every(value => DATASOURCE_TYPES.has(value)))
    .toBe(true);

  const connectorTypes = result.connections.map(connection => connection.connector_type);
  for (const connection of result.connections) {
    expect(Object.keys(connection).sort(compareLexically)).toEqual(['connector_type', 'count']);
    expect(typeof connection.connector_type).toBe('string');
    expect(connection.connector_type.trim().length).toBeGreaterThan(0);
    expect(connection.connector_type).toBe(connection.connector_type.toLowerCase());
    expect(Number.isInteger(connection.count)).toBe(true);
    expect(connection.count).toBeGreaterThan(0);
  }
  expect(connectorTypes).toEqual([...connectorTypes].sort(compareLexically));

  expect(result.limitations.every(limitation => (
    LIMITATION_KINDS.has(limitation.kind)
    && LIMITATION_SOURCES.has(limitation.source)
  ))).toBe(true);

  expect(FINGERPRINT_PATTERNS[expectedSourceKind].test(result.fingerprint_basis)).toBe(true);
}

function logRedactedDiscovery(label: 'msapp' | 'solution', result: IntakeResult) {
  const datasourceTypes = [...new Set(Object.values(result.datasources))].sort(compareLexically);
  const connectorTypes = result.connections
    .map(connection => connection.connector_type)
    .sort(compareLexically);
  const limitations = result.limitations.map(({ kind, source }) => ({ kind, source }));

  console.log(`[real-export][REDACTED] discovery ${JSON.stringify({
    label,
    source_kind: result.source_kind,
    shape: {
      result_keys: Object.keys(result).sort(compareLexically),
      app_name_keys: Object.keys(result.app_name).sort(compareLexically),
      file_entry_keys: Object.keys(result.files[0] ?? {}).sort(compareLexically),
      connection_entry_keys: Object.keys(result.connections[0] ?? {}).sort(compareLexically),
      limitation_entry_keys: Object.keys(result.limitations[0] ?? {}).sort(compareLexically),
    },
    counts: {
      files: result.files.length,
      datasource_keys: Object.keys(result.datasources).length,
      connections: result.connections.length,
      limitations: result.limitations.length,
    },
    app_name: {
      resolved_by: result.app_name.resolved_by,
      has_value: result.app_name.value !== null,
    },
    datasource_types: datasourceTypes,
    connector_types: connectorTypes,
    limitations,
  })}`);
}

function resolveRealSolution(targetPath: string) {
  return (REAL_SOLUTION_APP === undefined
    ? resolveIntake(targetPath)
    : resolveIntake(targetPath, { appName: REAL_SOLUTION_APP })) as IntakeResult;
}

function resolveRedacted<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    const details = error as {
      constructor?: { name?: string };
      code?: unknown;
      reason?: unknown;
    } | null | undefined;
    const name = details?.constructor?.name ?? 'Error';
    const code = details?.code ?? '';
    const reason = details?.reason ?? '';
    throw new Error(
      `[real-export][REDACTED] intake threw ${name} code=${code} reason=${reason} `
      + '(message withheld: may contain customer vocabulary)',
    );
  }
}

function fingerprintFileSet(result: IntakeResult) {
  return [...new Set(result.files.map(({ id, sha256 }) => JSON.stringify([id, sha256])))]
    .sort(compareLexically);
}

describe('real-export gate status', () => {
  it('reports configured and skipped real-export inputs', () => {
    if (REAL_MSAPP === undefined) {
      expect(process.env.APPFORGE_REAL_MSAPP).toBeUndefined();
    } else {
      expect(Boolean(REAL_MSAPP)).toBe(true);
    }
    if (REAL_SOLUTION === undefined) {
      expect(process.env.APPFORGE_REAL_SOLUTION).toBeUndefined();
    } else {
      expect(process.env.APPFORGE_REAL_SOLUTION).toBe(REAL_SOLUTION);
    }

    console.log(`[real-export][REDACTED] gate-state ${JSON.stringify({
      msapp: REAL_MSAPP === undefined ? 'EXPERIMENTAL-skipped' : 'configured',
      solution: REAL_SOLUTION === undefined ? 'EXPERIMENTAL-skipped' : 'configured',
      solution_app_selector_configured: REAL_SOLUTION_APP !== undefined,
    })}`);
  });
});

describe.skipIf(REAL_MSAPP === undefined)('real msapp export', () => {
  it('passes the structural ship gate and emits redacted discovery', () => {
    const targetPath = configuredPath(REAL_MSAPP, 'APPFORGE_REAL_MSAPP');
    const result = resolveRedacted(() => resolveIntake(targetPath) as IntakeResult);

    structuralChecks(result, 'msapp');
    logRedactedDiscovery('msapp', result);
  });
});

describe.skipIf(REAL_SOLUTION === undefined)('real solution export', () => {
  it('passes the structural ship gate and emits redacted discovery', () => {
    const targetPath = configuredPath(REAL_SOLUTION, 'APPFORGE_REAL_SOLUTION');
    const result = resolveRedacted(() => resolveRealSolution(targetPath));

    structuralChecks(result, 'solution');
    logRedactedDiscovery('solution', result);
  });
});

describe.skipIf(REAL_MSAPP === undefined || REAL_SOLUTION === undefined)(
  'real-export fingerprint cross-check',
  () => {
    it('records whether the exports contain the same fingerprint file set', () => {
      const msappPath = configuredPath(REAL_MSAPP, 'APPFORGE_REAL_MSAPP');
      const solutionPath = configuredPath(REAL_SOLUTION, 'APPFORGE_REAL_SOLUTION');
      const msapp = resolveRedacted(() => resolveIntake(msappPath) as IntakeResult);
      const solution = resolveRedacted(() => resolveRealSolution(solutionPath));

      structuralChecks(msapp, 'msapp');
      structuralChecks(solution, 'solution');
      const msappFileSet = fingerprintFileSet(msapp);
      const solutionFileSet = fingerprintFileSet(solution);
      expect(msappFileSet.length).toBe(msapp.files.length);
      expect(solutionFileSet.length).toBe(solution.files.length);

      console.log(`[real-export][REDACTED] fingerprint-cross-check ${JSON.stringify({
        msapp_file_count: msapp.files.length,
        solution_file_count: solution.files.length,
        fingerprint_file_sets_match: (
          msappFileSet.length === solutionFileSet.length
          && msappFileSet.every((value, index) => value === solutionFileSet[index])
        ),
      })}`);
    });
  },
);
