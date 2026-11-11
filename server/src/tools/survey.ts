import { sha256 } from '../core/sha256.js';
import { buildEnvelope } from '../core/survey/envelope.js';
import type { SurveyEnvelopeV1 } from '../core/survey/envelope-types.js';
import { assertEmittableReport } from '../core/survey/emittable-report.js';
import { buildReport } from '../core/survey/build-report.js';
import type { AnalysisReportV1 } from '../core/survey/report-types.js';
import { renderTechnicalWithinBytes } from '../core/survey/render-technical.js';
import { assertValidEnvelope, serializeEnvelope } from '../core/survey/validate-envelope.js';
import { assertValidReport } from '../core/survey/validate-report.js';
import {
  SurveyOutputBudget,
  SurveyOutputBudgetExceeded,
  type SurveyOutputBudgetState,
} from '../core/survey/output-budget.js';
import {
  countJsonUtf8Bytes,
  countUtf8StringBytes,
} from '../core/survey/utf8-size.js';
export { countJsonUtf8Bytes, countUtf8StringBytes } from '../core/survey/utf8-size.js';
import { WORKER_VERSION } from '../lib/release.js';
import { MAX_HOSTED_CONTROLS, countControlDeclarations } from '../lib/hosted-limits.js';
import {
  ANALYZER_CATALOG_ALLOWLIST,
  analyzeSurveyFiles,
  normalizeSurveyDatasourceMap,
  SurveyDatasourceMapError,
} from '../lib/survey.js';
import {
  scheduleSurveyTelemetry,
  type SurveyTelemetryEnv,
} from '../lib/survey-telemetry.js';

export const MAX_SURVEY_FILES = 512;
export const MAX_SURVEY_YAML_CODE_UNITS = 1_500_000;
export const MAX_SURVEY_FILE_NAME_BYTES = 1_024;
export const MAX_SURVEY_FILE_NAMES_BYTES = 64 * 1_024;
export const MAX_SURVEY_DATASOURCES = 512;
export const MAX_SURVEY_DATASOURCE_KEY_BYTES = 1_024;
export const MAX_SURVEY_DATASOURCE_KEYS_BYTES = 64 * 1_024;
export const MAX_SURVEY_REQUEST_ID_BYTES = 1_024;
export const MAX_SURVEY_RESPONSE_BYTES = 8 * 1_024 * 1_024;

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

export type SurveyToolResult = {
  report: AnalysisReportV1;
  technical_markdown: string;
  envelope: SurveyEnvelopeV1;
};

type SurveyToolExtra = {
  env: Env;
  ctx: ExecutionContext;
};

export type SurveyToolDependencies = {
  now?: () => Date;
  randomUuid?: () => string;
  beforeGates?: (report: AnalysisReportV1, envelope: SurveyEnvelopeV1) => void;
  componentPreflightBytes?: number;
  render?: (report: AnalysisReportV1, maxBytes: number) => string | null;
  onOutputBudgetSaturated?: (state: SurveyOutputBudgetState) => void;
};

class SurveyToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SurveyToolInputError';
  }
}

const encoder = new TextEncoder();

const byteLength = (value: string): number => countUtf8StringBytes(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const json = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

const error = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(value).some(key => !allowedSet.has(key))) {
    throw new SurveyToolInputError(`${label} contains an unsupported field`);
  }
}

// Canonicalize the portable-fixable spellings the zip and CLI intakes already
// normalize (`canonicalZipPath`): separator folding and inert `.`/empty
// segments. Anything that changes which file is named — traversal, absolute,
// drive-letter or UNC roots — is still refused. The returned canonical id is
// what flows into hashing, collision detection, and the emitted report.
function canonicalizeFileId(name: string): string {
  if (name.length === 0) {
    throw new SurveyToolInputError('file names must be non-empty relative ids');
  }
  if (byteLength(name) > MAX_SURVEY_FILE_NAME_BYTES) {
    throw new SurveyToolInputError(
      `a file name exceeds ${MAX_SURVEY_FILE_NAME_BYTES} UTF-8 bytes`,
    );
  }
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(name)) {
    throw new SurveyToolInputError('file names must not contain control characters');
  }
  const folded = name.replaceAll('\\', '/');
  if (folded.startsWith('/') || /^[A-Za-z]:/u.test(folded)) {
    throw new SurveyToolInputError('file names must be portable relative ids');
  }
  const segments: string[] = [];
  for (const segment of folded.split('/')) {
    if (segment === '..') {
      throw new SurveyToolInputError('file names must not contain empty or traversal segments');
    }
    if (segment === '' || segment === '.') continue;
    segments.push(segment);
  }
  if (segments.length === 0) {
    throw new SurveyToolInputError('file names must be non-empty relative ids');
  }
  return segments.join('/');
}

