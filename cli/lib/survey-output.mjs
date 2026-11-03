import { createHash, randomUUID } from 'node:crypto';
import * as nativeFs from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';

export class SurveyOutputError extends Error {
  constructor(code, message, exitCode = 3) {
    super(message);
    this.name = 'SurveyOutputError';
    this.code = code;
    this.exit_code = exitCode;
  }
}

const compareLexically = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const canonicalJson = value => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const OUTPUT_LOCK = '.appforge-survey.lock';
const utf8 = new TextDecoder('utf-8', { fatal: true });
// Same case-folding path comparison the submit preflight uses
// (`lib/submit-envelope.mjs`): Windows paths that differ only in case name the
// same file, so exact string equality would refuse a legitimate submission.
const pathKey = value => process.platform === 'win32' ? value.toLowerCase() : value;
const localLockOwners = new Set();

// Mirrors intake's `filesystemError` split so the two front doors agree on what
// a caller can fix (exit 2) versus what the environment denied (exit 3).
// Containment refusals and junction/reparse refusals are NOT I/O errors: they
// stay usage failures and never reach this helper.
function outputFilesystemError(error, message) {
  const errorCode = error && typeof error === 'object' ? error.code : undefined;
  const usage = errorCode === 'ENOENT' || errorCode === 'ENOTDIR';
  return new SurveyOutputError(
    usage ? 'unsafe-output-path' : 'output-path-unreadable',
    message,
    usage ? 2 : 3,
  );
}

function rejectReparseTraversal(pathValue, fs = nativeFs) {
  const absolute = resolve(pathValue);
  const root = parse(absolute).root;
  const segments = relative(root, absolute).split(sep).filter(Boolean);
  let cursor = root;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    if (!fs.existsSync(cursor)) break;
    let stat;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      throw outputFilesystemError(
        error,
        'unable to inspect the survey output path safely',
      );
    }
    if (stat.isSymbolicLink()) {
      throw new SurveyOutputError(
        'unsafe-output-path',
        'survey output must not traverse a symbolic link, junction, or reparse point',
        2,
      );
    }
  }
}

export function canonicalProspectivePath(pathValue, fs = nativeFs) {
  const absolute = resolve(pathValue);
  rejectReparseTraversal(absolute, fs);
  const suffix = [];
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      throw new SurveyOutputError(
        'unsafe-output-path',
        'survey output has no inspectable existing ancestor',
        2,
      );
    }
    suffix.unshift(relative(parent, ancestor));
    ancestor = parent;
  }
  let canonical;
  try {
    canonical = fs.realpathSync.native(ancestor);
  } catch (error) {
    throw outputFilesystemError(
      error,
      'unable to resolve the survey output path safely',
    );
  }
  return resolve(canonical, ...suffix);
}

export function containedBy(directory, candidate) {
  const relation = relative(directory, candidate);
  return relation === '' || (!isAbsolute(relation)
    && relation !== '..'
    && !relation.startsWith(`..${sep}`));
}

export function resolveSurveyReportDirectory({
  target,
  reportValue,
  cwd = process.cwd(),
  fs = nativeFs,
}) {
  let targetStat;
  try {
    rejectReparseTraversal(target, fs);
    targetStat = fs.lstatSync(target);
  } catch (error) {
    if (error instanceof SurveyOutputError) throw error;
    throw outputFilesystemError(error, 'unable to inspect survey target');
  }
  const canonicalTarget = canonicalProspectivePath(target, fs);
  const requested = reportValue === null
    ? join(cwd, 'appforge-survey')
    : resolve(cwd, reportValue);
  const canonicalReport = canonicalProspectivePath(requested, fs);

  if (targetStat.isDirectory() && containedBy(canonicalTarget, canonicalReport)) {
    const detail = reportValue === null
      ? 'the implicit survey output conflicts with the directory target; use --report with a directory outside the target'
      : 'survey --report must be outside the directory target';
    throw new SurveyOutputError('unsafe-output-containment', detail, 2);
  }
  return canonicalReport;
}

export function createAnalysisBaseline(report, acceptedAt) {
  const byTuple = new Map();
  for (const finding of report.findings) {
    if (finding.severity === 'BLOCK') continue;
    const key = `${finding.fingerprint}\u0000${finding.rule}`;
    if (!byTuple.has(key)) {
      byTuple.set(key, {
        fingerprint: finding.fingerprint,
        rule: finding.rule,
        accepted_at: acceptedAt,
      });
    }
  }
  return {
    baseline_schema: 'analysis-baseline/1',
    formula: 'finding-fingerprint/2',
    fingerprint_basis: report.identity.fingerprint_basis,
    entries: [...byTuple.entries()]
      .sort(([left], [right]) => compareLexically(left, right))
      .map(([, entry]) => entry),
  };
}

function call(operation, name, action) {
  const after = operation(name);
  try {
    return action();
  } finally {
    if (typeof after === 'function') after();
  }
}

function openFile(fs, operation, name, pathValue) {
  const after = operation(`${name}:open`);
  const descriptor = fs.openSync(pathValue, 'wx', 0o600);
  try {
    if (typeof after === 'function') after();
  } catch (error) {
    try {
      fs.closeSync(descriptor);
    } catch {
      // Preserve the directory-binding failure after best-effort descriptor closure.
    }
    throw error;
  }
  return descriptor;
}

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
}

function decodeUtf8(bytes, label) {
  try {
    return utf8.decode(asBuffer(bytes));
  } catch {
    throw new SurveyOutputError(
      'output-validation-failed',
      `${label} is not canonical UTF-8`,
      3,
    );
  }
}

function readBytes(fs, operation, pathValue, name) {
  return asBuffer(call(operation, `${name}:read`, () => fs.readFileSync(pathValue)));
}

function readUtf8(fs, operation, pathValue, name) {
  return decodeUtf8(readBytes(fs, operation, pathValue, name), name);
}

function stageFile(fs, operation, pathValue, bytes, name, onOpened = () => {}) {
  let descriptor;
  let closed = false;
  try {
    descriptor = openFile(fs, operation, name, pathValue);
    const openedStat = fs.fstatSync(descriptor);
    onOpened({ dev: openedStat.dev, ino: openedStat.ino });
    call(operation, `${name}:write`, () => fs.writeFileSync(descriptor, bytes));
    call(operation, `${name}:flush`, () => fs.fsyncSync(descriptor));
    call(operation, `${name}:close`, () => fs.closeSync(descriptor));
    closed = true;
  } finally {
    if (descriptor !== undefined && !closed) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The caller's rollback/recovery path owns any remaining whole temp.
      }
    }
  }
}

function sameFile(fs, left, right) {
  try {
    const leftStat = fs.statSync(left);
    const rightStat = fs.statSync(right);
    return leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

const quarantineDirectory = (basePath, purpose = 'remove') => `${basePath}.${purpose}`;
const quarantineGeneration = directoryPath => join(directoryPath, 'generation');

function quarantineIdentity(fs, directoryPath) {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('invalid quarantine directory');
  return { dev: stat.dev, ino: stat.ino };
}

function assertQuarantineIdentity(fs, directoryPath, expected) {
  const current = quarantineIdentity(fs, directoryPath);
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    throw new Error('quarantine directory changed');
  }
}

function assertQuarantineGeneration(fs, generationPath) {
  const stat = fs.lstatSync(generationPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('invalid quarantine generation');
}

function finishQuarantine(fs, directoryPath, generationPath, identity) {
  assertQuarantineIdentity(fs, directoryPath, identity);
  try {
    fs.unlinkSync(generationPath);
  } catch (error) {
    if (fs.existsSync(generationPath)) throw error;
  }
  try {
    fs.rmdirSync(directoryPath);
  } catch (error) {
    if (fs.existsSync(directoryPath)) throw error;
  }
}

function inspectQuarantine(fs, directoryPath, failure) {
  if (!fs.existsSync(directoryPath)) return null;
  let identity;
  let entries;
  try {
    identity = quarantineIdentity(fs, directoryPath);
    entries = fs.readdirSync(directoryPath).sort(compareLexically);
  } catch {
    throw failure();
  }
  if (entries.length === 0) {
    try {
      assertQuarantineIdentity(fs, directoryPath, identity);
      fs.rmdirSync(directoryPath);
    } catch (error) {
      if (fs.existsSync(directoryPath)) throw failure();
    }
    return null;
  }
  if (entries.length !== 1 || entries[0] !== 'generation') throw failure();
  try {
    assertQuarantineGeneration(fs, quarantineGeneration(directoryPath));
  } catch {
    throw failure();
  }
  return {
    directoryPath,
    generationPath: quarantineGeneration(directoryPath),
    identity,
  };
}

function captureQuarantine(fs, sourcePath, directoryPath, failure) {
  try {
    fs.mkdirSync(directoryPath, { mode: 0o700 });
  } catch {
    throw failure();
  }
  const generationPath = quarantineGeneration(directoryPath);
  let identity;
  try {
    identity = quarantineIdentity(fs, directoryPath);
    if (fs.readdirSync(directoryPath).length !== 0) throw new Error('nonempty quarantine');
    assertQuarantineIdentity(fs, directoryPath, identity);
    try {
      fs.renameSync(sourcePath, generationPath);
    } catch (error) {
      const completed = !fs.existsSync(sourcePath)
        && fs.existsSync(generationPath);
      if (!completed) throw error;
    }
    assertQuarantineIdentity(fs, directoryPath, identity);
    const entries = fs.readdirSync(directoryPath).sort(compareLexically);
    if (entries.length !== 1 || entries[0] !== 'generation') {
      throw new Error('invalid quarantine contents');
    }
    assertQuarantineGeneration(fs, generationPath);
  } catch {
    try {
      if (fs.existsSync(directoryPath) && fs.readdirSync(directoryPath).length === 0) {
        fs.rmdirSync(directoryPath);
      }
    } catch {
      // Preserve an uncertain directory for journal recovery.
    }
    throw failure();
  }
  return { directoryPath, generationPath, identity };
}

function linkGenerationExclusive(fs, generationPath, finalPath) {
  try {
    fs.linkSync(generationPath, finalPath);
  } catch (error) {
    if (!sameFile(fs, generationPath, finalPath)) throw error;
  }
  if (!sameFile(fs, generationPath, finalPath)) throw new Error('exclusive link identity mismatch');
}

function restoreCapturedGeneration(fs, quarantine, finalPath) {
  try {
    linkGenerationExclusive(fs, quarantine.generationPath, finalPath);
  } catch {
    return false;
  }
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
  } catch {
    // Both names preserve the same generation for journal recovery.
  }
  return true;
}

function removeOwnedFinalAction(
  fs,
  finalPath,
  quarantinePath,
  expectedHash,
  errorCode,
  errorMessage,
  quarantinePurpose = 'remove',
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = captureQuarantine(
    fs,
    finalPath,
    quarantineDirectory(quarantinePath, quarantinePurpose),
    failure,
  );

  let currentHash;
  try {
    currentHash = sha256(asBuffer(fs.readFileSync(quarantine.generationPath)));
  } catch {
    restoreCapturedGeneration(fs, quarantine, finalPath);
    throw failure();
  }

  if (currentHash !== expectedHash) {
    restoreCapturedGeneration(fs, quarantine, finalPath);
    throw failure();
  }
  if (fs.existsSync(finalPath)) {
    throw failure();
  }
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
    if (fs.existsSync(finalPath)) throw failure();
  } catch {
    throw failure();
  }
}

