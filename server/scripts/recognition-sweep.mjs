#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const SWEEP_ROOTS = [
  { directory: 'knowledge/templates', suffix: '.yaml' },
  { directory: 'cli/corpus/coverage', suffix: '.pa.yaml' },
  { directory: 'server/test/fixtures', suffix: '.pa.yaml' },
];

const bundledAnalyzer = await build({
  stdin: {
    contents: [
      "export { analyze } from '../src/lib/validator.ts';",
      "export { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data.ts';",
    ].join('\n'),
    loader: 'ts',
    resolveDir: HERE,
    sourcefile: 'recognition-sweep-entry.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
});
const analyzerUrl = `data:text/javascript;base64,${Buffer.from(bundledAnalyzer.outputFiles[0].contents).toString('base64')}`;
const { analyze, ANALYZER_CATALOG_DATA } = await import(analyzerUrl);

const filePaths = [];
for (const root of SWEEP_ROOTS) {
  const directory = resolve(REPO_ROOT, root.directory);
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(root.suffix)) {
      filePaths.push(resolve(directory, entry.name));
    }
  }
}
filePaths.sort((left, right) => left.localeCompare(right));

const failures = [];
for (const filePath of filePaths) {
  const file = relative(REPO_ROOT, filePath).replaceAll('\\', '/');
  const content = await readFile(filePath, 'utf8');
  const snapshot = analyze([{ name: file, content }], ANALYZER_CATALOG_DATA);
  const recognition = snapshot.coverage.files[0];
  console.log(JSON.stringify({
    file,
    recognizedRoots: recognition.recognizedRoots,
    unrecognizedLines: recognition.unrecognizedLines,
  }));
  if (recognition.unrecognizedLines > 0) {
    failures.push({ file, unrecognizedSpans: recognition.unrecognizedSpans });
  }
}

for (const failure of failures) console.error(JSON.stringify(failure));
if (failures.length > 0) process.exitCode = 1;
