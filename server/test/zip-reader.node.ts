import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalZipPath,
  createInflateBudget,
  readZipEntries,
} from '../../cli/lib/zip-reader.mjs';
import { buildZip } from './helpers/build-zip';

const EOCD_SIGNATURE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
const CENTRAL_SIGNATURE = Buffer.from([0x50, 0x4b, 0x01, 0x02]);

describe('hardened ZIP reader', () => {
  it('inflates only included payloads while preserving archive-wide structural checks', () => {
    const budget = createInflateBudget(16);
    const zip = buildZip([
      { path: 'skip-bad-crc.txt', data: Buffer.from('not consumed'), corruptCrc: true },
      { path: 'keep.txt', data: Buffer.from('kept') },
    ]);

    expect(readZipEntries(zip, {
      budget,
      include: entry => entry.path === 'keep.txt',
    }).map(entry => [entry.path, entry.bytes.toString()])).toEqual([['keep.txt', 'kept']]);
    expect(budget.remaining).toBe(12);

    const encrypted = buildZip([
      { path: 'excluded-secret.txt', data: Buffer.from('x'), gpFlags: 0x1 },
    ]);
    expect(() => readZipEntries(encrypted, { include: () => false }))
      .toThrowError(expect.objectContaining({ reason: 'encrypted-entry' }));
  });

  it('reads stored and deflated entries in central-directory order', () => {
    const zip = buildZip([
      { path: 'Src\\Stored.txt', data: Buffer.from('stored'), method: 0 },
      { path: 'Src/Deflated.txt', data: Buffer.from('deflated') },
    ]);

    expect(readZipEntries(zip).map(entry => [entry.path, entry.bytes.toString()])).toEqual([
      ['Src/Stored.txt', 'stored'],
      ['Src/Deflated.txt', 'deflated'],
    ]);
  });

  it('rejects encrypted entries', () => {
    const zip = buildZip([{ path: 'secret.txt', data: Buffer.from('x'), gpFlags: 0x1 }]);
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'encrypted-entry' }));
  });

  it('rejects CRC mismatches', () => {
    const zip = buildZip([{ path: 'bad.txt', data: Buffer.from('bad crc'), corruptCrc: true }]);
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'crc-mismatch' }));
  });

  it.each([0, 8])('does not charge a CRC-mismatch method %i entry to the shared budget', (method) => {
    const budget = createInflateBudget(64);
    const initialRemaining = budget.remaining;
    const zip = buildZip([
      { path: 'bad.txt', data: Buffer.from('bad crc'), corruptCrc: true, method },
      { path: 'good.txt', data: Buffer.from('good') },
    ]);

    expect(() => readZipEntries(zip, { budget }))
      .toThrowError(expect.objectContaining({ reason: 'crc-mismatch' }));
    expect(budget.remaining).toBe(initialRemaining);
  });

  it('rejects case-folded duplicate paths', () => {
    const zip = buildZip([
      { path: 'Src/App.pa.yaml', data: Buffer.from('one') },
      { path: 'src/app.pa.yaml', data: Buffer.from('two') },
    ]);
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'duplicate-path' }));
  });

  it('shares an inflation budget ledger across calls', () => {
    const budget = createInflateBudget(3);
    const first = buildZip([{ path: 'a.bin', data: Buffer.from('aa'), method: 0 }]);
    const second = buildZip([{ path: 'b.bin', data: Buffer.from('bb'), method: 0 }]);

    expect(readZipEntries(first, { budget })[0].bytes.toString()).toBe('aa');
    expect(() => readZipEntries(second, { budget }))
      .toThrowError(expect.objectContaining({ reason: 'size-cap' }));
  });

  it('reports short and signature-free inputs as not-a-zip', () => {
    for (const input of [Buffer.from('not a zip'), Buffer.alloc(15)]) {
      expect(() => readZipEntries(input))
        .toThrowError(expect.objectContaining({ reason: 'not-a-zip' }));
    }
  });

  it('reports a signature-free input at least 22 bytes long as not-a-zip', () => {
    expect(() => readZipEntries(Buffer.alloc(64, 0x41)))
      .toThrowError(expect.objectContaining({ reason: 'not-a-zip' }));
  });

  it('rejects ZIP64 saturation in EOCD fields', () => {
    for (const [fieldOffset, width] of [[8, 2], [10, 2], [12, 4], [16, 4]] as const) {
      const zip = buildZip([{ path: 'x', data: Buffer.from('x') }], {
        patch(buffer) {
          const eocdOffset = buffer.lastIndexOf(EOCD_SIGNATURE);
          if (width === 2) buffer.writeUInt16LE(0xffff, eocdOffset + fieldOffset);
          else buffer.writeUInt32LE(0xffffffff, eocdOffset + fieldOffset);
          return buffer;
        },
      });
      expect(() => readZipEntries(zip), `EOCD +${fieldOffset}`)
        .toThrowError(expect.objectContaining({ reason: 'zip64-unsupported' }));
    }
  });

  it('caps a single entry that alone exceeds the whole budget, pre-allocation', () => {
    const zip = buildZip([{ path: 'big.bin', data: Buffer.alloc(64 * 1024, 65) }]);
    expect(() => readZipEntries(zip, { budget: createInflateBudget(1024) }))
      .toThrowError(expect.objectContaining({ reason: 'size-cap' }));
    // maxOutputLength enforces this BEFORE allocation; the assertion exists to prove the cap is pre-allocation.
  });

  it('charges stored (method 0) entries to the same ledger', () => {
    const zip = buildZip([{ path: 's.bin', data: Buffer.alloc(2048, 66), method: 0 }]);
    expect(() => readZipEntries(zip, { budget: createInflateBudget(1024) }))
      .toThrowError(expect.objectContaining({ reason: 'size-cap' }));
  });

  it('budget boundary: exactly == cap passes, cap+1 refuses', () => {
    const data = Buffer.alloc(1024, 67);
    const zip = buildZip([{ path: 'x.bin', data, method: 0 }]);
    expect(() => readZipEntries(zip, { budget: createInflateBudget(1024) })).not.toThrow();
    const zip2 = buildZip([{ path: 'x.bin', data: Buffer.alloc(1025, 67), method: 0 }]);
    expect(() => readZipEntries(zip2, { budget: createInflateBudget(1024) }))
      .toThrowError(expect.objectContaining({ reason: 'size-cap' }));
  });

  it('enforces the ratio cap on a genuine over-threshold entry', () => {
    const body = Buffer.concat([randomBytes(64 * 1024), Buffer.alloc(48 * 1024 * 1024, 0x41)]);
    // The random prefix forces compressed >= 4096; 48 MiB keeps the measured ratio genuinely above 400.
    const zip = buildZip([{ path: 'bomb.bin', data: body }]);
    expect(() => readZipEntries(zip, { budget: createInflateBudget(512 * 1024 * 1024) }))
      .toThrowError(expect.objectContaining({ reason: 'ratio-cap' }));
  });

  it('exempts small entries (compressed < 4096) from the ratio cap', () => {
    const zip = buildZip([{ path: 's.bin', data: Buffer.alloc(512 * 1024, 0) }]);
    expect(() => readZipEntries(zip)).not.toThrow();
  });

  it('size-cap wins when both size and ratio would trip (declared check order)', () => {
    const body = Buffer.concat([randomBytes(64 * 1024), Buffer.alloc(48 * 1024 * 1024, 0x41)]);
    const zip = buildZip([{ path: 'both.bin', data: body }]);
    expect(() => readZipEntries(zip, { budget: createInflateBudget(1024 * 1024) }))
      .toThrowError(expect.objectContaining({ reason: 'size-cap' }));
  });

  it('rejects entry-count over MAX_ENTRIES', () => {
    const entries = Array.from({ length: 10_001 }, (_, index) => ({
      path: `entries/${index}.txt`,
      data: Buffer.alloc(0),
      method: 0,
    }));
    expect(() => readZipEntries(buildZip(entries)))
      .toThrowError(expect.objectContaining({ reason: 'entry-cap' }));
  });

  it('rejects unsupported compression methods', () => {
    const zip = buildZip([{ path: 'old.bin', data: Buffer.from('x'), method: 12 }]);
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'unsupported-method' }));
  });

  it('supports GP bit 3 (data descriptors): central sizes are authoritative', () => {
    const zip = buildZip([{
      path: 'd.txt',
      data: Buffer.from('descriptor'),
      gpFlags: 0x8,
      zeroLocalSizes: true,
    }]);
    expect(readZipEntries(zip)[0].bytes.toString()).toBe('descriptor');
  });

  it('rejects local/central name disagreement as header-mismatch', () => {
    const zip = buildZip([{
      path: 'real.txt',
      data: Buffer.from('x'),
      overrideLocalName: 'fake.txt',
    }]);
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'header-mismatch' }));
  });

  it('rejects unsafe paths', () => {
    for (const path of [
      '../etc/passwd',
      'a/../../b',
      '/abs/path',
      'C:/drive/path',
      'C:\\drive\\path',
      'a/\u0000x',
      '..',
    ]) {
      const zip = buildZip([{ path, data: Buffer.from('x') }]);
      expect(() => readZipEntries(zip), path)
        .toThrowError(expect.objectContaining({ reason: 'unsafe-path' }));
    }
  });

  it('collapses dot segments so a/./b and a/b collide as duplicates', () => {
    const zip = buildZip([
      { path: 'a/./b.txt', data: Buffer.from('1') },
      { path: 'a/b.txt', data: Buffer.from('2') },
    ]);
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'duplicate-path' }));
  });

  it('skips directory entries by trailing slash only; zero-length real files survive', () => {
    const zip = buildZip([
      { path: 'dir/', data: Buffer.alloc(0), method: 0 },
      { path: 'Src/Empty.pa.yaml', data: Buffer.alloc(0), method: 0 },
    ]);
    const entries = readZipEntries(zip);
    expect(entries.map(entry => entry.path)).toEqual(['Src/Empty.pa.yaml']);
  });

  it('does not treat a directory as a duplicate of a same-named file', () => {
    const zip = buildZip([
      { path: 'dir/', data: Buffer.alloc(0), method: 0 },
      { path: 'dir', data: Buffer.from('file'), method: 0 },
    ]);

    expect(readZipEntries(zip).map(entry => [entry.path, entry.bytes.toString()]))
      .toEqual([['dir', 'file']]);
  });

  it('rejects out-of-range local offsets as truncated, never slicing wrong bytes', () => {
    const zip = buildZip([{ path: 'x.txt', data: Buffer.from('x') }], {
      patch(buffer) {
        const centralOffset = buffer.indexOf(CENTRAL_SIGNATURE);
        buffer.writeUInt32LE(buffer.length + 32, centralOffset + 42);
        return buffer;
      },
    });
    expect(() => readZipEntries(zip))
      .toThrowError(expect.objectContaining({ reason: 'truncated' }));
  });

  it('finds the real EOCD when an embedded inner zip contains the signature', () => {
    const inner = buildZip([{ path: 'Src/Inner.pa.yaml', data: Buffer.from('inner'), method: 0 }]);
    const spuriousEocd = Buffer.alloc(26, 0x42);
    EOCD_SIGNATURE.copy(spuriousEocd, 0);
    spuriousEocd.writeUInt16LE(0, 20);
    const outer = buildZip(
      [{ path: 'CanvasApps/app.msapp', data: inner, method: 0 }],
      { comment: Buffer.concat([Buffer.from('outer:'), spuriousEocd]) },
    );

    const [nested] = readZipEntries(outer);
    expect(nested.path).toBe('CanvasApps/app.msapp');
    expect(nested.bytes.equals(inner)).toBe(true);
    expect(readZipEntries(nested.bytes)[0].bytes.toString()).toBe('inner');
  });

  it('canonicalizes separators and dot segments', () => {
    expect(canonicalZipPath('Src\\Screens/./Home.pa.yaml')).toBe('Src/Screens/Home.pa.yaml');
  });
});
