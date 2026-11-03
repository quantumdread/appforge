import { Buffer } from 'node:buffer';
import { crc32, inflateRawSync } from 'node:zlib';

export const MAX_CONTAINER_BYTES = 256 * 1024 * 1024;
export const MAX_INFLATED_TOTAL = 200 * 1024 * 1024;
export const MAX_ENTRIES = 10_000;
export const MAX_ENTRY_RATIO = 400;

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

export class ZipError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'ZipError';
    this.reason = reason;
  }
}

function refuse(reason, message) {
  throw new ZipError(reason, message);
}

export function createInflateBudget(maxTotalBytes = MAX_INFLATED_TOTAL) {
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes < 0) {
    throw new RangeError('ZIP inflation budget must be a non-negative safe integer');
  }
  return { remaining: maxTotalBytes };
}

export function canonicalZipPath(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    refuse('unsafe-path', 'ZIP entry path is empty');
  }
  if (/[\u0000-\u001f\u007f]/u.test(raw)) {
    refuse('unsafe-path', 'ZIP entry path contains control bytes');
  }

  const normalized = raw.replaceAll('\\', '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:/u.test(normalized)) {
    refuse('unsafe-path', 'ZIP entry path is absolute');
  }

  const segments = [];
  for (const segment of normalized.split('/')) {
    if (segment === '..') {
      refuse('unsafe-path', 'ZIP entry path traverses outside the archive');
    }
    if (segment === '' || segment === '.') continue;
    segments.push(segment);
  }

  if (segments.length === 0) {
    refuse('unsafe-path', 'ZIP entry path has no safe segments');
  }
  return segments.join('/');
}

function requireRange(start, length, limit, description) {
  if (
    !Number.isSafeInteger(start)
    || !Number.isSafeInteger(length)
    || start < 0
    || length < 0
    || start > limit
    || length > limit - start
  ) {
    refuse('truncated', `${description} is outside the ZIP container`);
  }
  return start + length;
}

function findEocd(buffer) {
  if (buffer.length < 22) {
    refuse('not-a-zip', 'Input is too short to contain a ZIP end record');
  }

  const earliest = Math.max(0, buffer.length - 22 - MAX_ZIP_COMMENT_BYTES);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (commentLength === buffer.length - offset - 22) return offset;
  }
  refuse('not-a-zip', 'No valid ZIP end record was found');
}

function rejectZip64Extra(buffer, start, length, limit, description) {
  const end = requireRange(start, length, limit, description);
  let cursor = start;
  while (cursor < end) {
    requireRange(cursor, 4, end, `${description} header`);
    const fieldId = buffer.readUInt16LE(cursor);
    const fieldLength = buffer.readUInt16LE(cursor + 2);
    cursor += 4;
    cursor = requireRange(cursor, fieldLength, end, `${description} value`);
    if (fieldId === 0x0001) {
      refuse('zip64-unsupported', 'ZIP64 extra fields are unsupported');
    }
  }
}

function hasSignatureBetween(buffer, signature, start, end) {
  if (end - start < 4) return false;
  for (let offset = start; offset <= end - 4; offset += 1) {
    if (buffer.readUInt32LE(offset) === signature) return true;
  }
  return false;
}

