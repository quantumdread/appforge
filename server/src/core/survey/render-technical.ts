import type {
  AnalysisReportV1,
  BackendRiskInventoryRow,
  ComponentInventoryRow,
  ConnectionInventoryRow,
  DatasourceInventoryRow,
  RemediationPlanEntry,
  ReportFinding,
  ScreenInventoryRow,
  StatefulInventory,
  VersionLagInventoryRow,
  ModernizationInventoryRow,
} from './report-types.js';
import { countUtf8StringBytes } from './utf8-size.js';

class MarkdownLimitExceeded extends Error {}

class MarkdownWriter {
  private readonly chunks: string[] = [];
  private bytes = 0;
  private lines = 0;

  constructor(private readonly maxBytes: number) {}

  private append(value: string): void {
    const remaining = this.maxBytes - this.bytes;
    const valueBytes = countUtf8StringBytes(value, remaining + 1);
    if (valueBytes > remaining) {
      throw new MarkdownLimitExceeded();
    }
    this.chunks.push(value);
    this.bytes += valueBytes;
  }

  line(value: string): void {
    if (this.lines > 0) this.append('\n');
    this.append(value);
    this.lines++;
  }

  lineParts(values: Iterable<string>): void {
    if (this.lines > 0) this.append('\n');
    for (const value of values) this.append(value);
    this.lines++;
  }

  write(values: readonly string[]): void {
    for (const value of values) this.line(value);
  }

  finish(): string {
    return this.chunks.join('');
  }
}

const display = (value: string | number | boolean): string => String(value);

function mixedCounts(
  entry: Readonly<RemediationPlanEntry>,
  report: Readonly<AnalysisReportV1>,
): string {
  if (entry.action_state !== 'mixed') return '';
  const rootCause = report.root_causes.find(root => root.group_id === entry.group_id);
  return rootCause?.action_state === 'mixed'
    ? `; accepted_count: ${rootCause.accepted_count}; suppressed_count: ${rootCause.suppressed_count}`
    // Structural invariant: remediation_plan is a 1:1 map over root_causes, so a mixed entry always finds its mixed root cause; this fallback is defensive.
    : '';
}

function renderPlanEntry(
  entry: Readonly<RemediationPlanEntry>,
  report: Readonly<AnalysisReportV1>,
): string[] {
  const lines = [
    `- **${entry.band} · ${entry.score}** — ${entry.what} (action_state: ${entry.action_state}${mixedCounts(entry, report)})`,
    `  - Group: ${entry.group_id}`,
    `  - Why: ${entry.why}`,
    `  - How: ${entry.how}`,
    `  - Effort: ${entry.effort_class}; descriptor coverage: ${entry.descriptor_coverage}`,
  ];
  for (const note of entry.dependency_notes) lines.push(`  - Dependency: ${note}`);
  return lines;
}

function renderVerificationEntry(
  entry: Readonly<RemediationPlanEntry>,
  report: Readonly<AnalysisReportV1>,
): string[] {
  return [
    `- **${entry.band} · ${entry.score}** — Verification required for group ${entry.group_id} before any remediation.${mixedCounts(entry, report)}`,
    '  - Verify the underlying evidence and classify the result before taking action.',
    `  - Effort: ${entry.effort_class}; descriptor coverage: ${entry.descriptor_coverage}`,
  ];
}

function writeStream(
  writer: MarkdownWriter,
  heading: string,
  entries: readonly Readonly<RemediationPlanEntry>[],
  report: Readonly<AnalysisReportV1>,
  renderEntry: (
    entry: Readonly<RemediationPlanEntry>,
    report: Readonly<AnalysisReportV1>,
  ) => string[] = renderPlanEntry,
): void {
  writer.write([`## ${heading}`, '']);
  if (entries.length === 0) {
    writer.line('None.');
    return;
  }
  for (const [index, entry] of entries.entries()) {
    if (index > 0) writer.line('');
    writer.write(renderEntry(entry, report));
  }
}

