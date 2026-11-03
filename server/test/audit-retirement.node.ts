import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { auditRetirement } from '../../cli/audit-retirement.mjs';
import { parseAugmentations } from '../scripts/lib/augmentation-catalog.mjs';

const old = parseAugmentations(`augmentations:
  Card:
    legacy_variants:
      - Retired
      - Retained
    observed_variants:
      variants:
        - Observed
    additional_input_properties:
      Default: Text
dump_sourced_controls:
  Shape:
    variants: [5Points]
    input_properties:
      Width: Number
      Fill: Color
      AlignInContainer: Enum
`);
const retained = parseAugmentations(`augmentations:
  Card:
    legacy_variants:
      - Retained
`);
const controls = [{ type: 'Shape', variants: ['5Points'] }, { type: 'Card', variants: ['Retired', 'Observed'] }];
const fresh = {
  controls: {
    Shape: { variants: ['5Points'], input_properties: { Width: 'Number' }, variant_input_properties: { '5Points': { Fill: 'Color' } }, parent_context: ['layout'] },
    Card: { variants: ['Retired', 'Observed'], input_properties: {}, variant_input_properties: { Retired: { Default: 'Text' } }, parent_context: [] },
  },
  parentContext: { layout: { AlignInContainer: 'Enum' } },
};

describe('retirement vocabulary audit', () => {
  it('accepts extracted base, variant and declared-parent properties while excluding retained legacy names', () => {
    expect(auditRetirement(old, fresh, retained, controls)).toEqual({
      counts: { dump_controls: 1, variants: 3, properties: 4 }, losses: [],
    });
  });

  it('reports every synthetic variant/property loss instead of stopping at the first', () => {
    const missing = structuredClone(fresh);
    missing.controls.Shape.variants = [];
    missing.controls.Shape.variant_input_properties = {} as typeof missing.controls.Shape.variant_input_properties;
    missing.controls.Shape.parent_context = [];
    expect(auditRetirement(old, missing, retained, controls).losses).toEqual([
      "Shape: retired variant '5Points' is absent from fresh extraction",
      "Shape: retired property 'Fill' is absent from fresh extraction",
      "Shape: retired property 'AlignInContainer' is absent from fresh extraction",
    ]);
  });

  it('fails the actual command for a lost dump variant and succeeds once extraction contains it', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'appforge-retirement-'));
    try {
      writeFileSync(join(tmp, 'old.yml'), 'dump_sourced_controls:\n  Shape:\n    variants: [5Points]\n    input_properties:\n      Width: Number\n');
      writeFileSync(join(tmp, 'retained.yml'), 'dump_sourced_controls:\n');
      writeFileSync(join(tmp, 'control-manifest.yml'), 'controls:\n  - type: Shape\n    variants: [5Points]\n');
      const properties = 'controls:\n  Shape:\n    variants: []\n    input_properties:\n      Width: Number\n';
      writeFileSync(join(tmp, 'control-properties.yml'), properties);
      const args = [resolve(__dirname, '../../cli/audit-retirement.mjs'), join(tmp, 'old.yml'), tmp, '--retained-augmentations', join(tmp, 'retained.yml')];
      const failed = spawnSync(process.execPath, args, { encoding: 'utf8' });
      expect(failed.status).toBe(1);
      expect(failed.stderr).toContain("retired variant '5Points'");
      writeFileSync(join(tmp, 'control-properties.yml'), properties.replace('variants: []', 'variants: [5Points]'));
      expect(execFileSync(process.execPath, args, { encoding: 'utf8' })).toContain('0 losses');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
