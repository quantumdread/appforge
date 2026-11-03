import { describe, expect, it } from 'vitest';
import { validateFiles } from '../src/core/analyzer';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const variants = [
  'BrowseLayout_Vertical_TwoTextOneImageVariant_ver4.0',
  'BrowseLayout_Vertical_TwoTextVariant_ver4.0',
];
const gallery = (variant: string, property: string) => validateFiles([{
  name: 'gallery.pa.yaml',
  content: `- galProbe:
    Control: Gallery
    Variant: ${variant}
    Properties:
      ${property}
`,
}], ANALYZER_CATALOG_DATA, { lintRules: [] });

describe('Studio legacy browse galleries', () => {
  it.each(variants)('accepts %s with common Items', variant => {
    const result = gallery(variant, 'Items: =[]');
    expect(result.summary.refuse).toBe(0);
    expect(result.summary.warn).toBe(0);
    expect(result.summary.pass).toBe(1);
  });
  it.each(variants)('warns on variant-specific WrapCount for %s', variant => {
    const result = gallery(variant, 'WrapCount: =1');
    expect(result.summary.refuse).toBe(0);
    expect(result.issues).toContainEqual(expect.objectContaining({
      rule: 'variant-unspecified-property', level: 'WARN', property: 'WrapCount',
    }));
  });
  it('refuses a made-up browse layout', () => {
    expect(gallery('BrowseLayout_X_ver9.9', 'Items: =[]').issues)
      .toContainEqual(expect.objectContaining({ rule: 'unknown-variant', level: 'REFUSE' }));
  });
});