function renderFinding(
  finding: Readonly<ReportFinding>,
  report: Readonly<AnalysisReportV1>,
): string[] {
  const lines = [
    `### ${finding.rule} — ${finding.file}:${finding.line}`,
    '',
    `- Severity: ${finding.severity}; analyzer level: ${finding.level}; confidence: ${finding.confidence} (${finding.confidence_basis})`,
    `- Control: ${finding.control} (${finding.type}${finding.variant === null ? '' : `, variant ${finding.variant}`})`,
    `- Property: ${finding.property ?? 'not applicable'}`,
    `- Fingerprint: ${finding.fingerprint}; group: ${finding.group_id}`,
    `- Status: baseline ${finding.baseline_status}${finding.suppressed_by === undefined ? '' : `; suppressed by ${finding.suppressed_by}`}`,
    `- Detail: ${finding.detail}`,
    finding.severity === 'UNCERTAINTY'
      ? `- Verification guidance: ${finding.fix ?? 'not provided by the rule'}`
      : `- Fix: ${finding.fix ?? 'not provided by the rule'}`,
  ];
  if (finding.did_you_mean !== null) lines.push(`- Did you mean: ${finding.did_you_mean}`);
  if (finding.controls.length > 0) lines.push(`- Aggregate controls: ${finding.controls.join(', ')}`);
  if (finding.severity === 'BLOCK') {
    lines.push(
      `- Catalog caveat: BLOCK is against catalog ${report.identity.catalog.version}, extracted ${report.identity.catalog.extracted_at} (${report.coverage.catalog_staleness.days} days stale).`,
    );
  }
  if (finding.near_miss) lines.push('- Near miss: yes (`near_miss: true`)');
  return lines;
}

function writeInventory<TRow>(
  writer: MarkdownWriter,
  label: string,
  inventory: Readonly<StatefulInventory<TRow>>,
  renderRow: (row: Readonly<TRow>) => string[],
): void {
  writer.write([`### ${label}`, '']);
  if (inventory.state === 'unavailable') {
    writer.line(`- ${label}: not available from this intake`);
    if (inventory.note !== undefined) writer.line(`- Note: ${inventory.note}`);
    return;
  }
  if (inventory.state === 'empty') {
    writer.line(`- ${label}: no entries reported by this intake`);
    return;
  }
  if (inventory.rows.length === 0) {
    writer.line(`- ${label}: available, but no rows were supplied`);
    return;
  }
  for (const [index, row] of inventory.rows.entries()) {
    if (index > 0) writer.line('');
    writer.write(renderRow(row));
  }
}

function renderDatasource(row: Readonly<DatasourceInventoryRow>): string[] {
  return [
    `- ${row.name} — backend: ${row.backend ?? 'unresolved'}; resolved_by: ${row.resolved_by}; confidence: ${row.confidence}`,
  ];
}

function renderBackendRisk(row: Readonly<BackendRiskInventoryRow>): string[] {
  const count = row.count === null ? 'not available from this intake' : display(row.count);
  const premium = row.premium === null ? 'unresolved' : row.premium ? 'yes' : 'no';
  const lines = [
    `- ${row.connector_type} — connection count: ${count}; premium: ${premium}; confidence: ${row.confidence}`,
  ];
  for (const fact of row.documented_limits) {
    lines.push(`  - Documented limit: ${fact.limit} (source: ${fact.source_url})`);
  }
  for (const unknown of row.unknowns) lines.push(`  - Unknown: ${unknown}`);
  return lines;
}

function renderVersionLag(row: Readonly<VersionLagInventoryRow>): string[] {
  if (!('evidence' in row)) {
    return [
      `- ${row.control} (${row.file}) — observed ${row.observed}; newest known: unresolved. Catalog knowledge does not cover the type.`,
    ];
  }
  const lines = [
    `- ${row.control} (${row.file}) — observed ${row.observed}; newest known (lower bound; ${row.evidence}): ${row.newest_known}.`,
  ];
  if (row.migration !== undefined) {
    lines.push(
      `  - Studio migration: update control versions to ${row.migration.target_type}@${row.migration.target_version}${row.migration.note === undefined ? '' : ` — ${row.migration.note}`}.`,
    );
  }
  return lines;
}

function renderScreen(row: Readonly<ScreenInventoryRow>): string[] {
  const note = row.note === undefined || row.note === 'threshold not exercised'
    ? ''
    : `; ${row.note}`;
  return [
    `- ${row.screen} (${row.file}) — controls: ${row.controls}; threshold: ${row.threshold === null ? 'not exercised' : row.threshold}${note}`,
  ];
}

