import { classifyModernization } from '../modernization-classification.js';
import { controlNodes } from '../model.js';
import type {
  DatasourceConfidence,
  DatasourceResolution,
  DatasourceType,
} from '../datasource.js';
import type { ReadonlySnapshot } from './readonly.js';
import type {
  BackendRiskInventoryRow,
  ConnectionInventoryRow,
  ComponentInventoryRow,
  DatasourceInventoryRow,
  ScreenInventoryRow,
  StatefulInventory,
  VersionLagInventoryRow,
  ModernizationInventoryRow,
} from './report-types.js';
import { BACKEND_LIMITS } from './backend-limits.js';
import type { FindingConfidence } from './severity.js';

type DatasourceMaps = {
  explicit?: Readonly<Record<string, DatasourceType>>;
  exported?: Readonly<Record<string, DatasourceType>>;
};

type EvidenceResolution = {
  backend: DatasourceType | null;
  resolved_by: DatasourceResolution;
  confidence: DatasourceConfidence;
};

type ConnectionInput = {
  state: 'available' | 'unavailable' | 'empty';
  rows: readonly Readonly<{ connector_type: string; count: number }>[];
};

const CONFIDENCE_ORDER: Readonly<Record<FindingConfidence, number>> = {
  high: 3,
  medium: 2,
  low: 1,
};

function strongerConfidence(
  left: FindingConfidence,
  right: FindingConfidence,
): FindingConfidence {
  return CONFIDENCE_ORDER[left] >= CONFIDENCE_ORDER[right] ? left : right;
}

export function buildConnectionInventory(
  input: ConnectionInput,
): StatefulInventory<ConnectionInventoryRow> {
  if (input.state === 'unavailable') return { state: 'unavailable' };
  const counts = new Map<string, number>();
  for (const row of input.rows) {
    counts.set(row.connector_type, (counts.get(row.connector_type) ?? 0) + row.count);
  }
  const rows = [...counts].sort(([left], [right]) => left.localeCompare(right))
    .map(([connector_type, count]) => ({ connector_type, count }));
  return rows.length === 0 ? { state: 'empty', rows: [] } : { state: 'available', rows };
}

export function buildBackendRiskInventory(
  datasources: StatefulInventory<DatasourceInventoryRow>,
  connections: StatefulInventory<ConnectionInventoryRow>,
): StatefulInventory<BackendRiskInventoryRow> {
  const rows = new Map<string, BackendRiskInventoryRow>();
  if (datasources.state === 'available') {
    for (const datasource of datasources.rows) {
      if (datasource.backend === null || datasource.backend === 'collection') continue;
      const confidence: FindingConfidence = datasource.confidence === 'none'
        ? 'low'
        : datasource.confidence;
      const current = rows.get(datasource.backend);
      if (current) {
        current.confidence = strongerConfidence(current.confidence, confidence);
        continue;
      }
      const facts = BACKEND_LIMITS[datasource.backend as keyof typeof BACKEND_LIMITS];
      rows.set(datasource.backend, {
        connector_type: datasource.backend,
        count: null,
        documented_limits: facts?.documented_limits.map(limit => ({ ...limit })) ?? [],
        premium: facts?.premium ?? null,
        confidence,
        unknowns: [],
      });
    }
  }
  if (connections.state === 'available') {
    for (const connection of connections.rows) {
      const current = rows.get(connection.connector_type);
      const facts = BACKEND_LIMITS[connection.connector_type as keyof typeof BACKEND_LIMITS];
      if (current) {
        current.count = connection.count;
        current.confidence = strongerConfidence(current.confidence, 'medium');
      } else {
        rows.set(connection.connector_type, {
          connector_type: connection.connector_type,
          count: connection.count,
          documented_limits: facts?.documented_limits.map(limit => ({ ...limit })) ?? [],
          premium: facts?.premium ?? null,
          confidence: 'medium',
          unknowns: [],
        });
      }
    }
  }

  for (const row of rows.values()) {
    if (row.count === null) row.unknowns.push('Connection count unavailable from this intake.');
    if (row.documented_limits.length === 0) {
      row.unknowns.push('Documented limits unavailable for this connector type.');
    }
    if (row.premium === null) {
      row.unknowns.push('Premium classification unavailable for this connector type.');
    }
  }
  const merged = [...rows.values()].sort((left, right) =>
    left.connector_type.localeCompare(right.connector_type));
  if (merged.length > 0) return { state: 'available', rows: merged };
  return connections.state === 'unavailable'
    ? { state: 'unavailable' }
    : { state: 'empty', rows: [] };
}

