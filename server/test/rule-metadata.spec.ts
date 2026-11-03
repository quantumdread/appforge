import { describe, it, expect } from 'vitest';
import { CORE_LINT_RULE_IDS } from '../src/lib/lint';
import { ALL_RULE_IDS, ANALYZER_RULE_IDS, RULE_METADATA, ruleMetadata } from '../src/core/rule-metadata';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import type { AnalyzerCatalogData } from '../src/core/catalog';

const SEVERITIES = ['BLOCK', 'CORRECTNESS_RISK', 'PERFORMANCE_RISK', 'MAINTAINABILITY', 'UNCERTAINTY'];
const REMEDY_KINDS = ['deterministic', 'human-value', 'prose', 'none'];

describe('rule metadata registry', () => {
  it('covers every lint rule and every analyzer-emitted rule exactly once', () => {
    const expected = [...CORE_LINT_RULE_IDS, ...ANALYZER_RULE_IDS].sort();
    expect([...ALL_RULE_IDS].sort()).toEqual(expected);
    expect(new Set(ALL_RULE_IDS).size).toBe(ALL_RULE_IDS.length);
    for (const id of ALL_RULE_IDS) expect(RULE_METADATA[id], `missing metadata for ${id}`).toBeTruthy();
  });

  it('declares a valid severity and downgrade flag for every rule', () => {
    for (const [id, meta] of Object.entries(RULE_METADATA)) {
      expect(SEVERITIES, `${id} severity`).toContain(meta.baseSeverity);
      expect(typeof meta.uncertaintyDowngrade, `${id} downgrade`).toBe('boolean');
      expect(meta.groupingKey, `${id} grouping`).toBeTruthy();
      expect(REMEDY_KINDS, `${id} remedy kind`).toContain(meta.remedyKind);
      expect(meta.clientCopyKey, `${id} copy key`).toBe(id);
    }
  });

  it('classifies the delegation family as downgradeable correctness risk', () => {
    const meta = ruleMetadata('delegation-sharepoint-search');
    expect(meta?.baseSeverity).toBe('CORRECTNESS_RISK');
    expect(meta?.uncertaintyDowngrade).toBe(true);
    expect(meta?.groupingKey).toBe('bound-source');
  });

  it('classifies unverified-augmentation as UNCERTAINTY', () => {
    expect(ruleMetadata('unverified-augmentation')?.baseSeverity).toBe('UNCERTAINTY');
  });

  it('returns null for an unknown id rather than guessing', () => {
    expect(ruleMetadata('no-such-rule')).toBeNull();
  });
});

describe('unverified-augmentation emission (analyzer core)', () => {
  // Injected fixture rather than a real control-augmentations.yml verified:false
  // entry: every real entry is a promotion candidate, so pinning this test to
  // one would let it silently stop covering the WARN branch the day someone
  // promotes that entry to verified:true. Only the one property below is
  // fabricated; the rest of the catalog is the real, generated data.
  const fixtureCatalog: AnalyzerCatalogData = {
    ...ANALYZER_CATALOG_DATA,
    augmentations: {
      ...ANALYZER_CATALOG_DATA.augmentations,
      Label: {
        ...ANALYZER_CATALOG_DATA.augmentations.Label,
        additional_input_properties: {
          ...ANALYZER_CATALOG_DATA.augmentations.Label?.additional_input_properties,
          __FixtureUnverifiedProp: { type: 'Text', verified: false },
        },
      },
    },
  };

  it('emits a WARN carrying rule: unverified-augmentation for a verified:false augmentation', () => {
    const yaml = 'Screens:\n  S:\n    Children:\n      - lbl1:\n          Control: Label\n          Properties:\n            __FixtureUnverifiedProp: ="x"\n';
    const result = validateFiles([{ name: 'a.pa.yaml', content: yaml }], fixtureCatalog);

    const issue = result.issues.find(i => i.property === '__FixtureUnverifiedProp');
    expect(issue).toMatchObject({ level: 'WARN', rule: 'unverified-augmentation' });
  });
});
