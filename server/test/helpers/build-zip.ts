import { deflateRawSync } from 'node:zlib';

export interface ZipEntryFixture {
  path: string;
  data: Buffer | Uint8Array | string;
  gpFlags?: number;
  corruptCrc?: boolean;
  method?: number;
  overrideLocalName?: string;
  zeroLocalSizes?: boolean;
}

export interface BuildZipOptions {
  comment?: Buffer | Uint8Array | string;
  patch?: (buffer: Buffer) => Buffer;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(entries: ZipEntryFixture[], options: BuildZipOptions = {}): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const comment = Buffer.isBuffer(options.comment) ? options.comment : Buffer.from(options.comment ?? '');
  let localOffset = 0;

  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const method = entry.method ?? 8;
    const gpFlags = entry.gpFlags ?? 0;
    const compressed = method === 8 ? deflateRawSync(data) : Buffer.from(data);
    const actualCrc = crc32(data);
    const writtenCrc = entry.corruptCrc ? (actualCrc + 1) >>> 0 : actualCrc;
    const centralName = Buffer.from(entry.path, 'utf8');
    const localName = Buffer.from(entry.overrideLocalName ?? entry.path, 'utf8');
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(gpFlags, 6);
    localHeader.writeUInt16LE(method, 8);
    if (!entry.zeroLocalSizes) {
      localHeader.writeUInt32LE(writtenCrc, 14);
      localHeader.writeUInt32LE(compressed.length, 18);
      localHeader.writeUInt32LE(data.length, 22);
    }
    localHeader.writeUInt16LE(localName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const descriptor = (gpFlags & 0x8) !== 0
      ? (() => {
          const value = Buffer.alloc(16);
          value.writeUInt32LE(0x08074b50, 0);
          value.writeUInt32LE(writtenCrc, 4);
          value.writeUInt32LE(compressed.length, 8);
          value.writeUInt32LE(data.length, 12);
          return value;
        })()
      : Buffer.alloc(0);

    localParts.push(localHeader, localName, compressed, descriptor);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(gpFlags, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt32LE(writtenCrc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(centralName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(entry.path.replaceAll('\\', '/').endsWith('/') ? 0x10 : 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, centralName);

    localOffset += localHeader.length + localName.length + compressed.length + descriptor.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(comment.length, 20);

  const zip = Buffer.concat([...localParts, centralDirectory, eocd, comment]);
  return options.patch ? options.patch(zip) : zip;
}
