import { afterAll } from 'vitest';
import { buildSync } from 'esbuild';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseManifest, parseProperties } from '../../scripts/lib/catalog-source.mjs';
import { parseAugmentations, validateAugmentationStructure } from '../../scripts/lib/augmentation-catalog.mjs';

/** Isolated installation: real current scripts/core, deliberately synthetic catalog.
 * Retired evidence paths must remain testable without borrowing live catalog state.
 */
export function verificationFixture() {
  const installation = mkdtempSync(join(tmpdir(), 'appforge-verification-install-'));
  const mcp = resolve(__dirname, '../..');
  const rules = join(installation, 'knowledge');
  cpSync(resolve(mcp, '../knowledge'), rules, { recursive: true });
  cpSync(join(mcp, 'scripts'), join(installation, 'server/scripts'), { recursive: true });
  symlinkSync(join(mcp, 'node_modules'), join(installation, 'server/node_modules'), 'junction');
  cpSync(resolve(__dirname, '../fixtures/verification/catalogs'), join(rules, 'catalogs'), { recursive: true });
  const manifest = parseManifest(readFileSync(join(rules, 'catalogs/control-manifest.yml'), 'utf8'));
  const properties = parseProperties(readFileSync(join(rules, 'catalogs/control-properties.yml'), 'utf8'));
  const { catalog: overlay } = validateAugmentationStructure(
    parseAugmentations(readFileSync(join(rules, 'catalogs/control-augmentations.yml'), 'utf8')),
    { manifestControls: manifest.controls },
  );
  const catalog = {
    augmentationSchemaVersion: 7, catalogVersion: manifest.extractedAt, extractedAt: manifest.extractedAt,
    versionKnowledge: overlay.versionKnowledge, evidenceClasses: [], controls: manifest.controls,
    controlProperties: properties.controls, augmentations: overlay.controls,
    dumpSourcedControls: overlay.dumpSourced, syntheticControls: overlay.synthetic,
    dumpSourced: Object.keys(overlay.dumpSourced), parentContextProperties: properties.parentContext,
    enums: properties.enums,
  };
  for (const [type, entry] of Object.entries(overlay.dumpSourced) as [string, any][]) {
    catalog.controls.push({ type, variants: entry.variants, source: 'studio-dump' });
    catalog.controlProperties[type] = { input_properties: entry.input_properties };
  }
  for (const [type, entry] of Object.entries(overlay.synthetic) as [string, any][]) {
    catalog.controls.push({ type, variants: [], source: 'synthetic' });
    catalog.controlProperties[type] = { input_properties: entry.input_properties };
  }
  const artifact = join(installation, 'cli/dist/analyzer-core.mjs');
  mkdirSync(join(installation, 'cli/dist'), { recursive: true });
  buildSync({
    stdin: { resolveDir: mcp, sourcefile: 'verification-fixture.ts', contents: `
      import { validateFiles, walkPaYaml, controlNodes } from './src/core/analyzer.ts';
      import { toLegacyCliReports } from './src/core/compatibility.ts';
      const catalog = ${JSON.stringify(catalog)};
      export { walkPaYaml, controlNodes };
      export const loadCatalog = () => catalog;
      export function validateYaml(text, data = catalog, lintContext = {}) {
        const [report] = toLegacyCliReports(validateFiles([{name:'(input)',content:text}], data,
          {lintContext, lintProfile:'cli', detectDuplicateControlNames:false}));
        return {issues:report.issues, summary:report.summary};
      }
    ` },
    bundle: true, platform: 'node', format: 'esm', outfile: artifact,
  });
  afterAll(() => {
    if (!installation.startsWith(join(tmpdir(), 'appforge-verification-install-'))) throw new Error('Unexpected fixture root');
    rmSync(installation, { recursive: true, force: true });
  });
  return { rules, artifact, script: (name: string) => join(installation, 'server/scripts', name) };
}
