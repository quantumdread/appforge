import * as nativeFs from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { canonicalProspectivePath, containedBy, SurveyOutputError } from './survey-output.mjs';

const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;

function usage(message) {
  return new SurveyOutputError('unsafe-skeleton-path', `datasource skeleton ${message}`, 2);
}

export function prepareDatasourceSkeleton({
  value, cwd, references, target, reportDir, inputJsonPaths,
}, { fs = nativeFs } = {}) {
  const requested = resolve(cwd, value);
  try {
    fs.lstatSync(requested);
    throw usage('destination already exists; choose a new file');
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error;
  }
  const path = canonicalProspectivePath(requested, fs);
  const canonicalTarget = canonicalProspectivePath(target, fs);
  if (pathKey(path) === pathKey(canonicalTarget)
    || (fs.lstatSync(canonicalTarget).isDirectory() && containedBy(canonicalTarget, path))) {
    throw usage('destination must be outside the input source');
  }
  for (const input of inputJsonPaths) {
    if (pathKey(path) === pathKey(fs.realpathSync.native(input))) {
      throw usage('destination must not replace an input JSON file');
    }
  }
  if (containedBy(reportDir, path)) {
    const reportRelative = pathKey(relative(reportDir, path));
    const firstSegment = reportRelative.split(sep)[0];
    if (reportRelative === '' || firstSegment.startsWith('.appforge-')
      || ['analysis-report.json', 'report-technical.md', 'analysis-baseline.json'].includes(reportRelative)
      || /^envelope-.*\.json$/u.test(reportRelative)) {
      throw usage('destination conflicts with a reserved report artifact or infrastructure path');
    }
  }
  try {
    const parent = fs.statSync(dirname(path));
    if (!parent.isDirectory()) throw usage('destination requires an existing parent directory');
    fs.accessSync(dirname(path), nativeFs.constants.W_OK);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) {
      throw usage('destination requires an existing parent directory');
    }
    throw error;
  }
  const names = [...new Set(references.map(reference => reference.authoredName))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  // Serialize rows directly: ordinary objects reorder integer-like keys and
  // assignment into an object treats __proto__ specially.
  const bytes = names.length === 0
    ? '{}\n'
    : `{\n${names.map(name => `  ${JSON.stringify(name)}: "unresolved"`).join(',\n')}\n}\n`;
  return { path, bytes };
}

export function writeDatasourceSkeleton(prepared, { fs = nativeFs } = {}) {
  try {
    fs.writeFileSync(prepared.path, prepared.bytes, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'filesystem write failed';
    throw new SurveyOutputError(
      'skeleton-write-failed',
      `unable to write datasource skeleton; reports may already exist; retry with a fresh skeleton destination: ${detail}`,
      3,
    );
  }
}
