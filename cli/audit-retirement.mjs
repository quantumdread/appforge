#!/usr/bin/env node
/** Verify extracted coverage before retiring evidence from the hand-edited overlay. */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAugmentations } from '../server/scripts/lib/augmentation-catalog.mjs';
import { parseManifest, parseProperties } from '../server/scripts/lib/catalog-source.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function auditRetirement(old, fresh, retained, manifestControls) {
  const losses = [];
  const counts = { dump_controls: 0, variants: 0, properties: 0 };
  const controls = new Map(manifestControls.map(control => [control.type, control]));
  const variant = (type, name) => {
    counts.variants++;
    if (!controls.get(type)?.variants.includes(name)
      || !fresh.controls[type]?.variants.includes(name)) {
      losses.push(`${type}: retired variant '${name}' is absent from fresh extraction`);
    }
  };
  const property = (type, name) => {
    counts.properties++;
    const control = fresh.controls[type];
    const bundles = control ? [control.input_properties,
      ...Object.values(control.variant_input_properties),
      ...control.parent_context.map(context => fresh.parentContext[context] ?? {})] : [];
    if (!controls.has(type) || !bundles.some(bundle => Object.hasOwn(bundle, name))) {
      losses.push(`${type}: retired property '${name}' is absent from fresh extraction`);
    }
  };
  for (const [type, entry] of Object.entries(old.dumpSourced)) {
    if (retained.dumpSourced[type]) continue;
    counts.dump_controls++;
    if (!controls.has(type) || !fresh.controls[type]) {
      losses.push(`${type}: retired dump control is absent from fresh extraction`);
    }
    for (const name of entry.variants) variant(type, name);
    for (const name of Object.keys(entry.input_properties)) property(type, name);
  }
  for (const [type, entry] of Object.entries(old.controls)) {
    const remaining = retained.controls[type];
    for (const key of ['legacy_variants', 'observed_variants']) {
      const names = key === 'legacy_variants' ? entry[key] ?? [] : entry[key]?.variants ?? [];
      const keep = key === 'legacy_variants' ? remaining?.[key] ?? [] : remaining?.[key]?.variants ?? [];
      for (const name of names) if (!keep.includes(name)) variant(type, name);
    }
    for (const name of Object.keys(entry.additional_input_properties ?? {})) {
      if (!Object.hasOwn(remaining?.additional_input_properties ?? {}, name)) property(type, name);
    }
  }
  return { counts, losses };
}

export function main(args = process.argv.slice(2)) {
  if (args.length !== 2 && !(args.length === 4 && args[2] === '--retained-augmentations')) {
    console.error('usage: audit-retirement.mjs <old-augmentations.yml> <fresh-catalog-dir> [--retained-augmentations <file>]');
    return 2;
  }
  const read = path => readFileSync(path, 'utf8');
  const old = parseAugmentations(read(args[0]));
  const retained = parseAugmentations(read(args[3] ?? join(REPO_ROOT, 'knowledge/catalogs/control-augmentations.yml')));
  const fresh = parseProperties(read(join(args[1], 'control-properties.yml')));
  const manifest = parseManifest(read(join(args[1], 'control-manifest.yml')));
  const { counts, losses } = auditRetirement(old, fresh, retained, manifest.controls);
  for (const loss of losses) console.error(`LOSS: ${loss}`);
  console.log(`Retirement audit: ${counts.dump_controls} dump controls, ${counts.variants} variants, ${counts.properties} properties; ${losses.length} losses.`);
  return losses.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch (error) { console.error(`Retirement audit failed: ${error.message}`); process.exitCode = 2; }
}