export function buildDatasourceInventory(
  snapshot: ReadonlySnapshot,
  maps: DatasourceMaps,
): StatefulInventory<DatasourceInventoryRow> {
  const names = new Set<string>([
    ...Object.keys(maps.explicit ?? {}),
    ...Object.keys(maps.exported ?? {}),
  ]);
  const byEvidence = new Map<string, EvidenceResolution>();
  for (const reference of snapshot.datasourceReferences) {
    names.add(reference.authoredName);
    byEvidence.set(reference.authoredName, {
      backend: reference.backend ?? null,
      resolved_by: reference.resolvedBy,
      confidence: reference.confidence,
    });
  }
  // Retain pre-existing issue-derived rows when bounded lexical collection skips
  // an expression; findings are a compatibility fallback, not source discovery.
  for (const issue of snapshot.validation.issues) {
    if (issue.evidence?.kind !== 'bound-source') continue;
    const evidence = issue.evidence;
    names.add(evidence.authoredName);
    if (!byEvidence.has(evidence.authoredName)) {
      byEvidence.set(evidence.authoredName, {
        backend: evidence.backend ?? null,
        resolved_by: evidence.resolvedBy,
        confidence: evidence.confidence,
      });
    }
  }

  const rows = [...names].sort().map((name): DatasourceInventoryRow => {
    if (maps.explicit && Object.hasOwn(maps.explicit, name)) {
      return {
        name,
        backend: maps.explicit[name],
        resolved_by: 'explicit-input',
        confidence: 'high',
      };
    }
    if (maps.exported && Object.hasOwn(maps.exported, name)) {
      return {
        name,
        backend: maps.exported[name],
        resolved_by: 'export-metadata',
        confidence: 'medium',
      };
    }
    const evidence = byEvidence.get(name);
    return evidence === undefined
      ? { name, backend: null, resolved_by: 'unresolved', confidence: 'none' }
      : { name, ...evidence };
  });
  return rows.length === 0 ? { state: 'empty', rows: [] } : { state: 'available', rows };
}

export function buildVersionLagInventory(
  snapshot: ReadonlySnapshot,
): StatefulInventory<VersionLagInventoryRow> {
  const rows: VersionLagInventoryRow[] = [];
  for (const node of controlNodes(snapshot.bundle)) {
    if (node.type === null || node.authoredTypeVersion === null) continue;
    const observed = `${node.type}@${node.authoredTypeVersion}`;
    const knowledge = Object.hasOwn(snapshot.catalogMetadata.versionKnowledge, observed) ? snapshot.catalogMetadata.versionKnowledge[observed] : undefined;
    if (knowledge === undefined) {
      rows.push({
        control: node.name,
        file: node.file,
        observed,
        newest_known: 'unresolved',
      });
      continue;
    }
    rows.push({
      control: node.name,
      file: node.file,
      observed,
      newest_known: `${knowledge.target_type}@${knowledge.target_version}`,
      lower_bound: knowledge.lower_bound,
      evidence: knowledge.evidence,
      observed_at: knowledge.observed_at,
      migration: {
        target_type: knowledge.target_type,
        target_version: knowledge.target_version,
        ...(knowledge.migration_note === undefined
          ? {}
          : { note: knowledge.migration_note }),
      },
    });
  }
  return rows.length === 0 ? { state: 'empty', rows: [] } : { state: 'available', rows };
}