function parseCentralDirectory(buffer, eocdOffset) {
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDiskNumber = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);

  if (
    diskNumber === 0xffff
    || centralDiskNumber === 0xffff
    || entriesOnDisk === 0xffff
    || entryCount === 0xffff
    || centralSize === 0xffffffff
    || centralOffset === 0xffffffff
  ) {
    refuse('zip64-unsupported', 'ZIP64 end-record fields are unsupported');
  }
  if (diskNumber !== 0 || centralDiskNumber !== 0 || entriesOnDisk !== entryCount) {
    refuse('multi-disk-unsupported', 'Multi-disk ZIP archives are unsupported');
  }
  if (entryCount > MAX_ENTRIES) {
    refuse('entry-cap', `ZIP contains more than ${MAX_ENTRIES} entries`);
  }

  const centralEnd = requireRange(
    centralOffset,
    centralSize,
    eocdOffset,
    'Central directory',
  );
  if (
    hasSignatureBetween(buffer, ZIP64_EOCD_SIGNATURE, centralEnd, eocdOffset)
    || hasSignatureBetween(buffer, ZIP64_LOCATOR_SIGNATURE, centralEnd, eocdOffset)
  ) {
    refuse('zip64-unsupported', 'ZIP64 end records are unsupported');
  }
  if (centralEnd !== eocdOffset) {
    refuse('truncated', 'Central directory does not end at the ZIP end record');
  }

  const entries = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(cursor, 46, centralEnd, 'Central-directory entry');
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
      refuse('truncated', 'Central-directory entry signature is missing');
    }

    const gpFlags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const expectedCrc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const startDisk = buffer.readUInt16LE(cursor + 34);
    const localOffset = buffer.readUInt32LE(cursor + 42);

    if (
      compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || startDisk === 0xffff
      || localOffset === 0xffffffff
    ) {
      refuse('zip64-unsupported', 'ZIP64 central-directory fields are unsupported');
    }
    if (startDisk !== 0) {
      refuse('multi-disk-unsupported', 'Entry starts on another ZIP disk');
    }
    if ((gpFlags & 0x1) !== 0) {
      refuse('encrypted-entry', 'Encrypted ZIP entries are unsupported');
    }
    if (method !== 0 && method !== 8) {
      refuse('unsupported-method', `ZIP compression method ${method} is unsupported`);
    }

    const variableLength = nameLength + extraLength + commentLength;
    const recordEnd = requireRange(cursor + 46, variableLength, centralEnd, 'Central-directory fields');
    const centralNameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    const extraStart = cursor + 46 + nameLength;
    rejectZip64Extra(buffer, extraStart, extraLength, centralEnd, 'Central-directory extra field');

    const rawPath = centralNameBytes.toString('utf8');
    const path = canonicalZipPath(rawPath);
    entries.push({
      path,
      duplicateKey: path.toLowerCase(),
      isDirectory: rawPath.replaceAll('\\', '/').endsWith('/'),
      centralNameBytes,
      gpFlags,
      method,
      expectedCrc,
      compressedSize,
      uncompressedSize,
      localOffset,
      dataStart: 0,
      dataEnd: 0,
    });
    cursor = recordEnd;
  }

  if (cursor !== centralEnd) {
    refuse('truncated', 'Central-directory size does not match its entries');
  }
  return { entries, centralOffset };
}

function validateLocalEntries(buffer, entries, centralOffset) {
  const occupiedRanges = [];
  for (const entry of entries) {
    requireRange(entry.localOffset, 30, centralOffset, 'Local entry header');
    if (buffer.readUInt32LE(entry.localOffset) !== LOCAL_HEADER_SIGNATURE) {
      refuse('header-mismatch', 'Local entry signature disagrees with the central directory');
    }

    const localNameLength = buffer.readUInt16LE(entry.localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(entry.localOffset + 28);
    const localFieldsStart = entry.localOffset + 30;
    const dataStart = requireRange(
      localFieldsStart,
      localNameLength + localExtraLength,
      centralOffset,
      'Local entry name and extra fields',
    );
    const localNameBytes = buffer.subarray(localFieldsStart, localFieldsStart + localNameLength);
    if (!localNameBytes.equals(entry.centralNameBytes)) {
      refuse('header-mismatch', 'Local entry name disagrees with the central directory');
    }
    rejectZip64Extra(
      buffer,
      localFieldsStart + localNameLength,
      localExtraLength,
      centralOffset,
      'Local extra field',
    );
    const dataEnd = requireRange(
      dataStart,
      entry.compressedSize,
      centralOffset,
      'Compressed entry payload',
    );
    entry.dataStart = dataStart;
    entry.dataEnd = dataEnd;
    occupiedRanges.push({ start: entry.localOffset, end: dataEnd });
  }

  occupiedRanges.sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < occupiedRanges.length; index += 1) {
    if (occupiedRanges[index].start < occupiedRanges[index - 1].end) {
      refuse('overlapping-entries', 'ZIP entry ranges overlap');
    }
  }

  const paths = new Set();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (paths.has(entry.duplicateKey)) {
      refuse('duplicate-path', `ZIP contains duplicate path ${entry.path}`);
    }
    paths.add(entry.duplicateKey);
  }
}

