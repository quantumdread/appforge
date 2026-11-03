import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertEmittableBaseline,
  parseAnalysisBaseline,
} from '../src/core/survey/baseline-input';
import { BaselineInputError, evaluateBaseline } from '../src/core/survey/baseline';

const schema = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../src/core/survey/analysis-baseline.schema.json',
  import.meta.url,
)), 'utf8'));
const ajvValidate = new Ajv({ allErrors: true, strict: false }).compile(schema);

const ENTRY = {
  fingerprint: '0123456789abcdef',
  rule: 'a11y-tabindex-positive',
  accepted_at: '2026-08-30T08:00:00.000Z',
};

function baseline(fingerprintBasis: string = 'directory/src-stripped/v1') {
  return {
    baseline_schema: 'analysis-baseline/1' as const,
    formula: 'finding-fingerprint/2' as const,
    fingerprint_basis: fingerprintBasis,
    entries: [ENTRY],
  };
}

describe('analysis-baseline/1 standalone input gate', () => {
  it('accepts canonical emitted data through schema, parser, and emitted gate', () => {
    const value = baseline();
    const parsed = parseAnalysisBaseline(value);

    expect(ajvValidate(value)).toBe(true);
    expect(parsed.fingerprint_basis).toBe('directory/src-stripped/v1');
    expect(parsed.compatibility_class).toBe('src-stripped/v1');
    expect(() => assertEmittableBaseline(value)).not.toThrow();
  });

  it('reads legacy same-schema omission but matches nothing and cannot emit it', () => {
    const legacy = baseline() as Partial<ReturnType<typeof baseline>>;
    delete legacy.fingerprint_basis;
    const parsed = parseAnalysisBaseline(legacy);
    const evaluated = evaluateBaseline(legacy as never, [{
      fingerprint: ENTRY.fingerprint,
      rule: ENTRY.rule,
      severity: 'MAINTAINABILITY',
    }], 'directory/src-stripped/v1');

    expect(ajvValidate(legacy)).toBe(false);
    expect(parsed.fingerprint_basis).toBeNull();
    expect(parsed.compatibility_class).toBeNull();
    expect(evaluated.section.basis_matches).toBe(false);
    expect(evaluated.accepted_fingerprints.size).toBe(0);
    expect(() => assertEmittableBaseline(legacy)).toThrow(BaselineInputError);
  });

  it('normalizes only the exact three src-stripped intake forms', () => {
    const compatible = [
      'directory/src-stripped/v1',
      'msapp/src-stripped/v1',
      'solution/Technician Portal/src-stripped/v1',
    ];
    expect(compatible.map(value => parseAnalysisBaseline(baseline(value)).compatibility_class))
      .toEqual(['src-stripped/v1', 'src-stripped/v1', 'src-stripped/v1']);
    expect(parseAnalysisBaseline(baseline('caller-supplied')).compatibility_class).toBeNull();
    expect(parseAnalysisBaseline(baseline('directory/other-v1')).compatibility_class).toBeNull();
    for (const value of compatible) {
      expect(() => assertEmittableBaseline(baseline(value))).not.toThrow();
    }
    expect(() => assertEmittableBaseline(baseline('caller-supplied')))
      .toThrow(BaselineInputError);
    expect(() => assertEmittableBaseline(baseline('directory/other-v1')))
      .toThrow(BaselineInputError);

    const crossIntake = evaluateBaseline(baseline('msapp/src-stripped/v1'), [{
      fingerprint: ENTRY.fingerprint,
      rule: ENTRY.rule,
      severity: 'MAINTAINABILITY',
    }], 'solution/Technician Portal/src-stripped/v1');
    expect(crossIntake.section.basis_matches).toBe(true);
    expect(crossIntake.accepted_fingerprints).toEqual(new Set([ENTRY.fingerprint]));
  });

  it('requires direct and wrapper bases to agree without letting a wrapper fill legacy omission', () => {
    expect(parseAnalysisBaseline(baseline(), {
      wrapperBasis: 'directory/src-stripped/v1',
    }).compatibility_class).toBe('src-stripped/v1');
    expect(() => parseAnalysisBaseline(baseline(), {
      wrapperBasis: 'msapp/src-stripped/v1',
    })).toThrowError(expect.objectContaining({ code: 'invalid-baseline' }));

    const legacy = baseline() as Partial<ReturnType<typeof baseline>>;
    delete legacy.fingerprint_basis;
    expect(() => parseAnalysisBaseline(legacy, {
      wrapperBasis: 'directory/src-stripped/v1',
    })).toThrowError(expect.objectContaining({ code: 'invalid-baseline' }));
  });

  it('rejects unknown keys, unsorted entries, and duplicate tuple keys', () => {
    const extra = { ...baseline(), customer: 'forbidden' };
    const unsorted = {
      ...baseline(),
      entries: [
        { ...ENTRY, fingerprint: 'ffffffffffffffff' },
        { ...ENTRY, fingerprint: '0000000000000000' },
      ],
    };
    const duplicate = { ...baseline(), entries: [ENTRY, { ...ENTRY, note: 'conflict' }] };

    for (const value of [extra, unsorted, duplicate]) {
      expect(() => parseAnalysisBaseline(value)).toThrow(BaselineInputError);
    }
    expect(ajvValidate(extra)).toBe(false);
    expect(ajvValidate(unsorted)).toBe(true);
    expect(ajvValidate(duplicate)).toBe(true);
  });

  it('never lets a malformed v1 document shadow itself as a legacy CLI baseline', () => {
    const shadowed = {
      ...baseline(),
      findings: [],
    };

    expect(() => evaluateBaseline(
      shadowed as never,
      [],
      'directory/src-stripped/v1',
    )).toThrow(BaselineInputError);
  });

  it('is independent of current issue order and refuses incompatible current bases', () => {
    const candidates = [
      {
        fingerprint: ENTRY.fingerprint,
        rule: ENTRY.rule,
        severity: 'MAINTAINABILITY' as const,
      },
      {
        fingerprint: 'fedcba9876543210',
        rule: 'unknown-control',
        severity: 'BLOCK' as const,
      },
    ];
    const forward = evaluateBaseline(baseline(), candidates, 'directory/src-stripped/v1');
    const reversed = evaluateBaseline(baseline(), [...candidates].reverse(), 'directory/src-stripped/v1');
    const mismatch = evaluateBaseline(baseline(), candidates, 'directory/not-src-stripped/v1');

    expect(forward.section).toEqual(reversed.section);
    expect(forward.accepted_fingerprints).toEqual(reversed.accepted_fingerprints);
    expect(mismatch.section.basis_matches).toBe(false);
    expect(mismatch.accepted_fingerprints.size).toBe(0);
  });
});
