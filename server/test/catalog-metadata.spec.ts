import { describe, it, expect } from 'vitest';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import { assertValidAugmentationCatalog } from '../src/core/catalog';

describe('injected catalog metadata', () => {
  it('carries catalog identity, version knowledge, and evidence classes', () => {
    expect(typeof ANALYZER_CATALOG_DATA.catalogVersion).toBe('string');
    expect(ANALYZER_CATALOG_DATA.catalogVersion.length).toBeGreaterThan(0);
    expect(Number.isFinite(Date.parse(ANALYZER_CATALOG_DATA.extractedAt))).toBe(true);
    expect(Object.keys(ANALYZER_CATALOG_DATA.versionKnowledge)).toHaveLength(4);
    expect(ANALYZER_CATALOG_DATA.evidenceClasses).toEqual([
      { claim_ref: 'dump_sourced:ComboBoxDataField', evidence_class: 'dump-sourced-lower-bound' },
      { claim_ref: 'dump_sourced:TableDataField', evidence_class: 'dump-sourced-lower-bound' },
    ]);
  });

  it('rejects injected data with a missing extraction timestamp', () => {
    const broken = { ...ANALYZER_CATALOG_DATA, extractedAt: '' };
    expect(() => assertValidAugmentationCatalog(broken)).toThrow(/extractedAt/);
  });

  it('rejects an unparseable extraction timestamp', () => {
    const broken = { ...ANALYZER_CATALOG_DATA, extractedAt: 'not-a-date' };
    expect(() => assertValidAugmentationCatalog(broken)).toThrow(/extractedAt/);
  });
});