function renderModernization(row: Readonly<ModernizationInventoryRow>): string[] {
  const authored = row.authored;
  return [
    `- ${row.source_type} → ${row.target_type ?? 'deferred (no mapping)'}; verified: ${row.verified}; controls: ${row.controls}; mechanical: ${row.mechanical}; needs review: ${row.needs_review}`,
    `  - Authored properties: same ${authored.same}; renamed ${authored.renamed}; manual ${authored.manual}; dropped cosmetic ${authored.dropped_cosmetic}; dropped behaviour ${authored.dropped_behaviour}`,
    `  - Review reasons: ${row.review_reasons.map(reason => `${reason.property}: ${reason.controls}`).join(', ') || 'none'}`,
    `  - Reference rewrites: ${row.reference_rewrites}; unmapped: ${row.references_unmapped}`,
    `  - Review controls (up to 10): ${row.sample_review_controls.join(', ') || 'none'} (${row.review_controls_total} total)`,
    `  - Note: ${row.note}`,
  ];
}

function renderComponent(row: Readonly<ComponentInventoryRow>): string[] {
  return [
    `- ${row.component} (${row.file}) — definitions: ${row.definitions}; instances: ${row.instances}`,
  ];
}

function renderConnection(row: Readonly<ConnectionInventoryRow>): string[] {
  return [`- ${row.connector_type} — connections: ${row.count}`];
}

function writeInventories(writer: MarkdownWriter, report: Readonly<AnalysisReportV1>): void {
  writer.write(['## Inventories', '']);
  writeInventory(writer, 'Datasources', report.inventories.datasources, renderDatasource);
  writer.line('');
  writeInventory(writer, 'Backend risks', report.inventories.backend_risks, renderBackendRisk);
  writer.line('');
  writeInventory(writer, 'Version lag', report.inventories.version_lag, renderVersionLag);
  writer.line('');
  writeInventory(writer, 'Modernization', report.inventories.modernization, renderModernization);
  writer.line('');
  writeInventory(writer, 'Screens', report.inventories.screens, renderScreen);
  writer.line('');
  writeInventory(writer, 'Components', report.inventories.components, renderComponent);
  writer.line('');
  writeInventory(writer, 'Connections', report.inventories.connections, renderConnection);
}

function writeCoverage(writer: MarkdownWriter, report: Readonly<AnalysisReportV1>): void {
  const coverage = report.coverage;
  writer.write([
    '## Coverage',
    '',
    `- Unit: ${coverage.unit}`,
    `- Tiers: extractor_verified ${coverage.tiers.extractor_verified}; augmentation_verified ${coverage.tiers.augmentation_verified}; dump_sourced_lower_bound ${coverage.tiers.dump_sourced_lower_bound}; component_defined ${coverage.tiers.component_defined}; unknown ${coverage.tiers.unknown}`,
    `- Exclusions: ${coverage.exclusions}`,
    `- Catalog staleness: ${coverage.catalog_staleness.days} days; ${coverage.catalog_staleness.stale ? 'STALE' : 'current for the configured threshold'}`,
    '',
    '### Limitations',
    '',
  ]);
  if (coverage.limitations.length === 0) {
    writer.line('- None reported.');
  } else {
    for (const limitation of coverage.limitations) {
      if (limitation.kind === 'unrecognized-content') {
        writer.lineParts((function* () {
          yield `- Unrecognized content in ${limitation.file}: lines `;
          for (const [index, [start, end]] of limitation.lines.entries()) {
            if (index > 0) yield ', ';
            yield String(start);
            yield '-';
            yield String(end);
          }
          yield '.';
        })());
      } else if (limitation.kind === 'unrecognized-file') {
        writer.line(`- Unrecognized file: ${limitation.file}.`);
      } else {
        writer.line(`- ${limitation.kind} at ${limitation.source}: ${limitation.detail}`);
      }
    }
  }
  writer.write(['', '### Unverified catalog claims', '']);
  if (coverage.unverified_claims.length === 0) {
    writer.line('- None reported.');
  } else {
    for (const claim of coverage.unverified_claims) {
      writer.line(
        `- ${claim.claim_ref} — evidence class: ${claim.evidence_class}${claim.falsifier === undefined ? '' : `; falsifier: ${claim.falsifier}`}`,
      );
    }
  }
}

function renderBaselineAndSuppressions(report: Readonly<AnalysisReportV1>): string[] {
  return [
    '## Baseline & suppressions',
    '',
    `- Baseline formula: ${report.baseline.formula}`,
    `- Baseline applied from: ${report.baseline.applied_from ?? 'not applied'}`,
    `- Baseline basis matches: ${report.baseline.basis_matches ? 'yes' : 'no'}`,
    `- Accepted findings: ${report.baseline.accepted_total}`,
    `- Stale baseline entries: ${report.baseline.stale_entries.length}`,
    `- Baseline migration required: ${report.baseline.migration_required ? 'yes' : 'no'}`,
    `- Applied suppressions: ${report.suppressions.applied_count}`,
    `- Expired suppressions: ${report.suppressions.expired.length}`,
    `- Invalid suppressions: ${report.suppressions.invalid.length}`,
  ];
}