function removeOwnedLinkAction(
  fs,
  finalPath,
  witnessPath,
  quarantinePath,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = captureQuarantine(fs, finalPath, quarantinePath, failure);
  if (!sameFile(fs, quarantine.generationPath, witnessPath)) {
    restoreCapturedGeneration(fs, quarantine, finalPath);
    throw failure();
  }
  if (fs.existsSync(finalPath)) throw failure();
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
    if (fs.existsSync(finalPath)) throw failure();
  } catch {
    throw failure();
  }
}

function restoreBackupAction(
  fs,
  backupPath,
  finalPath,
  expectedHash,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = captureQuarantine(
    fs,
    backupPath,
    quarantineDirectory(backupPath, 'restore'),
    failure,
  );
  try {
    if (sha256(asBuffer(fs.readFileSync(quarantine.generationPath))) !== expectedHash) {
      restoreCapturedGeneration(fs, quarantine, backupPath);
      throw failure();
    }
    linkGenerationExclusive(fs, quarantine.generationPath, finalPath);
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
  } catch {
    if (!sameFile(fs, quarantine.generationPath, finalPath)) {
      restoreCapturedGeneration(fs, quarantine, backupPath);
    }
    throw failure();
  }
}

function captureBackupAction(
  fs,
  finalPath,
  backupPath,
  expectedHash,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = captureQuarantine(
    fs,
    finalPath,
    quarantineDirectory(backupPath, 'capture'),
    failure,
  );
  try {
    if (sha256(asBuffer(fs.readFileSync(quarantine.generationPath))) !== expectedHash) {
      restoreCapturedGeneration(fs, quarantine, finalPath);
      throw failure();
    }
    linkGenerationExclusive(fs, quarantine.generationPath, backupPath);
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
  } catch {
    if (!sameFile(fs, quarantine.generationPath, backupPath)) {
      restoreCapturedGeneration(fs, quarantine, finalPath);
    }
    throw failure();
  }
}

function publishTempExclusiveAction(
  fs,
  tempPath,
  finalPath,
  expectedHash,
  expectedIdentity,
  removeTemp,
  errorCode,
  errorMessage,
) {
  try {
    const current = fs.statSync(tempPath);
    if (current.dev !== expectedIdentity.dev || current.ino !== expectedIdentity.ino) {
      throw new Error('publication source identity mismatch');
    }
    if (sha256(asBuffer(fs.readFileSync(tempPath))) !== expectedHash) {
      throw new Error('publication source hash mismatch');
    }
    linkGenerationExclusive(fs, tempPath, finalPath);
    if (removeTemp) {
      removeOwnedIdentityPathAction(
        fs,
        tempPath,
        expectedIdentity,
        errorCode,
        errorMessage,
      );
    }
  } catch {
    throw new SurveyOutputError(errorCode, errorMessage, 3);
  }
}

function recoverRemovalQuarantine(
  fs,
  sourcePath,
  quarantineBase,
  expectedHash,
  errorCode,
  errorMessage,
  quarantinePurpose = 'remove',
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = inspectQuarantine(
    fs,
    quarantineDirectory(quarantineBase, quarantinePurpose),
    failure,
  );
  if (!quarantine) return;
  let currentHash;
  try {
    currentHash = sha256(asBuffer(fs.readFileSync(quarantine.generationPath)));
  } catch {
    throw failure();
  }
  if (currentHash !== expectedHash) {
    restoreCapturedGeneration(fs, quarantine, sourcePath);
    throw failure();
  }
  if (fs.existsSync(sourcePath)) throw failure();
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
    if (fs.existsSync(sourcePath)) throw failure();
  } catch {
    throw failure();
  }
}

function recoverRestoreQuarantine(
  fs,
  backupPath,
  finalPath,
  expectedHash,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = inspectQuarantine(
    fs,
    quarantineDirectory(backupPath, 'restore'),
    failure,
  );
  if (!quarantine) return false;
  let currentHash;
  try {
    currentHash = sha256(asBuffer(fs.readFileSync(quarantine.generationPath)));
  } catch {
    throw failure();
  }
  if (currentHash !== expectedHash) {
    restoreCapturedGeneration(fs, quarantine, backupPath);
    throw failure();
  }
  if (fs.existsSync(backupPath) && !sameFile(fs, backupPath, quarantine.generationPath)) {
    throw failure();
  }
  try {
    if (!fs.existsSync(finalPath)) {
      linkGenerationExclusive(fs, quarantine.generationPath, finalPath);
    } else if (!sameFile(fs, finalPath, quarantine.generationPath)) {
      throw failure();
    }
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
  } catch {
    throw failure();
  }
  return true;
}

function recoverBackupCaptureQuarantine(
  fs,
  finalPath,
  backupPath,
  expectedHash,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = inspectQuarantine(
    fs,
    quarantineDirectory(backupPath, 'capture'),
    failure,
  );
  if (!quarantine) return;
  let currentHash;
  try {
    currentHash = sha256(asBuffer(fs.readFileSync(quarantine.generationPath)));
  } catch {
    throw failure();
  }
  if (currentHash !== expectedHash) {
    restoreCapturedGeneration(fs, quarantine, finalPath);
    throw failure();
  }
  if (fs.existsSync(backupPath)) {
    if (!sameFile(fs, backupPath, quarantine.generationPath)) throw failure();
    try {
      finishQuarantine(
        fs,
        quarantine.directoryPath,
        quarantine.generationPath,
        quarantine.identity,
      );
    } catch {
      throw failure();
    }
    return;
  }
  if (fs.existsSync(finalPath)) throw failure();
  if (!fs.existsSync(finalPath) && !restoreCapturedGeneration(fs, quarantine, finalPath)) {
    throw failure();
  } else if (fs.existsSync(quarantine.directoryPath)) {
    try {
      finishQuarantine(
        fs,
        quarantine.directoryPath,
        quarantine.generationPath,
        quarantine.identity,
      );
    } catch {
      throw failure();
    }
  }
}

function recoverLinkRemovalQuarantine(
  fs,
  finalPath,
  witnessPath,
  directoryPath,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = inspectQuarantine(fs, directoryPath, failure);
  if (!quarantine) return;
  if (!sameFile(fs, quarantine.generationPath, witnessPath)) {
    restoreCapturedGeneration(fs, quarantine, finalPath);
    throw failure();
  }
  if (fs.existsSync(finalPath)) throw failure();
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
    if (fs.existsSync(finalPath)) throw failure();
  } catch {
    throw failure();
  }
}

function removeOwnedHashedPathAction(fs, pathValue, expectedHash, errorCode, errorMessage) {
  removeOwnedFinalAction(
    fs,
    pathValue,
    pathValue,
    expectedHash,
    errorCode,
    errorMessage,
    'delete',
  );
}

function removeOwnedIdentityPathAction(fs, pathValue, expected, errorCode, errorMessage) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = captureQuarantine(
    fs,
    pathValue,
    quarantineDirectory(pathValue, 'delete'),
    failure,
  );
  let current;
  try {
    current = fs.statSync(quarantine.generationPath);
  } catch {
    restoreCapturedGeneration(fs, quarantine, pathValue);
    throw failure();
  }
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    restoreCapturedGeneration(fs, quarantine, pathValue);
    throw failure();
  }
  if (fs.existsSync(pathValue)) throw failure();
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
    if (fs.existsSync(pathValue)) throw failure();
  } catch {
    throw failure();
  }
}

function unlinkOwnedLockIdentityAction(fs, pathValue, expected, errorCode, errorMessage) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  let current;
  try {
    current = fs.statSync(pathValue);
  } catch {
    throw failure();
  }
  if (current.dev !== expected.dev || current.ino !== expected.ino) throw failure();
  try {
    fs.unlinkSync(pathValue);
  } catch {
    if (fs.existsSync(pathValue)) throw failure();
  }
}

function directoryIdentity(reportDir, fs) {
  let stat;
  let canonical;
  try {
    stat = fs.lstatSync(reportDir);
    canonical = fs.realpathSync.native(reportDir);
  } catch {
    throw new SurveyOutputError(
      'unsafe-output-path',
      'unable to bind the survey output directory safely',
      3,
    );
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new SurveyOutputError(
      'unsafe-output-path',
      'survey output directory became a reparse point',
      3,
    );
  }
  return { dev: stat.dev, ino: stat.ino, canonical };
}

function assertDirectoryIdentity(reportDir, expected, fs) {
  const current = directoryIdentity(reportDir, fs);
  const sameCanonical = process.platform === 'win32'
    ? current.canonical.toLowerCase() === expected.canonical.toLowerCase()
    : current.canonical === expected.canonical;
  if (current.dev !== expected.dev || current.ino !== expected.ino || !sameCanonical) {
    throw new SurveyOutputError(
      'unsafe-output-path',
      'survey output directory identity changed during publication',
      3,
    );
  }
}

function assertBoundDirectory(reportDir, expected, fs) {
  const bound = directoryIdentity('.', fs);
  if (bound.dev !== expected.dev || bound.ino !== expected.ino) {
    throw new SurveyOutputError(
      'unsafe-output-path',
      'survey output directory binding changed during publication',
      3,
    );
  }
  assertDirectoryIdentity(reportDir, expected, fs);
}

function validateLock(value) {
  if (!value || typeof value !== 'object'
    || value.lock_schema !== 'survey-output-lock/1'
    || !Number.isSafeInteger(value.pid)
    || value.pid <= 0
    || !UUID_V4.test(value.invocation_id)
    || Object.keys(value).sort().join(',') !== 'invocation_id,lock_schema,pid') return null;
  return value;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function lockOwnerIsActive(pid, invocationId) {
  return pid === process.pid ? localLockOwners.has(invocationId) : processIsAlive(pid);
}

function createLockMarker(pathValue, fs, operation, name) {
  let descriptor;
  let closed = false;
  try {
    descriptor = openFile(fs, operation, name, pathValue);
    call(operation, `${name}:flush`, () => fs.fsyncSync(descriptor));
    call(operation, `${name}:close`, () => fs.closeSync(descriptor));
    closed = true;
  } finally {
    if (descriptor !== undefined && !closed) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The unique marker is removed by the acquisition failure path.
      }
    }
  }
}

const choosingLock = name => {
  const match = /^\.appforge-survey-lock-choosing-([1-9][0-9]*)-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.lock$/u.exec(name);
  if (!match) return null;
  const pid = Number(match[1]);
  return Number.isSafeInteger(pid) ? { name, pid, invocationId: match[2] } : null;
};

const claimedLock = name => {
  const match = /^\.appforge-survey-lock-claim-([0-9]{16})-([1-9][0-9]*)-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.lock$/u.exec(name);
  if (!match) return null;
  const ticket = Number(match[1]);
  const pid = Number(match[2]);
  return Number.isSafeInteger(ticket) && ticket > 0 && Number.isSafeInteger(pid)
    ? { name, ticket, pid, invocationId: match[3] }
    : null;
};

function removeUniqueLockMarker(reportDir, marker, fs, operation, name, observed = null) {
  const markerPath = join(reportDir, marker);
  let expected = observed;
  if (expected === null) {
    try {
      expected = fs.statSync(markerPath);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
  }
  try {
    call(operation, name, () => {
      let current;
      try {
        current = fs.statSync(markerPath);
      } catch (error) {
        if (error?.code === 'ENOENT') return;
        throw error;
      }
      if (current.dev !== expected.dev || current.ino !== expected.ino) {
        throw new SurveyOutputError(
          'output-lock-invalid',
          'survey output lock marker changed during cleanup',
          3,
        );
      }
      fs.unlinkSync(markerPath);
    });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      try {
        const current = fs.statSync(markerPath);
        if (current.dev !== expected.dev || current.ino !== expected.ino) return;
      } catch (inspectionError) {
        if (inspectionError?.code === 'ENOENT') return;
      }
    }
    throw error;
  }
}

