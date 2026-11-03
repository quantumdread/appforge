/** Stable, dependency-free finding fingerprints shared by every adapter. */

import type { Issue } from './analyzer.js';
import type { IssueEvidence } from './evidence.js';
import { sha256, utf8Bytes } from './sha256.js';

/** Public width contract for persisted finding fingerprints. */
export const FINDING_FINGERPRINT_HEX_WIDTH = 12;

export type FindingFingerprintInput = {
  rule: string;
  file: string;
  control: string;
  type: string;
  property?: string;
  controls?: readonly string[];
};

/** Public formula marker for report finding identity. */
export const FINDING_FINGERPRINT_V2_FORMULA = 'finding-fingerprint/2';

/** Rule renames are explicit data so persisted identities can survive a rename. */
export const RULE_ALIASES: Readonly<Record<string, string>> = {};

export type FingerprintV2Input = Pick<
  Issue,
  'level' | 'rule' | 'file' | 'control' | 'type' | 'variant' | 'property' | 'controls' | 'evidence'
>;

export type FingerprintV2ErrorCode =
  | 'missing-rule'
  | 'rule-alias-cycle'
  | 'unsupported-evidence';

/** Typed refusal for finding identities that cannot be made deterministic. */
export class FingerprintV2Error extends Error {
  constructor(
    public readonly code: FingerprintV2ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FingerprintV2Error';
  }
}

/** Resolve a rule rename fully while refusing cyclic alias tables. */
export function canonicalRuleId(
  rule: string,
  aliases: Readonly<Record<string, string>> = RULE_ALIASES,
): string {
  const seen = new Set<string>();
  let current = rule;
  while (Object.hasOwn(aliases, current)) {
    if (seen.has(current)) {
      throw new FingerprintV2Error(
        'rule-alias-cycle',
        `Rule alias cycle: ${[...seen, current].join(' -> ')}`,
      );
    }
    seen.add(current);
    current = aliases[current];
  }
  return current;
}

const unsupportedEvidence = (evidence: never): never => {
  const kind = (evidence as { kind?: unknown }).kind;
  throw new FingerprintV2Error(
    'unsupported-evidence',
    `Unsupported issue evidence kind: ${String(kind)}`,
  );
};

/** Stable root-cause identity; evidence details that do not change cause are excluded. */
export function causeKey(evidence: IssueEvidence | undefined): string {
  if (!evidence) return '';
  switch (evidence.kind) {
    case 'bound-source':
      return `bound-source:${evidence.authoredName}`;
    case 'formula-identity':
      return `formula-identity:${sha256(evidence.identity).slice(0, 16)}`;
    case 'threshold':
      return `threshold:${evidence.appliedThreshold}`;
    case 'color-literal':
      return `color-literal:${evidence.literal}`;
    default:
      return unsupportedEvidence(evidence);
  }
}

/** Stable report identity excludes location line numbers and aggregate membership. */
export function findingFingerprintV2(issue: FingerprintV2Input): string {
  if (!issue.rule) {
    throw new FingerprintV2Error(
      'missing-rule',
      `Cannot fingerprint ${issue.level} finding without a rule`,
    );
  }
  const identity = JSON.stringify([
    issue.file,
    canonicalRuleId(issue.rule),
    issue.control ?? '',
    issue.type ?? '',
    issue.variant ?? '',
    issue.property ?? '',
    causeKey(issue.evidence),
  ]);
  return sha256(identity).slice(0, 16);
}

/** Canonical identity excludes line numbers and sorts aggregate membership. */
export function findingFingerprintIdentity({
  rule,
  file,
  control,
  type,
  property,
  controls,
}: FindingFingerprintInput): string {
  const aggregateIdentity = Array.isArray(controls)
    ? `\0${[...controls].sort().join(',')}`
    : '';
  return `${rule}\0${file}\0${control}\0${type}\0${property ?? ''}${aggregateIdentity}`;
}

/** Match the historical 12-hex SHA-1 fingerprint without Node or Worker APIs. */
export function findingFingerprint(input: FindingFingerprintInput): string {
  return sha1(findingFingerprintIdentity(input)).slice(0, FINDING_FINGERPRINT_HEX_WIDTH);
}

const rotateLeft = (value: number, bits: number): number =>
  ((value << bits) | (value >>> (32 - bits))) >>> 0;

function sha1(value: string): string {
  const bytes = utf8Bytes(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 80; index++) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index++) {
      let fn;
      let constant;
      if (index < 20) {
        fn = (b & c) | (~b & d);
        constant = 0x5a827999;
      } else if (index < 40) {
        fn = b ^ c ^ d;
        constant = 0x6ed9eba1;
      } else if (index < 60) {
        fn = (b & c) | (b & d) | (c & d);
        constant = 0x8f1bbcdc;
      } else {
        fn = b ^ c ^ d;
        constant = 0xca62c1d6;
      }
      const next = (rotateLeft(a, 5) + fn + e + constant + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = next;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4]
    .map(word => word.toString(16).padStart(8, '0'))
    .join('');
}