function renderDelta(report: Readonly<AnalysisReportV1>): string[] {
  if (report.delta === undefined) return [];
  const line = (label: string, fingerprints: readonly string[]) =>
    `- ${label} (${fingerprints.length}): ${fingerprints.length === 0 ? 'none' : fingerprints.join(', ')}`;
  return [
    '',
    '## Delta',
    '',
    line('Resolved', report.delta.resolved),
    line('Persisted', report.delta.persisted),
    line('New', report.delta.new),
  ];
}

function writeTechnical(report: AnalysisReportV1, writer: MarkdownWriter): void {
  const debt = report.remediation_plan.filter(entry =>
    entry.action_state === 'accepted' || entry.action_state === 'suppressed');
  const verifyFirst = report.remediation_plan.filter(entry =>
    entry.band === 'verify-first'
    && entry.action_state !== 'accepted'
    && entry.action_state !== 'suppressed');
  const active = report.remediation_plan.filter(entry =>
    (entry.action_state === 'active' || entry.action_state === 'mixed')
    && entry.band !== 'verify-first');
  const appName = report.identity.app_name.value ?? 'Unnamed app';
  const staleFlag = report.coverage.catalog_staleness.stale ? '; STALE' : '';

  writer.write([
    `# Technical analysis report — ${appName}`,
    '',
    `- Report ID: ${report.report_id}`,
    `- App ID: ${report.identity.app_id}`,
    `- App name resolution: ${report.identity.app_name.resolved_by}`,
    `- Source: ${report.identity.source_kind}; completeness: ${report.identity.completeness}`,
    `- Fingerprint basis: ${report.identity.fingerprint_basis}`,
    `- Surveyed at: ${report.identity.surveyed_at}`,
    `- Analyzer version: ${report.identity.analyzer_version}`,
    `- Catalog: ${report.identity.catalog.version}; extracted ${report.identity.catalog.extracted_at}; ${report.coverage.catalog_staleness.days} days old${staleFlag}`,
    `- Files: ${report.identity.files.map(file => `${file.id} (${file.sha256})`).join(', ') || 'none'}`,
    '',
    '## Gate',
    '',
    `- Decision: **${report.gate.gate_decision}**`,
    `- Summary: PASS ${report.gate.summary.pass}; WARN ${report.gate.summary.warn}; REFUSE ${report.gate.summary.refuse}; controls ${report.gate.summary.controls_seen}; files ${report.gate.summary.files}`,
    '',
    '### Per file',
    '',
    ...(report.gate.per_file.length === 0
      ? ['- None.']
      : report.gate.per_file.map(file =>
          `- ${file.file} — PASS ${file.pass}; WARN ${file.warn}; REFUSE ${file.refuse}; controls ${file.controls_seen}`)),
    '',
  ]);
  writeStream(writer, 'Active remediation', active, report);
  writer.line('');
  writeStream(writer, 'Verify first', verifyFirst, report, renderVerificationEntry);
  writer.line('');
  writeStream(writer, 'Accepted & suppressed debt', debt, report);
  writer.write(['', '## Findings', '']);
  if (report.findings.length === 0) {
    writer.line('None.');
  } else {
    for (const [index, finding] of report.findings.entries()) {
      if (index > 0) writer.line('');
      writer.write(renderFinding(finding, report));
    }
  }
  writer.line('');
  writeInventories(writer, report);
  writer.line('');
  writeCoverage(writer, report);
  writer.write([
    '',
    ...renderBaselineAndSuppressions(report),
    ...renderDelta(report),
    '',
  ]);
}

/** Render exactly or return null before materializing bytes beyond maxBytes. */
export function renderTechnicalWithinBytes(
  report: AnalysisReportV1,
  maxBytes: number,
): string | null {
  const writer = new MarkdownWriter(maxBytes);
  try {
    writeTechnical(report, writer);
    return writer.finish();
  } catch (caught) {
    if (caught instanceof MarkdownLimitExceeded) return null;
    throw caught;
  }
}

export function renderTechnical(report: AnalysisReportV1): string {
  return renderTechnicalWithinBytes(report, Number.POSITIVE_INFINITY)!;
}