function applicableInflateLimit(remaining, declaredLimit, ratioCeiling) {
  let maxOutputLength = declaredLimit;
  let reason = 'corrupt-entry';
  if (ratioCeiling < maxOutputLength) {
    maxOutputLength = ratioCeiling;
    reason = 'ratio-cap';
  }
  if (remaining <= maxOutputLength) {
    maxOutputLength = remaining;
    reason = 'size-cap';
  }
  return { maxOutputLength, reason };
}

function extractEntry(buffer, entry, budget) {
  if (entry.uncompressedSize > budget.remaining) {
    refuse('size-cap', 'ZIP entry exceeds the remaining inflation budget');
  }

  const ratioCeiling = entry.compressedSize >= 4096
    ? entry.compressedSize * MAX_ENTRY_RATIO
    : Number.POSITIVE_INFINITY;
  if (entry.uncompressedSize > ratioCeiling) {
    refuse('ratio-cap', `ZIP entry exceeds the ${MAX_ENTRY_RATIO}:1 inflation ratio cap`);
  }

  const compressed = buffer.subarray(entry.dataStart, entry.dataEnd);
  let bytes;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      refuse('corrupt-entry', 'Stored ZIP entry has inconsistent sizes');
    }
    bytes = Buffer.from(compressed);
  } else {
    const limit = applicableInflateLimit(
      budget.remaining,
      entry.uncompressedSize + 1,
      ratioCeiling,
    );
    try {
      bytes = inflateRawSync(compressed, {
        // Node requires a positive maxOutputLength. A declared-empty entry can
        // only use this one-byte allowance transiently; the checks below still
        // refuse any byte beyond a zero remaining budget or declared size.
        maxOutputLength: Math.max(1, limit.maxOutputLength),
      });
    } catch (error) {
      if (error instanceof RangeError) {
        refuse(limit.reason, `ZIP inflation exceeded its ${limit.reason}`);
      }
      refuse('corrupt-entry', 'ZIP entry could not be inflated');
    }

    if (bytes.length > budget.remaining) {
      refuse('size-cap', 'ZIP entry exceeds the remaining inflation budget');
    }
    if (bytes.length > ratioCeiling) {
      refuse('ratio-cap', `ZIP entry exceeds the ${MAX_ENTRY_RATIO}:1 inflation ratio cap`);
    }
    if (bytes.length !== entry.uncompressedSize) {
      refuse('corrupt-entry', 'Inflated length disagrees with the central directory');
    }
  }

  if ((crc32(bytes) >>> 0) !== entry.expectedCrc) {
    refuse('crc-mismatch', 'ZIP entry CRC disagrees with the central directory');
  }
  budget.remaining -= bytes.length;
  return bytes;
}

export function readZipEntries(input, { budget = createInflateBudget(), include } = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (!budget || !Number.isSafeInteger(budget.remaining) || budget.remaining < 0) {
    throw new RangeError('ZIP inflation budget has an invalid remaining byte count');
  }
  if (include !== undefined && typeof include !== 'function') {
    throw new TypeError('ZIP include must be a function');
  }

  const eocdOffset = findEocd(buffer);
  const { entries, centralOffset } = parseCentralDirectory(buffer, eocdOffset);
  validateLocalEntries(buffer, entries, centralOffset);

  const archiveEntries = Object.freeze(entries.map(entry => Object.freeze({
    path: entry.path,
    isDirectory: entry.isDirectory,
  })));

  const result = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (include && !include({ path: entry.path, isDirectory: false }, archiveEntries)) continue;
    const bytes = extractEntry(buffer, entry, budget);
    result.push({ path: entry.path, bytes });
  }
  return result;
}
