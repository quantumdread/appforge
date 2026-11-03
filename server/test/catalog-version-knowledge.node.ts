import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP = resolve(HERE, '..');
const SCRIPT = join(MCP, 'scripts', 'build-catalog.mjs');
const EXPECTED = join(HERE, 'fixtures', 'version-knowledge.expected.json');
const GENERATED = join(MCP, 'src', 'generated', 'catalog.ts');
const RULES = resolve(MCP, '..', 'knowledge');

function runWithAugmentationMutation(mutate: (source: string) => string) {
  const scratch = mkdtempSync(join(tmpdir(), 'appforge-version-knowledge-'));
  const scratchRules = join(scratch, 'knowledge');
  cpSync(RULES, scratchRules, { recursive: true });
  const augmentations = join(scratchRules, 'catalogs', 'control-augmentations.yml');
  writeFileSync(augmentations, mutate(readFileSync(augmentations, 'utf8')));
  try {
    const result = spawnSync('node', [SCRIPT], {
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, APPFORGE_RULES_ROOT: scratchRules },
    });
    return {
      code: result.status ?? 1,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function generatedJson(name: string): unknown {
  const generated = readFileSync(GENERATED, 'utf8');
  const value = generated.match(
    new RegExp(`export const ${name} = ([\\s\\S]*?) as const satisfies`, 'u'),
  )?.[1];
  if (value === undefined) throw new Error(`generated catalog has no ${name}`);
  return JSON.parse(value);
}

describe('catalog version knowledge', () => {
  it('generates the four field-verified migrations byte-for-byte', () => {
    execFileSync('node', [SCRIPT], { encoding: 'utf8', stdio: 'pipe' });
    const generated = readFileSync(GENERATED, 'utf8');
    const versionKnowledge = generated.match(
      /export const VERSION_KNOWLEDGE = ([\s\S]*?) as const satisfies/u,
    )?.[1];

    expect(`${versionKnowledge}\n`)
      .toBe(readFileSync(EXPECTED, 'utf8').replace(/\r\n/gu, '\n'));
  });

  it.each([
    {
      name: 'malformed entry',
      mutate: (source: string) => source.replace('        to: [Size]', '        to: Size'),
      expected: 'scalar target outside formula_rewrites',
    },
    {
      name: 'duplicate authored key',
      mutate: (source: string) => source.replace(
        '\naugmentations:',
        '\n  "Button@0.0.45":\n    target_type: ModernButton\n\naugmentations:',
      ),
      expected: "repeats authored key 'Button@0.0.45'",
    },
    {
      name: 'missing target',
      mutate: (source: string) => source.replace(/    target_type: ModernButton\r?\n/u, ''),
      expected: 'version_knowledge.Button@0.0.45.target_type is required',
    },
    {
      name: 'unknown top-level block',
      mutate: (source: string) => `${source}\nfuture_claims:\n`,
      expected: "unknown top-level block 'future_claims'",
    },
  ])('rejects $name before generating a catalog', ({ mutate, expected }) => {
    const result = runWithAugmentationMutation(mutate);

    expect(result.code).toBe(1);
    expect(result.output).toContain('BUILD GATE');
    expect(result.output).toContain(expected);
  });

  it('round-trips evidence classes and the claim-ref scheme from the augmentation catalog', () => {
    const onSelect = /OnSelect:\s*\{ type: Event,\s+verified: true, verified_at: 2026-05-10, verified_by: compile_canvas \}/u;
    try {
      const result = runWithAugmentationMutation(source => source.replace(
        onSelect,
        'OnSelect: { type: Event, verified: false, verified_at: 2026-05-10, verified_by: compile_canvas, falsifier: "compile rejects Gallery.OnSelect" }',
      ));
      expect(result.code).toBe(0);
      // The two legacy data-field lower bounds remain alongside this
      // deliberately unverified Gallery mutation.
      expect(generatedJson('EVIDENCE_CLASSES')).toEqual([
        {
          claim_ref: 'augmentation:Gallery.OnSelect',
          evidence_class: 'unverified-augmentation',
          falsifier: 'compile rejects Gallery.OnSelect',
        },
        { claim_ref: 'dump_sourced:ComboBoxDataField', evidence_class: 'dump-sourced-lower-bound' },
        { claim_ref: 'dump_sourced:TableDataField', evidence_class: 'dump-sourced-lower-bound' },
      ]);
    } finally {
      execFileSync('node', [SCRIPT], { encoding: 'utf8', stdio: 'pipe' });
    }
  });

  it('injects version knowledge and evidence classes through Worker and CLI source paths', async () => {
    vi.stubGlobal('__ANALYZER_CORE_VERSION__', 'catalog-injection-test');
    try {
      const { loadCatalog } = await import('../src/cli-artifact');
      const cliCatalog = loadCatalog();

      expect(ANALYZER_CATALOG_DATA.versionKnowledge)
        .toEqual(cliCatalog.versionKnowledge);
      expect(ANALYZER_CATALOG_DATA.evidenceClasses)
        .toEqual(cliCatalog.evidenceClasses);
      expect(Object.keys(cliCatalog.versionKnowledge)).toHaveLength(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