export function buildModernizationInventory(
  snapshot: ReadonlySnapshot,
): StatefulInventory<ModernizationInventoryRow> {
  if (snapshot.catalogMetadata.modernization === undefined) {
    return { state: 'unavailable', note: 'The injected catalog has no modernization map.' };
  }
  const pairs = snapshot.catalogMetadata.modernization;
  const classicTypes = new Set(snapshot.catalogMetadata.classicTypes ?? []);
  const deferred = new Map((snapshot.catalogMetadata.modernizationDeferred ?? [])
    .filter(entry => classicTypes.has(entry.source))
    .map(entry => [entry.source, entry.reason]));
  const rows = new Map<string, ModernizationInventoryRow>();
  const reasons = new Map<string, Map<string, number>>();
  const unknownNote = 'Unknown source properties are not counted here; the gate reports them separately.';
  for (const node of controlNodes(snapshot.bundle)) {
    if (!node.type || node.componentName || node.type === 'CanvasComponent') continue;
    const pair = Object.hasOwn(pairs, node.type) ? pairs[node.type] : undefined;
    if (!pair && !deferred.has(node.type)) continue;
    let row = rows.get(node.type);
    if (!row) {
      row = {
        source_type: node.type, target_type: pair?.target ?? null,
        verified: pair?.verified ?? false, controls: 0, mechanical: 0, needs_review: 0,
        authored: { same: 0, renamed: 0, manual: 0, dropped_cosmetic: 0, dropped_behaviour: 0 },
        review_reasons: [], reference_rewrites: 0, references_unmapped: 0,
        sample_review_controls: [], review_controls_total: 0,
        note: pair ? unknownNote : `Deferred: ${deferred.get(node.type)} No mapping exists; all instances need review. ${unknownNote}`,
      };
      rows.set(node.type, row);
      reasons.set(node.type, new Map());
    }
    row.controls++;
    const { authored, reviewProperties, needsReview } = classifyModernization(node.properties, pair);
    for (const key of Object.keys(authored) as Array<keyof typeof authored>) row.authored[key] += authored[key];
    const counts = reasons.get(node.type)!;
    for (const name of reviewProperties) counts.set(name, (counts.get(name) ?? 0) + 1);
    if (needsReview) {
      row.needs_review++;
      row.review_controls_total++;
      if (row.sample_review_controls.length < 10) row.sample_review_controls.push(node.name);
    } else row.mechanical++;
  }
  const referenceMaps = new Map(Object.entries(pairs).map(([type, pair]) => [
    type, new Map(Object.entries(pair.references).map(([member, target]) => [member.toLowerCase(), target])),
  ]));
  for (const reference of snapshot.controlReferences ?? []) {
    const row = rows.get(reference.sourceType);
    const references = referenceMaps.get(reference.sourceType);
    const member = reference.member.toLowerCase();
    if (!row || !references?.has(member)) continue;
    const target = references.get(member);
    if (target === null || target?.toLowerCase() !== member) {
      row.reference_rewrites++;
      if (target === null) row.references_unmapped++;
    }
  }
  for (const row of rows.values()) {
    row.review_reasons = [...reasons.get(row.source_type)!]
      .sort(([left, leftCount], [right, rightCount]) => rightCount - leftCount || left.localeCompare(right))
      .map(([property, controls]) => ({ property, controls }));
  }
  const ordered = [...rows.values()].sort((left, right) =>
    right.controls - left.controls || left.source_type.localeCompare(right.source_type));
  return ordered.length === 0 ? { state: 'empty', rows: [] } : { state: 'available', rows: ordered };
}

export function buildScreenInventory(
  snapshot: ReadonlySnapshot,
): StatefulInventory<ScreenInventoryRow> {
  const nodes = controlNodes(snapshot.bundle);
  const rows = snapshot.bundle.screens.map((screen): ScreenInventoryRow => {
    const screenNodes = nodes.filter(node => node.screen === screen && node.type !== null);
    const thresholdIssue = snapshot.validation.issues.find(issue =>
      issue.rule === 'perf-control-budget'
      && issue.file === screen.file
      && (issue.control.length === 0
        || screenNodes.some(node => node.name === issue.control)));
    return {
      screen: screen.name,
      file: screen.file,
      controls: screenNodes.length,
      threshold: thresholdIssue?.evidence?.kind === 'threshold'
        ? thresholdIssue.evidence.appliedThreshold
        : null,
      ...(thresholdIssue === undefined ? { note: 'threshold not exercised' } : {}),
    };
  });
  return rows.length === 0 ? { state: 'empty', rows: [] } : { state: 'available', rows };
}

export function buildComponentInventory(
  snapshot: ReadonlySnapshot,
): StatefulInventory<ComponentInventoryRow> {
  const nodes = controlNodes(snapshot.bundle);
  const definitions = new Set(snapshot.bundle.componentDefs);
  const counts = new Map<string, ComponentInventoryRow>();
  for (const node of nodes) {
    if (!definitions.has(node)) continue;
    const current = counts.get(node.name) ?? {
      component: node.name,
      file: node.file,
      definitions: 0,
      instances: 0,
    };
    current.definitions += 1;
    counts.set(node.name, current);
  }
  for (const node of nodes) {
    if (node.componentName === null) continue;
    const current = counts.get(node.componentName) ?? {
      component: node.componentName,
      file: node.file,
      definitions: 0,
      instances: 0,
    };
    current.instances += 1;
    counts.set(node.componentName, current);
  }
  const rows = [...counts.values()].sort((left, right) =>
    left.component.localeCompare(right.component));
  return rows.length === 0 ? { state: 'empty', rows: [] } : { state: 'available', rows };
}
