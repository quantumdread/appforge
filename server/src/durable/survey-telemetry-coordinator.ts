import { DurableObject } from 'cloudflare:workers';
import { sha256 } from '../core/sha256.js';
import type { SurveyEnvelopeV1 } from '../core/survey/envelope-types.js';
import { decodeCanonicalEnvelope } from '../core/survey/validate-envelope.js';
import { ANALYZER_CATALOG_ALLOWLIST } from '../lib/survey.js';
import {
  MAX_SURVEY_ENVELOPE_BYTES,
  metricsForSurveyEnvelope,
  type SurveyTelemetrySubmitResult,
} from '../lib/survey-telemetry.js';

const SHA256 = /^[0-9a-f]{64}$/u;

export function initializeSurveyTelemetryStorage(storage: DurableObjectStorage): void {
  storage.transactionSync(() => {
    const schemaVersion = storage.kv.get<number>('survey:schema-version');
    if (schemaVersion !== undefined && schemaVersion !== 1) {
      throw new Error('Unsupported survey telemetry schema version');
    }
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS survey_runs (
        id TEXT PRIMARY KEY,
        digest TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS survey_aggregates (
        metric_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL CHECK (
          typeof(count) = 'integer'
          AND count >= 0
          AND count <= 9223372036854775807
        )
      )
    `);
    if (schemaVersion === undefined) {
      storage.kv.put('survey:schema-version', 1);
    }
  });
}

export class SurveyTelemetryCoordinator extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    initializeSurveyTelemetryStorage(this.ctx.storage);
  }

  async submit(
    canonicalEnvelopeBytes: Uint8Array,
    digest: string,
  ): Promise<SurveyTelemetrySubmitResult> {
    if (!(canonicalEnvelopeBytes instanceof Uint8Array)
      || canonicalEnvelopeBytes.byteLength > MAX_SURVEY_ENVELOPE_BYTES
      || !SHA256.test(digest)
      || sha256(canonicalEnvelopeBytes) !== digest) {
      throw new TypeError('Invalid survey telemetry RPC input');
    }
    const envelope = decodeCanonicalEnvelope(
      canonicalEnvelopeBytes,
      ANALYZER_CATALOG_ALLOWLIST,
    ) as SurveyEnvelopeV1;
    const metrics = metricsForSurveyEnvelope(envelope);

    return this.ctx.storage.transactionSync(() => {
      const existing = this.ctx.storage.sql.exec<{ digest: string }>(
        'SELECT digest FROM survey_runs WHERE id = ?',
        envelope.id,
      ).toArray()[0];
      if (existing) {
        return existing.digest === digest
          ? { acknowledged: true, duplicate: true }
          : { acknowledged: false, conflict: true };
      }

      this.ctx.storage.sql.exec(
        'INSERT INTO survey_runs(id, digest, created_at) VALUES (?, ?, ?)',
        envelope.id,
        digest,
        Date.now(),
      );
      for (const [metricKey, count] of metrics) {
        this.ctx.storage.sql.exec(`
          INSERT INTO survey_aggregates(metric_key, count) VALUES (?, ?)
          ON CONFLICT(metric_key) DO UPDATE
          SET count = survey_aggregates.count + excluded.count
        `, metricKey, count);
      }
      return { acknowledged: true, duplicate: false };
    });
  }
}