function recoverLegacyOutputLock(reportDir, fs, operation) {
  const lockPath = join(reportDir, OUTPUT_LOCK);
  call(operation, 'lock:legacy-probe', () => {});
  if (!fs.existsSync(lockPath)) return;
  let existing;
  let before;
  let after;
  try {
    before = fs.statSync(lockPath);
    const existingBytes = readBytes(fs, operation, lockPath, 'lock:legacy-existing');
    const text = decodeUtf8(existingBytes, 'survey output lock');
    existing = validateLock(JSON.parse(text));
    after = fs.statSync(lockPath);
    if (!existing || text !== canonicalJson(existing)
      || before.dev !== after.dev || before.ino !== after.ino) throw new Error('invalid lock');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw new SurveyOutputError(
      'output-lock-invalid',
      'survey output contains an invalid or changing legacy lock',
      3,
    );
  }
  call(operation, 'lock:legacy-observed', () => {});
  if (lockOwnerIsActive(existing.pid, existing.invocation_id)) {
    throw new SurveyOutputError(
      'output-busy',
      'survey output is already being written by another live invocation',
      3,
    );
  }
  const witnessName = `.appforge-survey-lock-${existing.invocation_id}.tmp`;
  const witness = join(reportDir, witnessName);
  const ownsWitness = sameFile(fs, lockPath, witness);
  removeUniqueLockMarker(
    reportDir,
    OUTPUT_LOCK,
    fs,
    operation,
    'lock:remove-legacy',
    after,
  );
  if (ownsWitness) {
    removeUniqueLockMarker(
      reportDir,
      witnessName,
      fs,
      operation,
      'lock:remove-legacy-witness',
    );
  }
}

function acquireOutputLock(reportDir, invocationId, fs, operation) {
  if (!UUID_V4.test(invocationId)) {
    throw new SurveyOutputError('output-lock-invalid', 'survey output invocation id is invalid', 3);
  }
  recoverLegacyOutputLock(reportDir, fs, operation);
  localLockOwners.add(invocationId);
  const choosingName = `.appforge-survey-lock-choosing-${process.pid}-${invocationId}.lock`;
  const choosingPath = join(reportDir, choosingName);
  let claimName = null;
  let acquired = false;
  try {
    createLockMarker(choosingPath, fs, operation, 'lock:choosing');
    const initialNames = call(operation, 'lock:ticket-scan', () => fs.readdirSync(reportDir));
    let maxTicket = 0;
    for (const name of initialNames) {
      const claim = claimedLock(name);
      if (!claim) continue;
      if (!lockOwnerIsActive(claim.pid, claim.invocationId)) {
        removeUniqueLockMarker(reportDir, name, fs, operation, 'lock:remove-dead-claim');
      } else {
        maxTicket = Math.max(maxTicket, claim.ticket);
      }
    }
    if (maxTicket >= Number.MAX_SAFE_INTEGER) {
      throw new SurveyOutputError('output-lock-invalid', 'survey output lock ticket is exhausted', 3);
    }
    const ticket = maxTicket + 1;
    claimName = `.appforge-survey-lock-claim-${String(ticket).padStart(16, '0')}-${process.pid}-${invocationId}.lock`;
    createLockMarker(join(reportDir, claimName), fs, operation, 'lock:claim');
    removeUniqueLockMarker(reportDir, choosingName, fs, operation, 'lock:finish-choosing');

    const choosingNames = call(operation, 'lock:choosing-scan', () => fs.readdirSync(reportDir));
    for (const name of choosingNames) {
      const choosing = choosingLock(name);
      if (!choosing || name === choosingName) continue;
      if (lockOwnerIsActive(choosing.pid, choosing.invocationId)) {
        throw new SurveyOutputError(
          'output-busy',
          'survey output is being claimed by another live invocation',
          3,
        );
      }
      removeUniqueLockMarker(reportDir, name, fs, operation, 'lock:remove-dead-choosing');
    }

    const claims = call(operation, 'lock:claim-scan', () => fs.readdirSync(reportDir))
      .map(claimedLock)
      .filter(Boolean);
    const liveClaims = [];
    for (const claim of claims) {
      if (!lockOwnerIsActive(claim.pid, claim.invocationId)) {
        removeUniqueLockMarker(reportDir, claim.name, fs, operation, 'lock:remove-dead-claim');
      } else {
        liveClaims.push(claim);
      }
    }
    liveClaims.sort((left, right) => left.ticket - right.ticket
      || compareLexically(left.invocationId, right.invocationId)
      || left.pid - right.pid);
    if (liveClaims[0]?.name !== claimName) {
      throw new SurveyOutputError(
        'output-busy',
        'survey output is already being written by another live invocation',
        3,
      );
    }
    acquired = true;
    const claimPath = join(reportDir, claimName);
    const claimStat = fs.statSync(claimPath);
    return {
      claimPath,
      claimIdentity: { dev: claimStat.dev, ino: claimStat.ino },
      invocationId,
    };
  } finally {
    if (!acquired) {
      localLockOwners.delete(invocationId);
      try {
        if (claimName) removeUniqueLockMarker(
          reportDir,
          claimName,
          fs,
          operation,
          'lock:abandon-claim',
        );
        removeUniqueLockMarker(
          reportDir,
          choosingName,
          fs,
          operation,
          'lock:abandon-choosing',
        );
      } catch {
        // Unique dead-owner markers are reclaimed by the next contender.
      }
    }
  }
}

function releaseOutputLock(lock, fs, operation) {
  if (!lock) return;
  try {
    if (fs.existsSync(lock.claimPath)) {
      call(operation, 'lock:release', () => unlinkOwnedLockIdentityAction(
        fs,
        lock.claimPath,
        lock.claimIdentity,
        'output-lock-invalid',
        'survey output lock marker changed during release',
      ));
    }
  } finally {
    localLockOwners.delete(lock.invocationId);
  }
}

function validateJournal(value, invocationId) {
  if (!value || typeof value !== 'object' || value.journal_schema !== 'survey-output-journal/1') {
    return null;
  }
  if (Object.keys(value).sort().join(',')
    !== 'envelope_final,envelope_sha256,envelope_temp,journal_schema,mutable,report_final,report_sha256,report_temp') {
    return null;
  }
  const prefix = `.appforge-survey-${invocationId}`;
  if (value.report_final !== 'analysis-report.json'
    || value.report_temp !== `${prefix}-analysis-report.json.tmp`
    || typeof value.report_sha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.report_sha256)
    || typeof value.envelope_final !== 'string'
    || !/^envelope-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/u.test(value.envelope_final)
    || typeof value.envelope_sha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.envelope_sha256)
    || value.envelope_temp !== `${prefix}-envelope.tmp`
    || !Array.isArray(value.mutable)) return null;
  const finals = value.mutable.map(row => row?.final);
  const expectedFinals = finals.includes('analysis-baseline.json')
    ? ['report-technical.md', 'analysis-baseline.json', 'analysis-report.json']
    : ['report-technical.md', 'analysis-report.json'];
  if (finals.length !== expectedFinals.length
    || finals.some((final, index) => final !== expectedFinals[index])) return null;
  for (const row of value.mutable) {
    if (!row || typeof row !== 'object'
      || Object.keys(row).sort().join(',')
        !== 'backup,final,had_existing,new_sha256,old_sha256,temp'
      || row.temp !== `${prefix}-${row.final}.tmp`
      || row.backup !== `${prefix}-${row.final}.bak`
      || typeof row.had_existing !== 'boolean'
      || typeof row.new_sha256 !== 'string'
      || !/^[0-9a-f]{64}$/u.test(row.new_sha256)
      || (row.had_existing
        ? typeof row.old_sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(row.old_sha256)
        : row.old_sha256 !== null)) return null;
  }
  const reportRow = value.mutable.at(-1);
  if (reportRow.new_sha256 !== value.report_sha256) return null;
  return value;
}

function recoverJournalDeletionQuarantine(
  fs,
  journalPath,
  validator,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = inspectQuarantine(
    fs,
    quarantineDirectory(journalPath, 'delete'),
    failure,
  );
  if (!quarantine) return;
  let valid = false;
  try {
    valid = validator(decodeUtf8(
      asBuffer(fs.readFileSync(quarantine.generationPath)),
      'recovery journal quarantine',
    ));
  } catch {
    valid = false;
  }
  if (!valid) {
    if (!fs.existsSync(journalPath)) {
      restoreCapturedGeneration(fs, quarantine, journalPath);
    }
    throw failure();
  }
  if (fs.existsSync(journalPath) && !sameFile(fs, journalPath, quarantine.generationPath)) {
    throw failure();
  }
  try {
    if (!fs.existsSync(journalPath)) {
      linkGenerationExclusive(fs, quarantine.generationPath, journalPath);
    }
    if (!sameFile(fs, journalPath, quarantine.generationPath)) throw failure();
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
  } catch (error) {
    throw error instanceof SurveyOutputError ? error : failure();
  }
}

function finishJournalTempDeletionQuarantine(
  fs,
  journalTempPath,
  validator,
  errorCode,
  errorMessage,
) {
  const failure = () => new SurveyOutputError(errorCode, errorMessage, 3);
  const quarantine = inspectQuarantine(
    fs,
    quarantineDirectory(journalTempPath, 'delete'),
    failure,
  );
  if (!quarantine) return;
  let valid = false;
  try {
    valid = validator(decodeUtf8(
      asBuffer(fs.readFileSync(quarantine.generationPath)),
      'recovery journal temp quarantine',
    ));
  } catch {
    valid = false;
  }
  if (!valid
    || (fs.existsSync(journalTempPath)
      && !sameFile(fs, journalTempPath, quarantine.generationPath))) {
    throw failure();
  }
  try {
    finishQuarantine(
      fs,
      quarantine.directoryPath,
      quarantine.generationPath,
      quarantine.identity,
    );
  } catch {
    throw failure();
  }
}

