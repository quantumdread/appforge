#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(HERE, '../test/fixtures/survey');

const bundledSurvey = await build({
  stdin: {
    contents: [
      "export { buildGoldenFixture } from '../test/fixtures/survey/build-golden-case.ts';",
      "export { SURVEY_GOLDEN_CASES } from '../test/fixtures/survey/cases.ts';",
      "export { renderTechnical } from '../src/core/survey/render-technical.ts';",
    ].join('\n'),
    loader: 'ts',
    resolveDir: HERE,
    sourcefile: 'regen-survey-goldens-entry.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const surveyUrl = `data:text/javascript;base64,${Buffer.from(bundledSurvey.outputFiles[0].contents).toString('base64')}`;
const { buildGoldenFixture, renderTechnical, SURVEY_GOLDEN_CASES } = await import(surveyUrl);

for (const fixture of SURVEY_GOLDEN_CASES) {
  const content = await readFile(resolve(FIXTURE_ROOT, fixture.source_file), 'utf8');
  const report = buildGoldenFixture(fixture, content);
  const jsonPath = resolve(FIXTURE_ROOT, `${fixture.name}.report.json`);
  const markdownPath = resolve(FIXTURE_ROOT, `${fixture.name}.report.md`);
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(markdownPath, renderTechnical(report), 'utf8');
  console.log(`regenerated ${fixture.name}: ${jsonPath}`);
  console.log(`regenerated ${fixture.name}: ${markdownPath}`);
}