function normalizeInput(value: unknown): {
  files: Array<{ name: string; content: string }>;
  datasources: ReturnType<typeof normalizeSurveyDatasourceMap> | undefined;
  profile: 'shared' | 'existing-export';
  submitEnvelope: boolean;
} {
  if (!isRecord(value)) {
    throw new SurveyToolInputError('arguments must be an object');
  }
  assertExactKeys(value, ['files', 'datasources', 'profile', 'submit_envelope'], 'arguments');
  const profile = value.profile === undefined ? 'shared' : value.profile;
  if (profile !== 'shared' && profile !== 'existing-export') {
    throw new SurveyToolInputError('profile must be shared or existing-export');
  }
  if (!Array.isArray(value.files)
    || value.files.length < 1
    || value.files.length > MAX_SURVEY_FILES) {
    throw new SurveyToolInputError(
      `files must contain between 1 and ${MAX_SURVEY_FILES} entries`,
    );
  }

  let yamlCodeUnits = 0;
  let aggregateNameBytes = 0;
  const collisionKeys = new Set<string>();
  const files = value.files.map((candidate, index) => {
    if (!isRecord(candidate)) {
      throw new SurveyToolInputError(`files[${index}] must be an object`);
    }
    assertExactKeys(candidate, ['name', 'content'], `files[${index}]`);
    if (typeof candidate.name !== 'string' || typeof candidate.content !== 'string') {
      throw new SurveyToolInputError(`files[${index}] must contain string name and content fields`);
    }
    const canonicalName = canonicalizeFileId(candidate.name);
    aggregateNameBytes += byteLength(candidate.name);
    if (aggregateNameBytes > MAX_SURVEY_FILE_NAMES_BYTES) {
      throw new SurveyToolInputError(
        `file names exceed ${MAX_SURVEY_FILE_NAMES_BYTES} aggregate UTF-8 bytes`,
      );
    }
    const collisionKey = canonicalName.toLowerCase();
    if (collisionKeys.has(collisionKey)) {
      throw new SurveyToolInputError('file names must be unique without case collisions');
    }
    collisionKeys.add(collisionKey);

    yamlCodeUnits += candidate.content.length;
    if (yamlCodeUnits > MAX_SURVEY_YAML_CODE_UNITS) {
      throw new SurveyToolInputError(
        `YAML exceeds ${MAX_SURVEY_YAML_CODE_UNITS} JavaScript code units`,
      );
    }
    return { name: canonicalName, content: candidate.content };
  });
  const controls = countControlDeclarations(files);
  if (controls > MAX_HOSTED_CONTROLS) {
    throw new SurveyToolInputError(
      `${controls} controls exceeds the per-request ${MAX_HOSTED_CONTROLS}-control cap; `
      + 'run the local CLI (node cli/validate.mjs survey <dir>), which has no such cap',
    );
  }

  let datasources: ReturnType<typeof normalizeSurveyDatasourceMap> | undefined;
  if (value.datasources !== undefined) {
    if (!isRecord(value.datasources)) {
      throw new SurveyToolInputError('datasources must be an object');
    }
    const keys = Object.keys(value.datasources);
    if (keys.length > MAX_SURVEY_DATASOURCES) {
      throw new SurveyToolInputError(
        `datasources exceeds ${MAX_SURVEY_DATASOURCES} entries`,
      );
    }
    let aggregateKeyBytes = 0;
    for (const key of keys) {
      const keyBytes = byteLength(key);
      if (keyBytes > MAX_SURVEY_DATASOURCE_KEY_BYTES) {
        throw new SurveyToolInputError(
          `a datasource key exceeds ${MAX_SURVEY_DATASOURCE_KEY_BYTES} UTF-8 bytes`,
        );
      }
      aggregateKeyBytes += keyBytes;
      if (aggregateKeyBytes > MAX_SURVEY_DATASOURCE_KEYS_BYTES) {
        throw new SurveyToolInputError(
          `datasource keys exceed ${MAX_SURVEY_DATASOURCE_KEYS_BYTES} aggregate UTF-8 bytes`,
        );
      }
    }
    try {
      datasources = normalizeSurveyDatasourceMap(value.datasources, 'datasources');
    } catch (caught) {
      if (caught instanceof SurveyDatasourceMapError) {
        throw new SurveyToolInputError(caught.message);
      }
      throw caught;
    }
  }

  if (value.submit_envelope !== undefined && typeof value.submit_envelope !== 'boolean') {
    throw new SurveyToolInputError('submit_envelope must be a boolean');
  }
  return {
    files,
    datasources,
    profile,
    submitEnvelope: value.submit_envelope ?? false,
  };
}