function recoverJournal(reportDir, journalName, invocationId, fs, operation) {
  const journalPath = join(reportDir, journalName);
  let journal;
  let journalHash;
  try {
    const journalText = readUtf8(fs, operation, journalPath, 'recovery:journal');
    journalHash = sha256(Buffer.from(journalText, 'utf8'));
    journal = validateJournal(JSON.parse(journalText), invocationId);
    if (journal && journalText !== canonicalJson(journal)) journal = null;
  } catch {
    throw new SurveyOutputError(
      'output-recovery-failed',
      'survey output contains an unreadable recovery journal',
      3,
    );
  }
  if (!journal) {
    throw new SurveyOutputError(
      'output-recovery-failed',
      'survey output contains an invalid recovery journal',
      3,
    );
  }
  const journalTempPath = join(
    reportDir,
    `.appforge-survey-journal-${invocationId}.tmp`,
  );
  if (fs.existsSync(quarantineDirectory(journalTempPath, 'delete'))) {
    call(operation, 'recovery:journal-temp:finish-remove', () => (
      recoverLinkRemovalQuarantine(
        fs,
        journalTempPath,
        journalPath,
        quarantineDirectory(journalTempPath, 'delete'),
        'output-recovery-failed',
        'survey output recovery journal temp changed during cleanup',
      )
    ));
  }
  const reportPath = join(reportDir, journal.report_final);
  let committed = false;
  if (fs.existsSync(reportPath)) {
    try {
      committed = sha256(readBytes(fs, operation, reportPath, 'recovery:report'))
        === journal.report_sha256;
    } catch {
      throw new SurveyOutputError(
        'output-recovery-failed',
        'survey output commit marker is temporarily unreadable',
        3,
      );
    }
  }

  if (!committed) {
    for (const row of [...journal.mutable].reverse()) {
      const finalPath = join(reportDir, row.final);
      const tempPath = join(reportDir, row.temp);
      const backupPath = join(reportDir, row.backup);
      if (row.had_existing && fs.existsSync(quarantineDirectory(backupPath, 'capture'))) {
        call(operation, `recovery:${row.final}:finish-backup-capture`, () => (
          recoverBackupCaptureQuarantine(
            fs,
            finalPath,
            backupPath,
            row.old_sha256,
            'output-recovery-failed',
            'survey output recovery could not finish capturing the prior generation',
          )
        ));
      }
      if (fs.existsSync(quarantineDirectory(backupPath, 'restore'))) {
        call(operation, `recovery:${row.final}:finish-restore`, () => recoverRestoreQuarantine(
          fs,
          backupPath,
          finalPath,
          row.old_sha256,
          'output-recovery-failed',
          'survey output recovery could not finish restoring the prior generation',
        ));
      }
      if (fs.existsSync(quarantineDirectory(tempPath))) {
        call(operation, `recovery:${row.final}:finish-remove-new`, () => recoverRemovalQuarantine(
          fs,
          finalPath,
          tempPath,
          row.new_sha256,
          'output-recovery-failed',
          'survey output recovery could not finish removing the invocation generation',
        ));
      }
      if (fs.existsSync(quarantineDirectory(tempPath, 'delete'))) {
        call(operation, `recovery:${row.final}:finish-remove-temp`, () => recoverRemovalQuarantine(
          fs,
          tempPath,
          tempPath,
          row.new_sha256,
          'output-recovery-failed',
          'survey output recovery could not finish removing its temp generation',
          'delete',
        ));
      }
      if (row.had_existing && fs.existsSync(quarantineDirectory(backupPath, 'delete'))) {
        call(operation, `recovery:${row.final}:finish-remove-backup`, () => recoverRemovalQuarantine(
          fs,
          backupPath,
          backupPath,
          row.old_sha256,
          'output-recovery-failed',
          'survey output recovery could not finish removing its backup generation',
          'delete',
        ));
      }
      if (fs.existsSync(tempPath)
        && sha256(readBytes(fs, operation, tempPath, `recovery:${row.final}:temp`))
          !== row.new_sha256) {
        throw new SurveyOutputError(
          'output-recovery-failed',
          'survey output recovery temp does not match its journal',
          3,
        );
      }
      if (fs.existsSync(backupPath)) {
        if (!row.had_existing
          || sha256(readBytes(fs, operation, backupPath, `recovery:${row.final}:backup`))
            !== row.old_sha256) {
          throw new SurveyOutputError(
            'output-recovery-failed',
            'survey output recovery backup does not match its journal',
            3,
          );
        }
        if (fs.existsSync(finalPath)) {
          const finalHash = sha256(readBytes(
            fs,
            operation,
            finalPath,
            `recovery:${row.final}:final`,
          ));
          if (finalHash === row.old_sha256 && sameFile(fs, finalPath, backupPath)) {
            call(operation, `recovery:${row.final}:finish-restore`, () => (
              removeOwnedHashedPathAction(
                fs,
                backupPath,
                row.old_sha256,
                'output-recovery-failed',
                'survey output recovery backup changed during cleanup',
              )
            ));
          } else if (finalHash !== row.new_sha256) {
            throw new SurveyOutputError(
              'output-recovery-failed',
              'survey output recovery final is not invocation-owned',
              3,
            );
          } else {
            call(operation, `recovery:${row.final}:remove-new`, () => removeOwnedFinalAction(
              fs,
              finalPath,
              tempPath,
              row.new_sha256,
              'output-recovery-failed',
              'survey output recovery final is not invocation-owned',
            ));
          }
        }
        if (fs.existsSync(backupPath)) {
          call(operation, `recovery:${row.final}:restore`, () => restoreBackupAction(
            fs,
            backupPath,
            finalPath,
            row.old_sha256,
            'output-recovery-failed',
            'survey output recovery could not restore the prior generation exclusively',
          ));
        }
      } else if (!row.had_existing && fs.existsSync(finalPath)) {
        if (sha256(readBytes(fs, operation, finalPath, `recovery:${row.final}:final`))
          !== row.new_sha256) {
          throw new SurveyOutputError(
            'output-recovery-failed',
            'survey output recovery final is not invocation-owned',
            3,
          );
        }
        call(operation, `recovery:${row.final}:remove-new`, () => removeOwnedFinalAction(
          fs,
          finalPath,
          tempPath,
          row.new_sha256,
          'output-recovery-failed',
          'survey output recovery final is not invocation-owned',
        ));
      } else if (row.had_existing && fs.existsSync(finalPath)
        && sha256(readBytes(fs, operation, finalPath, `recovery:${row.final}:old-final`))
          !== row.old_sha256) {
        throw new SurveyOutputError(
          'output-recovery-failed',
          'survey output recovery prior file does not match its journal',
          3,
        );
      } else if (row.had_existing && !fs.existsSync(finalPath)) {
        throw new SurveyOutputError(
          'output-recovery-failed',
          'survey output recovery cannot prove the prior file',
          3,
        );
      }
      if (fs.existsSync(tempPath)) {
        call(operation, `recovery:${row.final}:remove-temp`, () => removeOwnedHashedPathAction(
          fs,
          tempPath,
          row.new_sha256,
          'output-recovery-failed',
          'survey output recovery temp changed during cleanup',
        ));
      }
    }
    const envelopeFinal = join(reportDir, journal.envelope_final);
    const envelopeTemp = join(reportDir, journal.envelope_temp);
    const envelopeQuarantine = `${envelopeTemp}.remove`;
    if (fs.existsSync(quarantineDirectory(envelopeTemp, 'delete'))) {
      call(operation, 'recovery:envelope:finish-remove-temp', () => recoverRemovalQuarantine(
        fs,
        envelopeTemp,
        envelopeTemp,
        journal.envelope_sha256,
        'output-recovery-failed',
        'survey output recovery could not finish removing its envelope temp',
        'delete',
      ));
    }
    if (fs.existsSync(envelopeQuarantine)) {
      call(operation, 'recovery:envelope:remove-quarantine', () => (
        recoverLinkRemovalQuarantine(
          fs,
          envelopeFinal,
          envelopeTemp,
          envelopeQuarantine,
          'output-recovery-failed',
          'survey output recovery found an unowned envelope generation',
        )
      ));
    }
    if (fs.existsSync(envelopeFinal)) {
      if (!sameFile(fs, envelopeFinal, envelopeTemp)) {
        throw new SurveyOutputError(
          'output-recovery-failed',
          'survey output recovery found an unowned envelope generation',
          3,
        );
      }
      call(operation, 'recovery:envelope:remove-final', () => removeOwnedLinkAction(
        fs,
        envelopeFinal,
        envelopeTemp,
        envelopeQuarantine,
        'output-recovery-failed',
        'survey output recovery found an unowned envelope generation',
      ));
    }
    if (fs.existsSync(envelopeTemp)) {
      call(operation, 'recovery:envelope:remove-temp', () => removeOwnedHashedPathAction(
        fs,
        envelopeTemp,
        journal.envelope_sha256,
        'output-recovery-failed',
        'survey output recovery envelope temp changed during cleanup',
      ));
    }
  } else {
    for (const row of journal.mutable) {
      const tempPath = join(reportDir, row.temp);
      const backupPath = join(reportDir, row.backup);
      if (fs.existsSync(quarantineDirectory(tempPath, 'delete'))) {
        call(operation, `recovery:${row.final}:finish-remove-temp`, () => recoverRemovalQuarantine(
          fs,
          tempPath,
          tempPath,
          row.new_sha256,
          'output-recovery-failed',
          'survey output recovery could not finish removing its temp generation',
          'delete',
        ));
      }
      if (row.had_existing && fs.existsSync(quarantineDirectory(backupPath, 'delete'))) {
        call(operation, `recovery:${row.final}:finish-remove-backup`, () => recoverRemovalQuarantine(
          fs,
          backupPath,
          backupPath,
          row.old_sha256,
          'output-recovery-failed',
          'survey output recovery could not finish removing its backup generation',
          'delete',
        ));
      }
      if (fs.existsSync(tempPath)
        && sha256(readBytes(fs, operation, tempPath, `recovery:${row.final}:temp`))
          !== row.new_sha256) {
        throw new SurveyOutputError(
          'output-recovery-failed',
          'survey output committed temp does not match its journal',
          3,
        );
      }
      if (fs.existsSync(backupPath)
        && (!row.had_existing
          || sha256(readBytes(fs, operation, backupPath, `recovery:${row.final}:backup`))
            !== row.old_sha256)) {
        throw new SurveyOutputError(
          'output-recovery-failed',
          'survey output committed backup does not match its journal',
          3,
        );
      }
      if (fs.existsSync(tempPath)) {
        call(operation, `recovery:${row.final}:remove-temp`, () => removeOwnedHashedPathAction(
          fs,
          tempPath,
          row.new_sha256,
          'output-recovery-failed',
          'survey output committed temp changed during cleanup',
        ));
      }
      if (fs.existsSync(backupPath)) {
        call(operation, `recovery:${row.final}:remove-backup`, () => removeOwnedHashedPathAction(
          fs,
          backupPath,
          row.old_sha256,
          'output-recovery-failed',
          'survey output committed backup changed during cleanup',
        ));
      }
    }
    const envelopeFinal = join(reportDir, journal.envelope_final);
    const envelopeTemp = join(reportDir, journal.envelope_temp);
    if (fs.existsSync(quarantineDirectory(envelopeTemp, 'delete'))) {
      call(operation, 'recovery:envelope:finish-remove-temp', () => recoverRemovalQuarantine(
        fs,
        envelopeTemp,
        envelopeTemp,
        journal.envelope_sha256,
        'output-recovery-failed',
        'survey output recovery could not finish removing its envelope temp',
        'delete',
      ));
    }
    if (!fs.existsSync(envelopeFinal)
      || sha256(readBytes(fs, operation, envelopeFinal, 'recovery:envelope:final'))
        !== journal.envelope_sha256
      || (fs.existsSync(envelopeTemp) && !sameFile(fs, envelopeFinal, envelopeTemp))) {
      throw new SurveyOutputError(
        'output-recovery-failed',
        'survey output committed envelope does not match its journal',
        3,
      );
    }
    if (fs.existsSync(envelopeTemp)) {
      call(operation, 'recovery:envelope:remove-temp', () => removeOwnedHashedPathAction(
        fs,
        envelopeTemp,
        journal.envelope_sha256,
        'output-recovery-failed',
        'survey output committed envelope temp changed during cleanup',
      ));
    }
  }
  call(operation, 'recovery:journal:remove', () => removeOwnedHashedPathAction(
    fs,
    journalPath,
    journalHash,
    'output-recovery-failed',
    'survey output recovery journal changed during cleanup',
  ));
}

