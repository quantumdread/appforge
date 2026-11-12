/**
 * validate_yaml — Phase 2 tool.
 *
 * Three-state validator over one or more PA-YAML files. Includes cross-file
 * control-name collision detection (the gap that let the holiday/approvals
 * build leak 8 collisions past the local validator).
 */
import { controlNamesOf, validateFiles, type IssueLevel } from '../lib/validator.js';
import {
  DATASOURCE_TYPES,
  type DatasourceMap,
  type DatasourceType,
} from '../lib/lint.js';
import { recordValidationTelemetry } from '../lib/telemetry.js';
import { MAX_HOSTED_CONTROLS, countControlDeclarations } from '../lib/hosted-limits.js';

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
type ValidateYamlInput = {
  files: Array<{ name: string; content: string }>;
  datasources?: DatasourceMap;
  before_files?: Array<{ name: string; content: string }>;
};

const json = (obj: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
});

const error = (msg: string): ToolResult => ({
  content: [{ type: 'text', text: msg }],
  isError: true,
});

const allowedDatasourceTypes = new Set<DatasourceType>(DATASOURCE_TYPES);
const allowedDatasourceTypesText = DATASOURCE_TYPES.join(', ');

function datasourceMapError(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return `datasources must be an object mapping source names to one of: ${allowedDatasourceTypesText}.`;
  }
  for (const [name, type] of Object.entries(value)) {
    if (!allowedDatasourceTypes.has(type as DatasourceType)) {
      const rendered = typeof type === 'string' ? `'${type}'` : JSON.stringify(type);
      return `Invalid datasources value for '${name}': ${rendered}. Allowed values: ${allowedDatasourceTypesText}.`;
    }
  }
  return null;
}