function failedSubmission(attemptedAt: string, errorCode: string): AnalysisReportV1['envelope']['submission'] {
  return {
    state: 'failed',
    attempted_at: attemptedAt,
    error_code: errorCode,
  };
}

export function createDistinctSurveyIds(
  randomUuid: () => string = () => crypto.randomUUID(),
): { reportId: string; envelopeId: string } {
  const reportId = randomUuid();
  let envelopeId = randomUuid();
  while (envelopeId === reportId) envelopeId = randomUuid();
  return { reportId, envelopeId };
}

async function runSurvey(
  value: unknown,
  extra: SurveyToolExtra | undefined,
  dependencies: SurveyToolDependencies,
): Promise<ToolResult> {
  let input: ReturnType<typeof normalizeInput>;
  try {
    input = normalizeInput(value);
  } catch (caught) {
    if (caught instanceof SurveyToolInputError) {
      return error(`survey input error: ${caught.message}`);
    }
    // An unexpected throw during normalization is still a bounded tool result:
    // letting it escape would surface as a JSON-RPC -32000 transport error.
    return error('survey infrastructure error: survey could not be completed');
  }

  const componentLimit = dependencies.componentPreflightBytes
    ?? MAX_SURVEY_RESPONSE_BYTES;
  const sizeError = () => error(
    `survey infrastructure error: response exceeds ${componentLimit} bytes`,
  );
  const outputBudget = new SurveyOutputBudget(
    componentLimit,
    dependencies.onOutputBudgetSaturated,
  );

  try {
    const surveyedAt = (dependencies.now?.() ?? new Date()).toISOString();
    const { reportId, envelopeId } = createDistinctSurveyIds(dependencies.randomUuid);
    const snapshot = analyzeSurveyFiles(input.files, {
      ...(input.datasources === undefined ? {} : { datasources: input.datasources }),
      now: () => Date.parse(surveyedAt),
      outputBudget,
    });
    const report = buildReport(snapshot, {
      app_name: { value: null, resolved_by: 'unresolved' },
      source_kind: 'inline',
      fingerprint_basis: 'caller-supplied',
      files: input.files.map(file => ({ id: file.name, sha256: sha256(file.content) })),
      limitations: [
        {
          kind: 'metadata-absent',
          source: 'datasources',
          detail: 'Inline MCP intake carries no datasource export metadata',
        },
        {
          kind: 'metadata-absent',
          source: 'connections',
          detail: 'Inline MCP intake carries no connection export metadata',
        },
      ],
      connections: { state: 'unavailable', rows: [] },
      ...(input.datasources === undefined ? {} : { explicit_datasources: input.datasources }),
    }, {
      now: surveyedAt,
      report_id: reportId,
      analyzer_version: WORKER_VERSION,
      policy: { profile_id: input.profile },
    }, outputBudget);
    report.envelope = {
      id: envelopeId,
      path: null,
      submission: { state: input.submitEnvelope ? 'pending' : 'not_requested' },
    };
    const envelope = buildEnvelope(snapshot, report, {
      id: envelopeId,
      catalog_allowlist: ANALYZER_CATALOG_ALLOWLIST,
    });
    dependencies.beforeGates?.(report, envelope);
    assertValidEnvelope(envelope, ANALYZER_CATALOG_ALLOWLIST);
    const canonicalEnvelope = encoder.encode(
      serializeEnvelope(envelope, ANALYZER_CATALOG_ALLOWLIST),
    );
    assertValidReport(report);
    assertEmittableReport(report, { surface: 'mcp', envelope });

    const reportBytes = countJsonUtf8Bytes(report, componentLimit);
    if (reportBytes >= componentLimit) return sizeError();
    const markdownBudget = componentLimit - reportBytes;
    const technicalMarkdown = dependencies.render === undefined
      ? renderTechnicalWithinBytes(report, markdownBudget)
      : dependencies.render(report, markdownBudget);
    if (technicalMarkdown === null) return sizeError();
    if (countUtf8StringBytes(technicalMarkdown, markdownBudget) >= markdownBudget) {
      return sizeError();
    }

    if (input.submitEnvelope) {
      const attemptedAt = (dependencies.now?.() ?? new Date()).toISOString();
      try {
        // Checked BEFORE dispatch: once scheduleSurveyTelemetry has fired the
        // request, reporting `failed` would contradict a submission that is
        // actually in flight.
        if (!extra?.ctx) throw new Error('execution context unavailable');
        const scheduled = scheduleSurveyTelemetry(
          (extra?.env ?? {}) as SurveyTelemetryEnv,
          canonicalEnvelope,
        );
        if (scheduled === null) {
          report.envelope.submission = failedSubmission(
            attemptedAt,
            'telemetry-not-configured',
          );
        } else {
          const observed = scheduled.promise.then(
            () => undefined,
            () => undefined,
          );
          extra.ctx.waitUntil(observed);
        }
      } catch {
        report.envelope.submission = failedSubmission(
          attemptedAt,
          'telemetry-scheduling-failed',
        );
      }
      assertValidReport(report);
      assertEmittableReport(report, { surface: 'mcp', envelope });
    }

    const payload: SurveyToolResult = {
      report,
      technical_markdown: technicalMarkdown,
      envelope,
    };
    return json(payload);
  } catch (caught) {
    if (caught instanceof SurveyOutputBudgetExceeded) return sizeError();
    return error('survey infrastructure error: survey could not be completed');
  }
}