function recoverOutputDirectory(reportDir, fs, operation) {
  let names = call(operation, 'recovery:scan', () => fs.readdirSync(reportDir));
  for (const name of names.sort(compareLexically)) {
    const journalTempDeleteMatch = /^(\.appforge-survey-journal-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.tmp)\.delete$/u.exec(name);
    if (!journalTempDeleteMatch) continue;
    const journalTempPath = join(reportDir, journalTempDeleteMatch[1]);
    call(operation, 'recovery:journal-temp-delete:finish', () => (
      finishJournalTempDeletionQuarantine(
        fs,
        journalTempPath,
        text => {
          let value;
          try {
            value = validateJournal(JSON.parse(text), journalTempDeleteMatch[2]);
          } catch {
            return false;
          }
          return Boolean(value) && text === canonicalJson(value);
        },
        'output-recovery-failed',
        'survey output recovery journal temp changed during quarantined cleanup',
      )
    ));
  }
  for (const name of names.sort(compareLexically)) {
    const journalDeleteMatch = /^(\.appforge-survey-journal-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json)\.delete$/u.exec(name);
    if (!journalDeleteMatch) continue;
    const journalPath = join(reportDir, journalDeleteMatch[1]);
    call(operation, 'recovery:journal-delete:restore', () => (
      recoverJournalDeletionQuarantine(
        fs,
        journalPath,
        text => {
          let value;
          try {
            value = validateJournal(JSON.parse(text), journalDeleteMatch[2]);
          } catch {
            return false;
          }
          return Boolean(value) && text === canonicalJson(value);
        },
        'output-recovery-failed',
        'survey output recovery journal changed during quarantined cleanup',
      )
    ));
  }
  names = call(operation, 'recovery:rescan', () => fs.readdirSync(reportDir));
  for (const name of names.sort(compareLexically)) {
    const journalMatch = /^\.appforge-survey-journal-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/u.exec(name);
    if (journalMatch) {
      recoverJournal(reportDir, name, journalMatch[1], fs, operation);
    } else if (/^\.appforge-survey-journal-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/u.test(name)) {
      const journalTempPath = join(reportDir, name);
      const journalTempStat = fs.statSync(journalTempPath);
      call(operation, 'recovery:journal-temp:remove', () => removeOwnedIdentityPathAction(
        fs,
        journalTempPath,
        { dev: journalTempStat.dev, ino: journalTempStat.ino },
        'output-recovery-failed',
        'survey output recovery journal temp changed during cleanup',
      ));
    }
  }
}

