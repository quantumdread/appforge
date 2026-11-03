import type { Issue } from '../analyzer.js';

/**
 * Absolute lower bound for one finding in compact AnalysisReportV1 JSON.
 *
 * This is deliberately below the independently pinned 401-byte artificial
 * skeleton: it counts every mandatory key/delimiter while treating dynamic
 * slots as empty even where the schema requires a longer enum or null. It also
 * excludes Markdown, root causes, remediation, array commas, and the JSON-RPC
 * wrapper. Reaching it therefore proves the final response cannot fit; it is
 * not an estimate or truncation quota.
 */
export const MIN_EMITTED_FINDING_BYTES = 393;

export type SurveyOutputBudgetState = {
  stage: 'analyzer' | 'report';
  finding_candidates: number;
  unrecognized_spans?: number;
  lower_bound_bytes: number;
};

export class SurveyOutputBudgetExceeded extends Error {
  constructor(public readonly state: SurveyOutputBudgetState) {
    super('survey output lower bound reached its response budget');
    this.name = 'SurveyOutputBudgetExceeded';
  }
}

function decimalDigits(value: number): number {
  let remaining = Math.trunc(Math.abs(value));
  let digits = 1;
  while (remaining >= 10) {
    remaining = Math.floor(remaining / 10);
    digits++;
  }
  return digits;
}

export class SurveyOutputBudget {
  private findingCandidates = 0;
  private unrecognizedSpans = 0;
  private unrecognizedSpanBytes = 0;

  constructor(
    private readonly maxBytes: number,
    private readonly onSaturated?: (state: SurveyOutputBudgetState) => void,
  ) {}

  observeIssue(issue: Readonly<Issue>): void {
    if (issue.level === 'PASS') return;
    this.assertFindingCount(this.findingCandidates + 1, 'analyzer');
  }

  observeReportInput(findingCandidates: number): void {
    this.assertFindingCount(findingCandidates, 'report');
  }

  observeUnrecognizedSpan(start: number, end: number): void {
    this.unrecognizedSpans++;
    // Guaranteed appearances in both surfaces, ignoring all prefixes and
    // separators: compact report `[start,end]` plus Markdown `start-end`.
    this.unrecognizedSpanBytes += 2 * (decimalDigits(start) + decimalDigits(end)) + 4;
    this.assertWithinBudget('analyzer');
  }

  private assertFindingCount(
    findingCandidates: number,
    stage: SurveyOutputBudgetState['stage'],
  ): void {
    this.findingCandidates = Math.max(this.findingCandidates, findingCandidates);
    this.assertWithinBudget(stage);
  }

  private assertWithinBudget(stage: SurveyOutputBudgetState['stage']): void {
    const exactLowerBound = this.findingCandidates * MIN_EMITTED_FINDING_BYTES
      + this.unrecognizedSpanBytes;
    if (exactLowerBound < this.maxBytes) return;
    const state: SurveyOutputBudgetState = {
      stage,
      finding_candidates: this.findingCandidates,
      ...(this.unrecognizedSpans === 0
        ? {}
        : { unrecognized_spans: this.unrecognizedSpans }),
      lower_bound_bytes: Math.min(exactLowerBound, this.maxBytes),
    };
    this.onSaturated?.(state);
    throw new SurveyOutputBudgetExceeded(state);
  }
}
