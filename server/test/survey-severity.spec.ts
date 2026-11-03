import { describe, expect, it } from 'vitest';
import type { Issue } from '../src/core/analyzer';
import type { DatasourceConfidence, DatasourceResolution } from '../src/core/datasource';
import { RULE_METADATA } from '../src/core/rule-metadata';
import { confidenceOf, severityOf } from '../src/core/survey/severity';

const warning: Issue = {
  level: 'WARN',
  rule: 'a11y-tabindex-positive',
  file: 'Screens/Main.pa.yaml',
  line: 12,
  control: 'btnSave',
  type: 'Button',
  property: 'TabIndex',
  detail: 'positive tab index',
};

describe('survey severity', () => {
  it('applies an exact-id severity override while preserving it for policy recording', () => {
    const policy = {
      severity_overrides: [{
        rule: 'a11y-tabindex-positive',
        severity: 'CORRECTNESS_RISK' as const,
      }],
    };

    expect({
      severity: severityOf(warning, RULE_METADATA['a11y-tabindex-positive'], policy),
      policy,
    }).toEqual({
      severity: 'CORRECTNESS_RISK',
      policy: {
        severity_overrides: [{
          rule: 'a11y-tabindex-positive',
          severity: 'CORRECTNESS_RISK',
        }],
      },
    });
  });

  it('keeps a REFUSE finding BLOCK under a softening override', () => {
    const refusal: Issue = {
      ...warning,
      level: 'REFUSE',
      rule: 'formula-missing-equals',
    };

    expect(severityOf(refusal, RULE_METADATA['formula-missing-equals'], {
      severity_overrides: [{
        rule: 'formula-missing-equals',
        severity: 'MAINTAINABILITY',
      }],
    })).toBe('BLOCK');
  });

  it.each([
    ['naming-convention', 'low', 'UNCERTAINTY'],
    ['unresolved', 'none', 'UNCERTAINTY'],
    ['explicit-input', 'high', 'CORRECTNESS_RISK'],
    ['export-metadata', 'medium', 'CORRECTNESS_RISK'],
  ] as const)(
    'derives downgrade behavior from %s provenance',
    (resolvedBy, confidence, expected) => {
      const issue: Issue = {
        ...warning,
        rule: 'delegation-firstn-on-source',
        evidence: {
          kind: 'bound-source',
          authoredName: 'Orders',
          backend: undefined,
          resolvedBy: resolvedBy satisfies DatasourceResolution,
          confidence: confidence satisfies DatasourceConfidence,
        },
      };

      expect(severityOf(issue, RULE_METADATA['delegation-firstn-on-source'], {
        severity_overrides: [],
      })).toBe(expected);
    },
  );

  it('a downgrade-eligible rule with NO evidence keeps its base severity (absent evidence asserts no provenance)', () => {
    const issue: Issue = {
      ...warning,
      rule: 'delegation-firstn-on-source',
      evidence: undefined,
    };

    expect(severityOf(issue, RULE_METADATA['delegation-firstn-on-source'], {
      severity_overrides: [],
    })).toBe('CORRECTNESS_RISK');
  });

  it('preserves the policy object through the REFUSE short-circuit too', () => {
    const refusal: Issue = { ...warning, level: 'REFUSE', rule: 'formula-missing-equals' };
    const policy = {
      severity_overrides: [{ rule: 'formula-missing-equals', severity: 'MAINTAINABILITY' as const }],
    };

    severityOf(refusal, RULE_METADATA['formula-missing-equals'], policy);

    expect(policy).toEqual({
      severity_overrides: [{ rule: 'formula-missing-equals', severity: 'MAINTAINABILITY' }],
    });
  });

  it('does not downgrade a rule whose registry row disables uncertainty downgrade', () => {
    const issue: Issue = {
      ...warning,
      evidence: {
        kind: 'bound-source',
        authoredName: 'colButtons',
        backend: 'collection',
        resolvedBy: 'naming-convention',
        confidence: 'low',
      },
    };

    expect(severityOf(issue, RULE_METADATA['a11y-tabindex-positive'], {
      severity_overrides: [],
    })).toBe('MAINTAINABILITY');
  });
});

describe('survey confidence', () => {
  describe.each([
    'delegation-search-caveat',
    'delegation-sharepoint-search',
    'delegation-sharepoint-isblank',
    'delegation-sql-isblank',
  ])('%s heuristic ceiling', rule => {
    it.each([
      ['explicit-input', 'high', 'medium', 'rule-family-default'],
      ['export-metadata', 'medium', 'medium', 'provenance'],
      ['naming-convention', 'low', 'low', 'provenance'],
      ['unresolved', 'none', 'low', 'provenance'],
    ] as const)('caps %s only when it would yield high', (resolvedBy, sourceConfidence, confidence, confidence_basis) => {
      const issue: Issue = {
        ...warning,
        rule,
        evidence: {
          kind: 'bound-source', authoredName: 'Orders', backend: undefined,
          resolvedBy, confidence: sourceConfidence,
        },
      };
      expect(confidenceOf(issue)).toEqual({ confidence, confidence_basis });
      expect(issue.evidence).toMatchObject({ resolvedBy, confidence: sourceConfidence });
    });

    it('retains medium with the default basis when source evidence is absent', () => {
      expect(confidenceOf({ ...warning, rule })).toEqual({
        confidence: 'medium', confidence_basis: 'rule-family-default',
      });
    });
  });

  it('preserves high provenance confidence for an unrelated bound-source rule', () => {
    expect(confidenceOf({
      ...warning,
      rule: 'delegation-sharepoint-in',
      evidence: {
        kind: 'bound-source', authoredName: 'Orders', backend: 'sharepoint',
        resolvedBy: 'explicit-input', confidence: 'high',
      },
    })).toEqual({ confidence: 'high', confidence_basis: 'provenance' });
  });

  it.each([
    ['explicit-input', 'high', 'provenance'],
    ['export-metadata', 'medium', 'provenance'],
    ['naming-convention', 'low', 'provenance'],
    ['unresolved', 'low', 'provenance'],
    ['no datasource dimension', 'medium', 'rule-family-default'],
  ] as const)('pins the declared %s row', (row, confidence, confidence_basis) => {
    const evidence = row === 'no datasource dimension'
      ? undefined
      : {
          kind: 'bound-source' as const,
          authoredName: 'Orders',
          backend: undefined,
          resolvedBy: row,
          confidence: row === 'explicit-input'
            ? 'high' as const
            : row === 'export-metadata'
              ? 'medium' as const
              : row === 'naming-convention'
                ? 'low' as const
                : 'none' as const,
        };
    const issue: Issue = {
      ...warning,
      rule: 'delegation-firstn-on-source',
      evidence,
    };

    expect(confidenceOf(issue)).toEqual({ confidence, confidence_basis });
  });

  it.each([
    'partial-catalog-data',
    'unverified-augmentation',
  ])('forces %s to low even with explicit-input provenance', rule => {
    const issue: Issue = {
      ...warning,
      rule,
      evidence: {
        kind: 'bound-source',
        authoredName: 'Orders',
        backend: 'sharepoint',
        resolvedBy: 'explicit-input',
        confidence: 'high',
      },
    };

    expect(confidenceOf(issue)).toEqual({
      confidence: 'low',
      confidence_basis: 'rule-family-default',
    });
  });
});
