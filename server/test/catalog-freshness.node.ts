import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogFreshness } from '../../cli/catalog-freshness.mjs';

describe('catalog freshness advisory', () => {
  it('warns only after the exact 90-day boundary', () => {
    const extracted = '2026-05-10T16:49:19.734Z';
    expect(catalogFreshness(extracted, new Date('2026-08-08T16:49:19.734Z'))).toBeNull();
    expect(catalogFreshness(extracted, new Date('2026-08-08T16:49:19.735Z')))
      .toBe('WARN catalog-freshness: artifact catalog extracted 2026-05-10T16:49:19.734Z is older than 90 days; see docs/TENANT-SESSION-WORKLIST.md#1-catalog-re-extraction-route-a.');
  });

  it.each([undefined, null, '', 'yesterday', '2026-02-30', '2026-05-10T99:00:00.000Z', '2026-09-09T00:00:00.000Z', 0])
    ('reports uncertain metadata for missing, invalid or future extraction date %j', extracted => {
      expect(catalogFreshness(extracted, new Date('2026-09-08T00:00:00.000Z')))
        .toBe('WARN catalog-freshness: artifact extraction date or current clock is missing, invalid or in the future; catalog age is unknown; see docs/TENANT-SESSION-WORKLIST.md#1-catalog-re-extraction-route-a.');
    });

  it('uses the consumed artifact metadata and emits stderr without changing passing corpus JSON', () => {
    const installation = mkdtempSync(join(tmpdir(), 'appforge-catalog-freshness-'));
    const temp = join(installation, 'cli');
    try {
      mkdirSync(temp);
      const originalTools = resolve(__dirname, '../../cli');
      mkdirSync(join(temp, 'dist'));
      cpSync(join(originalTools, 'lib'), join(temp, 'lib'), { recursive: true });
      for (const name of ['diff-oracle.mjs', 'catalog-freshness.mjs', 'validate.mjs']) {
        copyFileSync(join(originalTools, name), join(temp, name));
      }
      copyFileSync(join(originalTools, 'dist/analyzer-core.mjs'), join(temp, 'dist/real-core.mjs'));
      const setArtifactDate = (date: string) => writeFileSync(join(temp, 'dist/analyzer-core.mjs'),
        `export * from './real-core.mjs';\nimport { loadCatalog as original } from './real-core.mjs';\nexport function loadCatalog() { return { ...original(), extractedAt: ${JSON.stringify(date)} }; }\n`);
      // A nearby source catalog must not substitute for the artifact actually consumed.
      mkdirSync(join(installation, 'knowledge/catalogs'), { recursive: true });
      writeFileSync(join(installation, 'knowledge/catalogs/control-manifest.yml'), `extracted_at: ${new Date().toISOString()}\n`);
      writeFileSync(join(temp, 'app.pa.yaml'), 'App:\n  Properties:\n    StartScreen: =Sample\nScreens:\n  Sample:\n    Children:\n      - Example:\n          Control: Label\n          Properties:\n            Text: ="Example"\n');
      writeFileSync(join(temp, 'manifest.json'), JSON.stringify({
        schema_version: 1, expected_rules: ['app-onerror-missing'],
        roots: [{ id: 'sample', scope: 'internal', path: 'app.pa.yaml', include: ['**/*.pa.yaml'] }],
      }));
      writeFileSync(join(temp, 'adjudications.json'), JSON.stringify({ schema_version: 1, adjudications: {} }));
      const run = (writeGolden = false) => spawnSync(process.execPath, [
        join(temp, 'diff-oracle.mjs'), '--manifest', join(temp, 'manifest.json'),
        '--golden-internal', join(temp, 'golden.json'), '--adjudications', join(temp, 'adjudications.json'),
        '--internal-only', '--json', ...(writeGolden ? ['--write-golden'] : []),
      ], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
      setArtifactDate(new Date().toISOString());
      const setup = run(true);
      expect(setup.status, setup.stderr).toBe(0);
      const fresh = run();
      expect(fresh.status, fresh.stderr).toBe(0);
      expect(fresh.stderr).toBe('');
      setArtifactDate('2000-01-01T00:00:00.000Z');
      const stale = run();
      expect(stale.status, stale.stderr).toBe(0);
      expect(stale.stderr.trim().split(/\r?\n/u)).toEqual([
        'WARN catalog-freshness: artifact catalog extracted 2000-01-01T00:00:00.000Z is older than 90 days; see docs/TENANT-SESSION-WORKLIST.md#1-catalog-re-extraction-route-a.',
      ]);
      const freshReport = JSON.parse(fresh.stdout);
      const staleReport = JSON.parse(stale.stdout);
      expect(staleReport).toMatchObject({ schema_version: 4, gate_passed: true });
      expect({ ...staleReport, generated_at: null }).toEqual({ ...freshReport, generated_at: null });
    } finally {
      rmSync(installation, { recursive: true, force: true });
    }
  });
});