function rollbackPlan(reportDir, journal, journalPath, journalOwned, ownedPaths, fs, operation) {
  const failures = [];
  const attempt = (name, action) => {
    try {
      call(operation, name, action);
    } catch (error) {
      failures.push(error);
    }
  };
  const removeOwnedFinal = (name, finalPath, quarantinePath, expectedHash) => {
    attempt(name, () => removeOwnedFinalAction(
      fs,
      finalPath,
      quarantinePath,
      expectedHash,
      'output-rollback-failed',
      'survey output rollback found an unowned final generation',
    ));
  };
  const journalTempPath = `${journalPath.slice(0, -'.json'.length)}.tmp`;
  if (journalOwned && fs.existsSync(quarantineDirectory(journalTempPath, 'delete'))) {
    attempt('rollback:journal-temp:finish-remove', () => recoverLinkRemovalQuarantine(
      fs,
      journalTempPath,
      journalPath,
      quarantineDirectory(journalTempPath, 'delete'),
      'output-rollback-failed',
      'survey output rollback journal temp changed during cleanup',
    ));
  }
  for (const row of [...journal.mutable].reverse()) {
    const finalPath = join(reportDir, row.final);
    const tempPath = join(reportDir, row.temp);
    const backupPath = join(reportDir, row.backup);
    if (fs.existsSync(quarantineDirectory(tempPath, 'delete'))) {
      attempt(`rollback:${row.final}:finish-remove-temp`, () => recoverRemovalQuarantine(
        fs,
        tempPath,
        tempPath,
        row.new_sha256,
        'output-rollback-failed',
        'survey output rollback temp changed during cleanup',
        'delete',
      ));
    }
    if (!row.had_existing) continue;
    if (fs.existsSync(quarantineDirectory(backupPath, 'capture'))) {
      attempt(`rollback:${row.final}:finish-backup-capture`, () => (
        recoverBackupCaptureQuarantine(
          fs,
          finalPath,
          backupPath,
          row.old_sha256,
          'output-rollback-failed',
          'survey output rollback could not finish capturing the prior generation',
        )
      ));
    }
  }
  if (failures.length > 0) {
    throw new SurveyOutputError(
      'output-rollback-failed',
      'survey output failed and automatic rollback was incomplete; rerun to recover journaled files',
      3,
    );
  }
  for (const row of [...journal.mutable].reverse()) {
    const finalPath = join(reportDir, row.final);
    const tempPath = join(reportDir, row.temp);
    const backupPath = join(reportDir, row.backup);
    const wouldRemovePublishedFinal = fs.existsSync(finalPath)
      && (fs.existsSync(backupPath)
        || (!row.had_existing
          && ownedPaths.has(tempPath)
          && (!fs.existsSync(tempPath) || sameFile(fs, finalPath, tempPath))));
    if (!wouldRemovePublishedFinal) continue;
    try {
      const finalHash = sha256(readBytes(
        fs,
        operation,
        finalPath,
        `rollback:${row.final}:verify-owned`,
      ));
      if (finalHash !== row.new_sha256) {
        failures.push(new SurveyOutputError(
          'output-rollback-failed',
          'survey output rollback found an unowned final generation',
          3,
        ));
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new SurveyOutputError(
      'output-rollback-failed',
      'survey output failed and automatic rollback was incomplete; rerun to recover journaled files',
      3,
    );
  }
  for (const row of [...journal.mutable].reverse()) {
    const finalPath = join(reportDir, row.final);
    const tempPath = join(reportDir, row.temp);
    const backupPath = join(reportDir, row.backup);
    if (fs.existsSync(backupPath)) {
      if (fs.existsSync(finalPath)) {
        removeOwnedFinal(
          `rollback:${row.final}:remove-new`,
          finalPath,
          tempPath,
          row.new_sha256,
        );
      }
      if (failures.length > 0) {
        break;
      }
      attempt(`rollback:${row.final}:restore`, () => restoreBackupAction(
        fs,
        backupPath,
        finalPath,
        row.old_sha256,
        'output-rollback-failed',
        'survey output rollback could not restore the prior generation exclusively',
      ));
    } else if (!row.had_existing
      && ownedPaths.has(tempPath)
      && fs.existsSync(finalPath)
      && (!fs.existsSync(tempPath) || sameFile(fs, finalPath, tempPath))) {
      removeOwnedFinal(
        `rollback:${row.final}:remove-new`,
        finalPath,
        tempPath,
        row.new_sha256,
      );
    }
    if (failures.length > 0) {
      break;
    }
    if (ownedPaths.has(tempPath) && fs.existsSync(tempPath)) {
      attempt(`rollback:${row.final}:remove-temp`, () => removeOwnedIdentityPathAction(
        fs,
        tempPath,
        ownedPaths.get(tempPath),
        'output-rollback-failed',
        'survey output rollback temp changed during cleanup',
      ));
    }
    if (failures.length > 0) {
      break;
    }
  }
  if (failures.length > 0) {
    throw new SurveyOutputError(
      'output-rollback-failed',
      'survey output failed and automatic rollback was incomplete; rerun to recover journaled files',
      3,
    );
  }
  const envelopeFinal = join(reportDir, journal.envelope_final);
  const envelopeTemp = join(reportDir, journal.envelope_temp);
  const envelopeQuarantine = `${envelopeTemp}.remove`;
  let envelopeFinalRemovalFailed = false;
  if (ownedPaths.has(envelopeTemp) && sameFile(fs, envelopeFinal, envelopeTemp)) {
    const failuresBefore = failures.length;
    attempt('rollback:envelope:remove-final', () => removeOwnedLinkAction(
      fs,
      envelopeFinal,
      envelopeTemp,
      envelopeQuarantine,
      'output-rollback-failed',
      'survey output rollback found an unowned envelope generation',
    ));
    envelopeFinalRemovalFailed = failures.length > failuresBefore;
  }
  if (!envelopeFinalRemovalFailed
    && ownedPaths.has(envelopeTemp)
    && fs.existsSync(envelopeTemp)) {
    attempt('rollback:envelope:remove-temp', () => removeOwnedIdentityPathAction(
      fs,
      envelopeTemp,
      ownedPaths.get(envelopeTemp),
      'output-rollback-failed',
      'survey output rollback envelope temp changed during cleanup',
    ));
  }
  if (failures.length === 0 && journalOwned && fs.existsSync(journalPath)) {
    attempt('rollback:journal:remove', () => removeOwnedIdentityPathAction(
      fs,
      journalPath,
      ownedPaths.get(journalPath),
      'output-rollback-failed',
      'survey output rollback journal changed during cleanup',
    ));
  }
  if (failures.length > 0) {
    throw new SurveyOutputError(
      'output-rollback-failed',
      'survey output failed and automatic rollback was incomplete; rerun to recover journaled files',
      3,
    );
  }
}

function validateArtifactBytes(input, bytes, expected) {
  for (const key of ['report', 'markdown', 'envelope', 'baseline']) {
    if (expected[key] === null ? bytes[key] !== null : !asBuffer(bytes[key]).equals(expected[key])) {
      throw new SurveyOutputError(
        'output-validation-failed',
        `${key} bytes do not match the canonical artifact`,
        3,
      );
    }
  }
  const reportText = decodeUtf8(bytes.report, 'analysis report');
  const markdownText = decodeUtf8(bytes.markdown, 'technical report');
  const parsedReport = JSON.parse(reportText);
  input.core.assertValidReport(parsedReport);
  input.core.assertEmittableReport(parsedReport, {
    surface: 'cli',
    envelope: input.envelope,
  });
  if (markdownText !== decodeUtf8(expected.markdown, 'canonical technical report')) {
    throw new SurveyOutputError('output-validation-failed', 'staged technical report mismatch', 3);
  }
  const parsedEnvelope = input.core.decodeCanonicalEnvelope(
    bytes.envelope,
    input.catalogAllowlist,
  );
  if (parsedEnvelope.id !== input.envelope.id || parsedReport.envelope.id !== parsedEnvelope.id) {
    throw new SurveyOutputError('output-validation-failed', 'staged envelope identity mismatch', 3);
  }
  if (bytes.baseline !== null) {
    const parsedBaseline = JSON.parse(decodeUtf8(bytes.baseline, 'analysis baseline'));
    input.core.assertEmittableBaseline(parsedBaseline);
  }
}

export function writeSurveyArtifacts(input, overrides = {}) {
  const fs = overrides.fs ?? nativeFs;
  const operation = overrides.onOperation ?? (() => {});
  const invocationId = (overrides.invocationId ?? randomUUID)();
  const reportDir = resolveSurveyReportDirectory({
    target: input.target,
    reportValue: input.reportDir,
    cwd: overrides.cwd ?? process.cwd(),
    fs,
  });
  const reportPath = join(reportDir, 'analysis-report.json');
  const markdownPath = join(reportDir, 'report-technical.md');
  const envelopePath = join(reportDir, `envelope-${input.envelope.id}.json`);
  const baselinePath = input.baseline === undefined
    ? null
    : join(reportDir, 'analysis-baseline.json');

  if (input.report.envelope.path !== envelopePath) {
    throw new SurveyOutputError(
      'output-validation-failed',
      'report envelope path does not match the output directory',
      3,
    );
  }
  input.core.assertValidEnvelope(input.envelope, input.catalogAllowlist);
  input.core.assertValidReport(input.report);
  input.core.assertEmittableReport(input.report, { surface: 'cli', envelope: input.envelope });
  if (input.baseline !== undefined) input.core.assertEmittableBaseline(input.baseline);

  const bytes = {
    report: Buffer.from(canonicalJson(input.report), 'utf8'),
    markdown: Buffer.from(input.core.renderTechnical(input.report), 'utf8'),
    envelope: Buffer.from(
      input.core.serializeEnvelope(input.envelope, input.catalogAllowlist),
      'utf8',
    ),
    baseline: input.baseline === undefined
      ? null
      : Buffer.from(canonicalJson(input.baseline), 'utf8'),
  };
  validateArtifactBytes(input, bytes, bytes);

  let identity;
  try {
    call(operation, 'output:mkdir', () => fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 }));
    rejectReparseTraversal(reportDir, fs);
    const actualReportDir = fs.realpathSync.native(reportDir);
    const samePath = process.platform === 'win32'
      ? actualReportDir.toLowerCase() === reportDir.toLowerCase()
      : actualReportDir === reportDir;
    if (!samePath) {
      throw new SurveyOutputError('unsafe-output-path', 'survey output path changed during creation', 3);
    }
    identity = directoryIdentity(reportDir, fs);
  } catch (error) {
    if (error instanceof SurveyOutputError) throw error;
    throw new SurveyOutputError('output-write-failed', 'unable to prepare survey output directory', 3);
  }

  const previousDirectory = process.cwd();
  try {
    process.chdir(reportDir);
    assertBoundDirectory(reportDir, identity, fs);
  } catch (error) {
    process.chdir(previousDirectory);
    if (error instanceof SurveyOutputError) throw error;
    throw new SurveyOutputError(
      'unsafe-output-path',
      'unable to enter the bound survey output directory',
      3,
    );
  }
  const boundDirectory = '.';
  const boundReportPath = join(boundDirectory, 'analysis-report.json');
  const boundMarkdownPath = join(boundDirectory, 'report-technical.md');
  const boundEnvelopePath = join(boundDirectory, `envelope-${input.envelope.id}.json`);
  const boundBaselinePath = baselinePath === null
    ? null
    : join(boundDirectory, 'analysis-baseline.json');
  const guardedOperation = name => {
    operation(name);
    assertBoundDirectory(reportDir, identity, fs);
    return () => assertBoundDirectory(reportDir, identity, fs);
  };
  let outputLock;
  try {
    outputLock = acquireOutputLock(boundDirectory, invocationId, fs, guardedOperation);
    recoverOutputDirectory(boundDirectory, fs, guardedOperation);
    recoverReportUpdates(boundDirectory, fs, guardedOperation);
  } catch (error) {
    try {
      releaseOutputLock(outputLock, fs, guardedOperation);
    } catch {
      // The invocation did not begin publication; a stale lock fails closed.
    }
    process.chdir(previousDirectory);
    if (error instanceof SurveyOutputError) throw error;
    throw new SurveyOutputError('output-write-failed', 'unable to lock survey output', 3);
  }

  let committed = false;
  try {
  const prefix = `.appforge-survey-${invocationId}`;
  const envelopeTempName = `${prefix}-envelope.tmp`;
  const mutable = [
    { final: 'report-technical.md', bytes: bytes.markdown },
    ...(bytes.baseline === null ? [] : [{ final: 'analysis-baseline.json', bytes: bytes.baseline }]),
    { final: 'analysis-report.json', bytes: bytes.report },
  ].map(row => {
    const finalPath = join(boundDirectory, row.final);
    const hadExisting = fs.existsSync(finalPath);
    return {
      ...row,
      temp: `${prefix}-${row.final}.tmp`,
      backup: `${prefix}-${row.final}.bak`,
      had_existing: hadExisting,
      old_sha256: hadExisting
        ? sha256(readBytes(fs, guardedOperation, finalPath, `${row.final}:prior`))
        : null,
      new_sha256: sha256(row.bytes),
    };
  });
  const journalName = `.appforge-survey-journal-${invocationId}.json`;
  const journalTempName = `.appforge-survey-journal-${invocationId}.tmp`;
  const journalPath = join(boundDirectory, journalName);
  const journalTempPath = join(boundDirectory, journalTempName);
  const journal = {
    journal_schema: 'survey-output-journal/1',
    report_final: 'analysis-report.json',
    report_temp: mutable.find(row => row.final === 'analysis-report.json').temp,
    report_sha256: sha256(bytes.report),
    envelope_final: `envelope-${input.envelope.id}.json`,
    envelope_temp: envelopeTempName,
    envelope_sha256: sha256(bytes.envelope),
    mutable: mutable.map(({
      final, temp, backup, had_existing, old_sha256, new_sha256,
    }) => ({
      final, temp, backup, had_existing, old_sha256, new_sha256,
    })),
  };

  const ownedPaths = new Map();
  let journalOwned = false;
  let publishedBytes = bytes;
  try {
    stageFile(
      fs,
      guardedOperation,
      journalTempPath,
      Buffer.from(canonicalJson(journal), 'utf8'),
      'journal',
      identity => ownedPaths.set(journalTempPath, identity),
    );
    call(guardedOperation, 'journal:link', () => publishTempExclusiveAction(
      fs,
      journalTempPath,
      journalPath,
      sha256(Buffer.from(canonicalJson(journal), 'utf8')),
      ownedPaths.get(journalTempPath),
      false,
      'output-write-failed',
      'survey output could not publish its journal exclusively',
    ));
    journalOwned = true;
    const journalStat = fs.statSync(journalPath);
    ownedPaths.set(journalPath, { dev: journalStat.dev, ino: journalStat.ino });
    call(guardedOperation, 'journal:unlink-temp', () => removeOwnedIdentityPathAction(
      fs,
      journalTempPath,
      ownedPaths.get(journalTempPath),
      'output-write-failed',
      'survey output journal temp changed during publication',
    ));

    stageFile(
      fs,
      guardedOperation,
      join(boundDirectory, envelopeTempName),
      bytes.envelope,
      'envelope',
      identity => ownedPaths.set(join(boundDirectory, envelopeTempName), identity),
    );
    for (const row of mutable) {
      const tempPath = join(boundDirectory, row.temp);
      stageFile(
        fs,
        guardedOperation,
        tempPath,
        row.bytes,
        row.final,
        identity => ownedPaths.set(tempPath, identity),
      );
    }

    const reread = {
      report: readBytes(
        fs,
        guardedOperation,
        join(boundDirectory, journal.report_temp),
        'analysis-report.json:verify',
      ),
      markdown: readBytes(
        fs,
        guardedOperation,
        join(boundDirectory, mutable.find(row => row.final === 'report-technical.md').temp),
        'report-technical.md:verify',
      ),
      envelope: readBytes(
        fs,
        guardedOperation,
        join(boundDirectory, envelopeTempName),
        'envelope:verify',
      ),
      baseline: baselinePath === null
        ? null
        : readBytes(
          fs,
          guardedOperation,
          join(boundDirectory, mutable.find(row => row.final === 'analysis-baseline.json').temp),
          'analysis-baseline.json:verify',
        ),
    };
    validateArtifactBytes(input, reread, bytes);

    const envelopeTempPath = join(boundDirectory, envelopeTempName);
    call(guardedOperation, 'envelope:link', () => publishTempExclusiveAction(
      fs,
      envelopeTempPath,
      boundEnvelopePath,
      journal.envelope_sha256,
      ownedPaths.get(envelopeTempPath),
      false,
      'output-write-failed',
      'survey output could not publish its envelope exclusively',
    ));
    for (const row of mutable) {
      const finalPath = join(boundDirectory, row.final);
      const backupPath = join(boundDirectory, row.backup);
      if (row.had_existing) {
        call(guardedOperation, `${row.final}:backup-rename`, () => captureBackupAction(
          fs,
          finalPath,
          backupPath,
          row.old_sha256,
          'output-write-failed',
          'survey output could not capture the prior generation exclusively',
        ));
      }
      call(guardedOperation, `${row.final}:publish-rename`, () => publishTempExclusiveAction(
        fs,
        join(boundDirectory, row.temp),
        finalPath,
        row.new_sha256,
        ownedPaths.get(join(boundDirectory, row.temp)),
        true,
        'output-write-failed',
        'survey output could not publish the new generation exclusively',
      ));
    }
    const finalBytes = {
      report: readBytes(fs, guardedOperation, boundReportPath, 'analysis-report.json:final-verify'),
      markdown: readBytes(fs, guardedOperation, boundMarkdownPath, 'report-technical.md:final-verify'),
      envelope: readBytes(fs, guardedOperation, boundEnvelopePath, 'envelope:final-verify'),
      baseline: baselinePath === null
        ? null
        : readBytes(fs, guardedOperation, boundBaselinePath, 'analysis-baseline.json:final-verify'),
    };
    validateArtifactBytes(input, finalBytes, bytes);
    publishedBytes = finalBytes;
    committed = true;
  } catch (error) {
    try {
      rollbackPlan(
        boundDirectory,
        journal,
        journalPath,
        journalOwned,
        ownedPaths,
        fs,
        guardedOperation,
      );
      if (ownedPaths.has(journalTempPath)) {
        if (fs.existsSync(journalTempPath)) {
          call(guardedOperation, 'rollback:journal-temp:remove', () => (
            removeOwnedIdentityPathAction(
              fs,
              journalTempPath,
              ownedPaths.get(journalTempPath),
              'output-rollback-failed',
              'survey output rollback journal temp changed during cleanup',
            )
          ));
        }
      }
    } catch (rollbackError) {
      if (rollbackError instanceof SurveyOutputError) throw rollbackError;
      throw new SurveyOutputError(
        'output-rollback-failed',
        'survey output failed and automatic rollback was incomplete; rerun to recover journaled files',
        3,
      );
    }
    if (error instanceof SurveyOutputError) throw error;
    throw new SurveyOutputError('output-write-failed', 'unable to write survey artifacts', 3);
  }

  if (committed) {
    // The exclusive report publication is the commit marker. Cleanup is recoverable and must
    // not turn a fully committed file set into a false failure.
    try {
      const envelopeTempPath = join(boundDirectory, envelopeTempName);
      if (fs.existsSync(envelopeTempPath)) {
        call(guardedOperation, 'commit:envelope-temp:remove', () => removeOwnedIdentityPathAction(
          fs,
          envelopeTempPath,
          ownedPaths.get(envelopeTempPath),
          'output-cleanup-failed',
          'survey output envelope temp changed during cleanup',
        ));
      }
      for (const row of mutable) {
        const backupPath = join(boundDirectory, row.backup);
        if (fs.existsSync(backupPath)) {
          call(guardedOperation, `commit:${row.final}:remove-backup`, () => (
            removeOwnedHashedPathAction(
              fs,
              backupPath,
              row.old_sha256,
              'output-cleanup-failed',
              'survey output backup changed during cleanup',
            )
          ));
        }
      }
      if (journalOwned) {
        call(guardedOperation, 'commit:journal:remove', () => removeOwnedIdentityPathAction(
          fs,
          journalPath,
          ownedPaths.get(journalPath),
          'output-cleanup-failed',
          'survey output journal changed during cleanup',
        ));
      }
    } catch {
      // A later invocation recognizes the committed report hash in the
      // immutable journal and removes only the named auxiliary files.
    }
  }

  return {
    reportDir,
    reportPath,
    markdownPath,
    envelopePath,
    baselinePath,
    reportBytes: decodeUtf8(publishedBytes.report, 'analysis report'),
    markdownBytes: decodeUtf8(publishedBytes.markdown, 'technical report'),
  };
  } catch (error) {
    if (error instanceof SurveyOutputError) throw error;
    throw new SurveyOutputError('output-write-failed', 'unable to write survey artifacts', 3);
  } finally {
    try {
      releaseOutputLock(outputLock, fs, guardedOperation);
    } catch (error) {
      if (!committed) throw error;
      // A committed report remains authoritative; a dead-owner lock is reclaimed next invocation.
    } finally {
      process.chdir(previousDirectory);
    }
  }
}