export const validateYaml = {
  name: 'validate_yaml',
  description:
    "Validate one or more Power Apps PA-YAML files against the merged catalog (auto-extracted + hand-curated augmentations) and return a three-state classification per property:\n\n  PASS   — property is in the auto catalog OR in augmentations with verified:true\n  WARN   — property is in augmentations with verified:false (generation allowed; usage drives the verification queue)\n  REFUSE — property is in neither catalog source (or the control type/variant is unknown)\n\nAlso detects cross-file control-name collisions (PA-YAML requires globally unique control names across all screens). REFUSEs the duplicates rather than waiting for compile_canvas to surface them.\n\nWithout an authored Variant, or with an accepted variant that has no platform property bundle, base properties and properties common to all variant bundles PASS; a property declared by only some bundles WARNs as variant-unspecified-property and names the accepting variants. Declare Variant to resolve that uncertainty. Authored variants with bundles retain their existing property and augmentation checks; unknown variant names retain their existing refusals.\n\nControls recovered from a Studio export (studio-dump source) have only a lower-bound property list, so an unknown property or variant on one of them WARNs with rule 'partial-catalog-data' instead of REFUSEing — the usage feeds the verification queue rather than blocking generation. The same lower-bound doctrine applies at variant granularity: runtime-observed variant vocabulary (accepted by Studio but no longer emitted, recorded as observed_variants with runtime_observation evidence) WARNs under the same rule while the control's properties are still validated normally.\n\nA centralization WARN family flags refactoring opportunities across the batch: duplicate-formula / duplicate-formula-in-gallery (repeated non-trivial formulas — centralize as named formulas/UDFs; the gallery variant is the only-mechanism-there case), repeated-color-literal (theme-token candidates), heavy-onstart (migrate to App.Formulas). Advisory only — never REFUSEs.\n\nAn accessibility WARN family flags positive tab order, unreachable classic click targets, unlabeled icon buttons, and unlabeled inputs; every a11y-* rule is advisory and never REFUSEs.\n\nA delegation WARN family flags query patterns that silently return incomplete data past the row limit: delegation-firstn-on-source, delegation-forall-writes and delegation-search-caveat always fire; SharePoint/SQL/Excel-specific rules fire only when a datasources map is supplied. A performance family flags per-row gallery queries (perf-lookup-in-gallery-template), serial OnStart loads (perf-onstart-no-concurrent, merged into heavy-onstart when both match), cross-screen control references, and per-screen control budgets. Every delegation-* and perf-* rule is advisory — none REFUSE.\n\nOptionally pass a datasources map to identify each bound source as dataverse, sharepoint, sql, excel, collection, or other. The map unlocks the source-specific delegation rules above; omit it and only the source-agnostic core fires. An explicit datasources mapping overrides the col/var/gbl/loc naming convention for that name. A name mapped as collection is excluded from delegation rules entirely. Note: a partial map silences the source-agnostic search caveat for the sources it does list, so map every bound source you know.\n\nWhen editing an existing app, pass before_files (the untouched sync from before the change): a control added by this change with a superseded type then WARNs as new-control-superseded-type. Controls elsewhere in the app are not a template for new ones.\n\nDesigned to be the pre-compile_canvas gate: if validate_yaml returns refuse>0, do not call compile_canvas — fix the issues and retry. If only warn>0, generation is acceptable but warnings should be surfaced. Aggregate per-file findings include a complete machine-readable controls array.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      files: {
        type: 'array',
        description: "Array of files to validate. For single-file validation, pass an array of one entry. For multi-screen apps, pass all the .pa.yaml files together so the cross-file collision check can fire.",
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "File name or path (used in issue.file for human-readable output)." },
            content: { type: 'string', description: "The raw PA-YAML content as a string." },
          },
          required: ['name', 'content'],
        },
        minItems: 1,
      },
      before_files: {
        type: 'array',
        description: "Optional: the same app's files as synced before this change, untouched. Controls whose names are not in them count as new (or renamed), and a new control with a superseded type WARNs as new-control-superseded-type, one finding per control. Pass them whenever you edit an existing app.",
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, content: { type: 'string' } },
          required: ['name', 'content'],
        },
      },
      datasources: {
        type: 'object',
        description: 'Optional map from Power Apps datasource name to backend type. Enables source-specific delegation lint; omit for source-agnostic behavior.',
        additionalProperties: {
          type: 'string',
          enum: [...DATASOURCE_TYPES],
        },
      },
    },
    required: ['files'],
  },
  handler: ({ files, datasources, before_files }: ValidateYamlInput, extra?: { env: Env; ctx: ExecutionContext }): ToolResult => {
    if (!Array.isArray(files) || files.length === 0) {
      return error("files parameter is required and must be a non-empty array of {name, content} entries.");
    }
    for (const f of files) {
      if (!f || typeof f.name !== 'string' || typeof f.content !== 'string') {
        return error("Each file entry must be { name: string, content: string }.");
      }
    }

    if (before_files !== undefined && (!Array.isArray(before_files)
      || before_files.some(f => !f || typeof f.name !== 'string' || typeof f.content !== 'string'))) {
      return error("before_files must be an array of { name: string, content: string } entries.");
    }

    let normalizedDatasources: DatasourceMap | undefined;
    if (datasources !== undefined) {
      const mapError = datasourceMapError(datasources);
      if (mapError) return error(mapError);
      normalizedDatasources = Object.assign(Object.create(null) as DatasourceMap, datasources);
    }

    const MAX_TOTAL_BYTES = 1_500_000;
    const total = [...files, ...(before_files ?? [])].reduce((n, f) => n + f.content.length, 0);
    if (total > MAX_TOTAL_BYTES) {
      return error(`Input too large: ${(total / 1_000_000).toFixed(1)} MB exceeds the 1.5 MB cap. Split the validation into batches of screens.`);
    }
    const controls = countControlDeclarations(files);
    if (controls > MAX_HOSTED_CONTROLS) {
      return error(`Input too large for one request: ${controls} controls exceeds the ${MAX_HOSTED_CONTROLS}-control cap per request. Split the validation into batches of screens, or run the local CLI (node cli/validate.mjs <dir>), which has no such cap.`);
    }

    const result = validateFiles(files, {
      datasources: normalizedDatasources,
      ...(before_files ? { existingControls: controlNamesOf(before_files) } : {}),
    });

    if (extra?.env && extra?.ctx) {
      recordValidationTelemetry(extra.env, extra.ctx, {
        files: result.summary.files,
        issues: result.issues,
        opportunities: result.opportunities,
      });
    }

    // nearMiss is a telemetry-only copy of did_you_mean state; evidence is
    // survey-input metadata for the renovation survey (spec 2026-08-28-v25 §2).
    // Keep both out of the public tool response while telemetry retains the
    // original issues.
    const publicIssues = result.issues.map(({
      nearMiss: _nearMiss,
      nearMissTelemetry: _nearMissTelemetry,
      evidence: _evidence,
      ...issue
    }) => issue);

    // Group issues by level so the response is scannable.
    const byLevel: Record<IssueLevel, typeof publicIssues> = {
      REFUSE: publicIssues.filter(i => i.level === 'REFUSE'),
      WARN: publicIssues.filter(i => i.level === 'WARN'),
      PASS: [],
    };

    return json({
      gate_decision: result.gateDecision,
      summary: result.summary,
      per_file: result.per_file,
      issues: {
        refuse: byLevel.REFUSE,
        warn: byLevel.WARN,
      },
    });
  },
};

export const VALIDATOR_TOOLS = [validateYaml];