export function createSurveyApp(dependencies: SurveyToolDependencies = {}) {
  return {
    name: 'survey_app',
    description:
      'Analyze a complete inline Power Apps PA-YAML file set and return an AnalysisReportV1, technical Markdown, and a minimized survey envelope. The envelope is returned for inspection and is submitted only when submit_envelope is explicitly true.',
    inputSchema: {
      type: 'object' as const,
      additionalProperties: false,
      properties: {
        files: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_SURVEY_FILES,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: {
                type: 'string',
                minLength: 1,
                description: `Portable relative file id, at most ${MAX_SURVEY_FILE_NAME_BYTES} UTF-8 bytes.`,
              },
              content: { type: 'string', description: 'Raw PA-YAML content.' },
            },
            required: ['name', 'content'],
          },
        },
        datasources: {
          type: 'object',
          maxProperties: MAX_SURVEY_DATASOURCES,
          description: 'Optional datasource-name to backend-type map.',
          additionalProperties: {
            type: 'string',
            enum: ['dataverse', 'sharepoint', 'sql', 'excel', 'collection', 'other'],
          },
        },
        profile: {
          type: 'string',
          enum: ['shared', 'existing-export'],
          default: 'shared',
          description: 'Explicit survey profile. Existing-export treats eligible inline formatting hazards as advice; it does not establish compilation or roundtrip safety.',
        },
        submit_envelope: {
          type: 'boolean',
          default: false,
          description: 'Explicitly schedule the returned minimized envelope for submission.',
        },
      },
      required: ['files'],
    },
    handler: (value: unknown, extra?: SurveyToolExtra) =>
      runSurvey(value, extra, dependencies),
  };
}

export const surveyApp = createSurveyApp();

export const SURVEY_TOOLS = [surveyApp];

/** Shared hosted file intake: exact survey shape, canonical IDs and limits. */
export function normalizeSurveyFiles(files: unknown): Array<{ name: string; content: string }> {
  return normalizeInput({ files }).files;
}