function reportUpdateJournal(value, invocationId) {
  const prefix = `.appforge-submit-${invocationId}`;
  if (!value || typeof value !== 'object'
    || value.journal_schema !== 'survey-report-update-journal/1'
    || Object.keys(value).sort().join(',')
      !== 'journal_schema,new_sha256,old_sha256,report_backup,report_final,report_temp'
    || value.report_final !== 'analysis-report.json'
    || value.report_temp !== `${prefix}-analysis-report.json.tmp`
    || value.report_backup !== `${prefix}-analysis-report.json.bak`
    || typeof value.old_sha256 !== 'string'
    || typeof value.new_sha256 !== 'string'
    || !/^[0-9a-f]{64}$/u.test(value.old_sha256)
    || !/^[0-9a-f]{64}$/u.test(value.new_sha256)) return null;
  return value;
}

function recoverReportUpdates(reportDir, fs, operation) {
  let names = call(operation, 'report-update:recovery:scan', () => fs.readdirSync(reportDir));
  for (const name of names.sort(compareLexically)) {
    const journalTempDeleteMatch = /^(\.appforge-submit-journal-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.tmp)\.delete$/u.exec(name);
    if (!journalTempDeleteMatch) continue;
    const journalTempPath = join(reportDir, journalTempDeleteMatch[1]);
    call(operation, 'report-update:recovery:journal-temp-delete:finish', () => (
      finishJournalTempDeletionQuarantine(
        fs,
        journalTempPath,
        text => {
          let value;
          try {
            value = reportUpdateJournal(JSON.parse(text), journalTempDeleteMatch[2]);
          } catch {
            return false;
          }
          return Boolean(value) && text === canonicalJson(value);
        },
        'report-update-recovery-failed',
        'analysis report update journal temp changed during quarantined cleanup',
      )
    ));
  }
  for (const name of names.sort(compareLexically)) {
    const journalDeleteMatch = /^(\.appforge-submit-journal-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json)\.delete$/u.exec(name);
    if (!journalDeleteMatch) continue;
    const journalPath = join(reportDir, journalDeleteMatch[1]);
    call(operation, 'report-update:recovery:journal-delete:restore', () => (
      recoverJournalDeletionQuarantine(
        fs,
        journalPath,
        text => {
          let value;
          try {
            value = reportUpdateJournal(JSON.parse(text), journalDeleteMatch[2]);
          } catch {
            return false;
          }
          return Boolean(value) && text === canonicalJson(value);
        },
        'report-update-recovery-failed',
        'analysis report update journal changed during quarantined cleanup',
      )
    ));
  }
  names = call(operation, 'report-update:recovery:rescan', () => fs.readdirSync(reportDir));
  for (const name of names.sort(compareLexically)) {
    if (/^\.appforge-submit-journal-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/u.test(name)) {
      const journalTempPath = join(reportDir, name);
      const journalTempStat = fs.statSync(journalTempPath);
      call(operation, 'report-update:recovery:remove-journal-temp', () => removeOwnedIdentityPathAction(
        fs,
        journalTempPath,
        { dev: journalTempStat.dev, ino: journalTempStat.ino },
        'report-update-recovery-failed',
        'analysis report update journal temp changed during cleanup',
      ));
      continue;
    }
    const match = /^\.appforge-submit-journal-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.json$/u.exec(name);
    if (!match) continue;
    const journalPath = join(reportDir, name);
    let journal;
    let journalHash;
    try {
      const journalText = readUtf8(
        fs,
        operation,
        journalPath,
        'report-update:recovery:journal',
      );
      journalHash = sha256(Buffer.from(journalText, 'utf8'));
      journal = reportUpdateJournal(JSON.parse(journalText), match[1]);
      if (journal && journalText !== canonicalJson(journal)) journal = null;
    } catch {
      journal = null;
    }
    if (!journal) {
      throw new SurveyOutputError(
        'report-update-recovery-failed',
        'analysis report contains an invalid update recovery journal',
        3,
      );
    }
    const journalTempPath = join(
      reportDir,
      `.appforge-submit-journal-${match[1]}.tmp`,
    );
    if (fs.existsSync(quarantineDirectory(journalTempPath, 'delete'))) {
      call(operation, 'report-update:recovery:finish-remove-journal-temp', () => (
        recoverLinkRemovalQuarantine(
          fs,
          journalTempPath,
          journalPath,
          quarantineDirectory(journalTempPath, 'delete'),
          'report-update-recovery-failed',
          'analysis report update journal temp changed during cleanup',
        )
      ));
    }
    const reportPath = join(reportDir, journal.report_final);
    const tempPath = join(reportDir, journal.report_temp);
    const backupPath = join(reportDir, journal.report_backup);
    if (fs.existsSync(quarantineDirectory(backupPath, 'capture'))) {
      call(operation, 'report-update:recovery:finish-backup-capture', () => (
        recoverBackupCaptureQuarantine(
          fs,
          reportPath,
          backupPath,
          journal.old_sha256,
          'report-update-recovery-failed',
          'analysis report update could not finish capturing the prior generation',
        )
      ));
    }
    if (fs.existsSync(quarantineDirectory(backupPath, 'restore'))) {
      call(operation, 'report-update:recovery:finish-restore', () => recoverRestoreQuarantine(
        fs,
        backupPath,
        reportPath,
        journal.old_sha256,
        'report-update-recovery-failed',
        'analysis report update could not finish restoring the prior generation',
      ));
    }
    if (fs.existsSync(quarantineDirectory(tempPath))) {
      call(operation, 'report-update:recovery:finish-remove-new', () => recoverRemovalQuarantine(
        fs,
        reportPath,
        tempPath,
        journal.new_sha256,
        'report-update-recovery-failed',
        'analysis report update could not finish removing its published generation',
      ));
    }
    if (fs.existsSync(quarantineDirectory(tempPath, 'delete'))) {
      call(operation, 'report-update:recovery:finish-remove-temp', () => recoverRemovalQuarantine(
        fs,
        tempPath,
        tempPath,
        journal.new_sha256,
        'report-update-recovery-failed',
        'analysis report update could not finish removing its temp generation',
        'delete',
      ));
    }
    if (fs.existsSync(quarantineDirectory(backupPath, 'delete'))) {
      call(operation, 'report-update:recovery:finish-remove-backup', () => recoverRemovalQuarantine(
        fs,
        backupPath,
        backupPath,
        journal.old_sha256,
        'report-update-recovery-failed',
        'analysis report update could not finish removing its backup generation',
        'delete',
      ));
    }
    if (fs.existsSync(tempPath)) {
      const tempHash = sha256(readBytes(
        fs,
        operation,
        tempPath,
        'report-update:recovery:temp',
      ));
      if (tempHash !== journal.new_sha256) {
        throw new SurveyOutputError(
          'report-update-recovery-failed',
          'analysis report update temp does not match its journal',
          3,
        );
      }
    }
    let currentHash = null;
    if (fs.existsSync(reportPath)) {
      try {
        currentHash = sha256(readBytes(
          fs,
          operation,
          reportPath,
          'report-update:recovery:report',
        ));
      } catch {
        throw new SurveyOutputError(
          'report-update-recovery-failed',
          'analysis report update commit marker is temporarily unreadable',
          3,
        );
      }
    }
    if (currentHash === journal.new_sha256) {
      if (fs.existsSync(tempPath)) {
        call(operation, 'report-update:recovery:remove-temp', () => removeOwnedHashedPathAction(
          fs,
          tempPath,
          journal.new_sha256,
          'report-update-recovery-failed',
          'analysis report update temp changed during cleanup',
        ));
      }
      if (fs.existsSync(backupPath)) {
        call(operation, 'report-update:recovery:remove-backup', () => removeOwnedHashedPathAction(
          fs,
          backupPath,
          journal.old_sha256,
          'report-update-recovery-failed',
          'analysis report update backup changed during cleanup',
        ));
      }
      call(operation, 'report-update:recovery:remove-journal', () => removeOwnedHashedPathAction(
        fs,
        journalPath,
        journalHash,
        'report-update-recovery-failed',
        'analysis report update journal changed during cleanup',
      ));
      continue;
    }
    if (fs.existsSync(backupPath)) {
      const backupHash = sha256(readBytes(
        fs,
        operation,
        backupPath,
        'report-update:recovery:backup',
      ));
      if (backupHash !== journal.old_sha256) {
        throw new SurveyOutputError(
          'report-update-recovery-failed',
          'analysis report update backup does not match its journal',
          3,
        );
      }
      if (currentHash !== null && currentHash !== journal.old_sha256) {
        throw new SurveyOutputError(
          'report-update-recovery-failed',
          'analysis report update found an unowned report generation',
          3,
        );
      }
      if (currentHash === null) {
        call(operation, 'report-update:recovery:restore', () => restoreBackupAction(
          fs,
          backupPath,
          reportPath,
          journal.old_sha256,
          'report-update-recovery-failed',
          'analysis report update could not restore the prior generation exclusively',
        ));
      } else {
        call(operation, 'report-update:recovery:remove-backup', () => removeOwnedHashedPathAction(
          fs,
          backupPath,
          journal.old_sha256,
          'report-update-recovery-failed',
          'analysis report update backup changed during cleanup',
        ));
      }
    } else if (currentHash !== journal.old_sha256) {
      throw new SurveyOutputError(
        'report-update-recovery-failed',
        'analysis report update cannot be recovered safely',
        3,
      );
    }
    if (fs.existsSync(tempPath)) {
      call(operation, 'report-update:recovery:remove-temp', () => removeOwnedHashedPathAction(
        fs,
        tempPath,
        journal.new_sha256,
        'report-update-recovery-failed',
        'analysis report update temp changed during cleanup',
      ));
    }
    call(operation, 'report-update:recovery:remove-journal', () => removeOwnedHashedPathAction(
      fs,
      journalPath,
      journalHash,
      'report-update-recovery-failed',
      'analysis report update journal changed during cleanup',
    ));
  }
}

function legalSubmissionTransition(from, to) {
  if (from === 'not_requested') return ['pending', 'acknowledged', 'failed'].includes(to);
  if (from === 'pending') return to === 'acknowledged' || to === 'failed';
  if (from === 'failed') return ['pending', 'acknowledged', 'failed'].includes(to);
  return false;
}

function validTransitionShape(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const expected = {
    not_requested: ['state'],
    pending: ['state'],
    acknowledged: ['attempted_at', 'state'],
    failed: ['attempted_at', 'error_code', 'state'],
  }[value.state];
  if (!expected) return false;
  const actual = Object.keys(value).sort(compareLexically);
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

export function replaceSubmissionReport(input, overrides = {}) {
  const fs = overrides.fs ?? nativeFs;
  const operation = overrides.onOperation ?? (() => {});
  const invocationId = (overrides.invocationId ?? randomUUID)();
  const reportPath = canonicalProspectivePath(input.reportPath, fs);
  rejectReparseTraversal(reportPath, fs);
  if (parse(reportPath).base !== 'analysis-report.json') {
    throw new SurveyOutputError(
      'report-update-refused',
      'submission state can update only analysis-report.json',
      3,
    );
  }
  const reportDir = dirname(reportPath);
  const identity = directoryIdentity(reportDir, fs);
  const previousDirectory = process.cwd();
  try {
    process.chdir(reportDir);
    assertBoundDirectory(reportDir, identity, fs);
  } catch (error) {
    process.chdir(previousDirectory);
    if (error instanceof SurveyOutputError) throw error;
    throw new SurveyOutputError(
      'unsafe-output-path',
      'unable to enter the bound survey output directory',
      3,
    );
  }
  const boundDirectory = '.';
  const boundReportPath = join(boundDirectory, 'analysis-report.json');
  const guardedOperation = name => {
    operation(name);
    assertBoundDirectory(reportDir, identity, fs);
    return () => assertBoundDirectory(reportDir, identity, fs);
  };
  let outputLock;
  let committed = false;
  try {
  outputLock = acquireOutputLock(boundDirectory, invocationId, fs, guardedOperation);
  recoverOutputDirectory(boundDirectory, fs, guardedOperation);
  recoverReportUpdates(boundDirectory, fs, guardedOperation);
  const oldBytes = readBytes(fs, guardedOperation, boundReportPath, 'report-update:current');
  const oldText = decodeUtf8(oldBytes, 'current analysis report');
  let current;
  try {
    current = JSON.parse(oldText);
    input.core.assertValidReport(current);
    input.core.assertEmittableReport(current, {
      surface: 'cli',
      envelope: input.expectedEnvelope,
    });
  } catch {
    throw new SurveyOutputError(
      'report-update-refused',
      'current analysis report is not a valid match for the envelope',
      3,
    );
  }
  const expectedEnvelopePath = join(
    reportDir,
    `envelope-${input.expectedEnvelope.id}.json`,
  );
  if (current.envelope.id !== input.expectedEnvelope.id
    || typeof current.envelope.path !== 'string'
    || pathKey(resolve(current.envelope.path)) !== pathKey(resolve(expectedEnvelopePath))
    || !validTransitionShape(input.transition)) {
    throw new SurveyOutputError(
      'report-update-refused',
      'analysis report submission transition or envelope identity is invalid',
      3,
    );
  }
  const next = structuredClone(current);
  next.envelope.submission = structuredClone(input.transition);
  try {
    input.core.assertValidReport(next);
    input.core.assertEmittableReport(next, {
      surface: 'cli',
      envelope: input.expectedEnvelope,
    });
  } catch {
    throw new SurveyOutputError(
      'report-update-refused',
      'analysis report submission transition or envelope identity is invalid',
      3,
    );
  }
  if (current.envelope.submission.state === 'acknowledged'
    && (input.transition.state === 'acknowledged'
      || (input.transition.state === 'failed' && input.acceptAcknowledgedAsTerminal === true))) {
    committed = true;
    return {
      report: current,
      reportPath,
      reportBytes: oldText,
    };
  }
  if (!legalSubmissionTransition(current.envelope.submission.state, input.transition.state)) {
    throw new SurveyOutputError(
      'report-update-refused',
      'analysis report submission transition or envelope identity is invalid',
      3,
    );
  }
  const newBytes = Buffer.from(canonicalJson(next), 'utf8');

  const prefix = `.appforge-submit-${invocationId}`;
  const tempName = `${prefix}-analysis-report.json.tmp`;
  const backupName = `${prefix}-analysis-report.json.bak`;
  const journalName = `.appforge-submit-journal-${invocationId}.json`;
  const journalTempName = `.appforge-submit-journal-${invocationId}.tmp`;
  const tempPath = join(boundDirectory, tempName);
  const backupPath = join(boundDirectory, backupName);
  const journalPath = join(boundDirectory, journalName);
  const journalTempPath = join(boundDirectory, journalTempName);
  const journal = {
    journal_schema: 'survey-report-update-journal/1',
    report_final: 'analysis-report.json',
    report_temp: tempName,
    report_backup: backupName,
    old_sha256: sha256(oldBytes),
    new_sha256: sha256(newBytes),
  };
  const owned = new Map();
  let journalOwned = false;
  try {
    stageFile(
      fs,
      guardedOperation,
      journalTempPath,
      Buffer.from(canonicalJson(journal), 'utf8'),
      'report-update:journal',
      identity => owned.set(journalTempPath, identity),
    );
    call(guardedOperation, 'report-update:journal:link', () => publishTempExclusiveAction(
      fs,
      journalTempPath,
      journalPath,
      sha256(Buffer.from(canonicalJson(journal), 'utf8')),
      owned.get(journalTempPath),
      false,
      'report-update-failed',
      'analysis report update could not publish its journal exclusively',
    ));
    journalOwned = true;
    const journalStat = fs.statSync(journalPath);
    owned.set(journalPath, { dev: journalStat.dev, ino: journalStat.ino });
    call(guardedOperation, 'report-update:journal:unlink-temp', () => removeOwnedIdentityPathAction(
      fs,
      journalTempPath,
      owned.get(journalTempPath),
      'report-update-failed',
      'analysis report update journal temp changed during publication',
    ));
    stageFile(
      fs,
      guardedOperation,
      tempPath,
      newBytes,
      'report-update:report',
      identity => owned.set(tempPath, identity),
    );
    const stagedBytes = readBytes(fs, guardedOperation, tempPath, 'report-update:verify');
    if (!stagedBytes.equals(newBytes)) {
      throw new SurveyOutputError(
        'report-update-validation-failed',
        'staged analysis report bytes are not canonical',
        3,
      );
    }
    const staged = JSON.parse(decodeUtf8(stagedBytes, 'staged analysis report'));
    input.core.assertValidReport(staged);
    input.core.assertEmittableReport(staged, {
      surface: 'cli',
      envelope: input.expectedEnvelope,
    });
    call(guardedOperation, 'report-update:backup-rename', () => captureBackupAction(
      fs,
      boundReportPath,
      backupPath,
      journal.old_sha256,
      'report-update-failed',
      'analysis report update could not capture the prior generation exclusively',
    ));
    call(guardedOperation, 'report-update:publish-rename', () => publishTempExclusiveAction(
      fs,
      tempPath,
      boundReportPath,
      journal.new_sha256,
      owned.get(tempPath),
      true,
      'report-update-failed',
      'analysis report update could not publish the new generation exclusively',
    ));
    const finalBytes = readBytes(fs, guardedOperation, boundReportPath, 'report-update:final-verify');
    if (!finalBytes.equals(newBytes)) {
      throw new SurveyOutputError(
        'report-update-validation-failed',
        'published analysis report bytes are not canonical',
        3,
      );
    }
    const finalReport = JSON.parse(decodeUtf8(finalBytes, 'published analysis report'));
    input.core.assertValidReport(finalReport);
    input.core.assertEmittableReport(finalReport, {
      surface: 'cli',
      envelope: input.expectedEnvelope,
    });
    committed = true;
  } catch (error) {
    const failures = [];
    const attempt = (name, action) => {
      try {
        call(guardedOperation, name, action);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    };
    if (journalOwned && fs.existsSync(quarantineDirectory(journalTempPath, 'delete'))) {
      attempt('report-update:rollback:finish-remove-journal-temp', () => (
        recoverLinkRemovalQuarantine(
          fs,
          journalTempPath,
          journalPath,
          quarantineDirectory(journalTempPath, 'delete'),
          'report-update-rollback-failed',
          'analysis report update journal temp changed during cleanup',
        )
      ));
    }
    if (fs.existsSync(quarantineDirectory(tempPath, 'delete'))) {
      attempt('report-update:rollback:finish-remove-temp', () => recoverRemovalQuarantine(
        fs,
        tempPath,
        tempPath,
        journal.new_sha256,
        'report-update-rollback-failed',
        'analysis report update temp changed during cleanup',
        'delete',
      ));
    }
    if (fs.existsSync(quarantineDirectory(backupPath, 'capture'))) {
      attempt('report-update:rollback:finish-backup-capture', () => (
        recoverBackupCaptureQuarantine(
          fs,
          boundReportPath,
          backupPath,
          journal.old_sha256,
          'report-update-rollback-failed',
          'analysis report rollback could not finish capturing the prior generation',
        )
      ));
    }
    if (failures.length > 0) {
      throw new SurveyOutputError(
        'report-update-rollback-failed',
        'analysis report update failed and requires journal recovery',
        3,
      );
    }
    if (fs.existsSync(backupPath) && fs.existsSync(boundReportPath)) {
      try {
        const rollbackHash = sha256(readBytes(
          fs,
          guardedOperation,
          boundReportPath,
          'report-update:rollback:verify-owned',
        ));
        if (rollbackHash !== journal.new_sha256) {
          failures.push(new SurveyOutputError(
            'report-update-rollback-failed',
            'analysis report rollback found an unowned final generation',
            3,
          ));
        }
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    if (failures.length === 0) {
      if (fs.existsSync(backupPath)) {
        if (fs.existsSync(boundReportPath)) {
          attempt('report-update:rollback:remove-new', () => removeOwnedFinalAction(
            fs,
            boundReportPath,
            tempPath,
            journal.new_sha256,
            'report-update-rollback-failed',
            'analysis report rollback found an unowned final generation',
          ));
        }
        if (failures.length > 0) {
          throw new SurveyOutputError(
            'report-update-rollback-failed',
            'analysis report update failed and requires journal recovery',
            3,
          );
        }
        attempt('report-update:rollback:restore', () => restoreBackupAction(
          fs,
          backupPath,
          boundReportPath,
          journal.old_sha256,
          'report-update-rollback-failed',
          'analysis report rollback could not restore the prior generation exclusively',
        ));
      }
      if (owned.has(tempPath) && fs.existsSync(tempPath)) {
        attempt('report-update:rollback:remove-temp', () => removeOwnedIdentityPathAction(
          fs,
          tempPath,
          owned.get(tempPath),
          'report-update-rollback-failed',
          'analysis report update temp changed during cleanup',
        ));
      }
      if (journalOwned && failures.length === 0 && fs.existsSync(journalPath)) {
        attempt('report-update:rollback:remove-journal', () => removeOwnedIdentityPathAction(
          fs,
          journalPath,
          owned.get(journalPath),
          'report-update-rollback-failed',
          'analysis report update journal changed during cleanup',
        ));
      }
      if (owned.has(journalTempPath) && fs.existsSync(journalTempPath)) {
        attempt('report-update:rollback:remove-journal-temp', () => removeOwnedIdentityPathAction(
          fs,
          journalTempPath,
          owned.get(journalTempPath),
          'report-update-rollback-failed',
          'analysis report update journal temp changed during cleanup',
        ));
      }
    }
    if (failures.length > 0) {
      throw new SurveyOutputError(
        'report-update-rollback-failed',
        'analysis report update failed and requires journal recovery',
        3,
      );
    }
    throw error instanceof SurveyOutputError
      ? error
      : new SurveyOutputError('report-update-failed', 'unable to update analysis report', 3);
  }

  if (committed) {
    try {
      if (fs.existsSync(backupPath)) {
        call(guardedOperation, 'report-update:commit:remove-backup', () => (
          removeOwnedHashedPathAction(
            fs,
            backupPath,
            journal.old_sha256,
            'report-update-cleanup-failed',
            'analysis report update backup changed during cleanup',
          )
        ));
      }
      if (journalOwned) {
        call(guardedOperation, 'report-update:commit:remove-journal', () => (
          removeOwnedIdentityPathAction(
            fs,
            journalPath,
            owned.get(journalPath),
            'report-update-cleanup-failed',
            'analysis report update journal changed during cleanup',
          )
        ));
      }
    } catch {
      // The next report-only update recognizes new_sha256 and cleans its journal.
    }
  }
  return {
    report: next,
    reportPath,
    reportBytes: decodeUtf8(newBytes, 'analysis report update'),
  };
  } finally {
    try {
      releaseOutputLock(outputLock, fs, guardedOperation);
    } catch (error) {
      if (!committed) throw error;
    } finally {
      process.chdir(previousDirectory);
    }
  }
}
