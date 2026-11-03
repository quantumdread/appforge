import { describe, expect, it } from 'vitest';
import {
  FINDING_FINGERPRINT_HEX_WIDTH,
  FINDING_FINGERPRINT_V2_FORMULA,
  FingerprintV2Error,
  canonicalRuleId,
  causeKey,
  findingFingerprint,
  findingFingerprintV2,
  type FingerprintV2Input,
} from '../src/core/fingerprint';
import { sha256 } from '../src/core/sha256';

describe('dependency-free SHA-256 vectors', () => {
  it.each([
    ['NIST empty', '', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['NIST abc', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'NIST long',
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
    ['55-byte padding boundary', 'a'.repeat(55), '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318'],
    ['56-byte padding boundary', 'a'.repeat(56), 'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a'],
    ['63-byte padding boundary', 'a'.repeat(63), '7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34'],
    ['64-byte padding boundary', 'a'.repeat(64), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'],
    ['65-byte padding boundary', 'a'.repeat(65), '635361c48bb9eab14198e76ea8ab7f1a41685d6ad62aa9146d301d4f17eb0ae0'],
    ['non-ASCII', 'Power Apps — räksmörgås 🚀', '5b53235b1ae4cefc16273d32fb3f845ea0b44ba0aff30534f0604ade9934ac87'],
    ['lone high surrogate', '\ud800', '83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097'],
    ['lone low surrogate', '\udc00', '83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097'],
    ['mixed lone surrogates', 'A\ud800B\udc00C', '1fc6d5cb80749082333a8099b850bd205e76d33dadfa30f66874a2690826b56e'],
  ])('matches the %s vector', (_name, value, expected) => {
    expect(sha256(value)).toBe(expected);
  });
});

describe('finding-fingerprint/2', () => {
  const site = {
    level: 'WARN',
    rule: 'delegation-filter',
    file: 'Screens/Main.pa.yaml',
    control: 'galOrders',
    type: 'Gallery',
    property: 'Items',
  } satisfies FingerprintV2Input;

  it('keeps the shipped v1 fingerprint byte-identical', () => {
    const fingerprint = findingFingerprint({
      rule: 'version-pin-in-control-type',
      file: 'Screens/Main.pa.yaml',
      control: 'btnPinned',
      type: 'Button',
    });

    expect(fingerprint).toBe('61caaf02492d');
    expect(fingerprint).toMatch(/^[0-9a-f]{12}$/u);
    expect(FINDING_FINGERPRINT_HEX_WIDTH).toBe(12);
  });

  it('pins stable 16-hex serialization fixtures', () => {
    expect(FINDING_FINGERPRINT_V2_FORMULA).toBe('finding-fingerprint/2');
    expect(findingFingerprintV2({
      ...site,
      evidence: {
        kind: 'bound-source',
        authoredName: 'Orders',
        backend: 'sharepoint',
        resolvedBy: 'explicit-input',
        confidence: 'high',
      },
    })).toBe('0bcc44dfdcf17e05');
    expect(findingFingerprintV2({
      ...site,
      evidence: {
        kind: 'formula-identity',
        identity: 'Filter(Orders,Status="Open")',
        occurrences: 3,
      },
    })).toBe('9fedb63388f666fe');
    expect(findingFingerprintV2({
      ...site,
      rule: 'screen-control-budget',
      control: 'Main',
      type: 'Screen',
      variant: 'large',
      property: undefined,
      evidence: { kind: 'threshold', appliedThreshold: 120, observed: 121 },
    })).toBe('7dfaeda2bd79e215');
  });

  it('derives bounded cause keys from only cause-defining evidence fields', () => {
    expect(causeKey(undefined)).toBe('');
    expect(causeKey({
      kind: 'bound-source', authoredName: 'Orders', backend: 'sharepoint',
      resolvedBy: 'explicit-input', confidence: 'high',
    })).toBe('bound-source:Orders');
    expect(causeKey({
      kind: 'formula-identity', identity: 'Filter(Orders,Status="Open")', occurrences: 3,
    })).toBe('formula-identity:8949163edf0c9199');
    expect(causeKey({ kind: 'threshold', appliedThreshold: 120, observed: 121 }))
      .toBe('threshold:120');
    expect(causeKey({ kind: 'color-literal', literal: 'RGBA(1,2,3,1)' }))
      .toBe('color-literal:RGBA(1,2,3,1)');
  });

  it('distinguishes two causes at one site', () => {
    const orders = findingFingerprintV2({
      ...site,
      evidence: {
        kind: 'bound-source', authoredName: 'Orders', backend: undefined,
        resolvedBy: 'unresolved', confidence: 'low',
      },
    });
    const customers = findingFingerprintV2({
      ...site,
      evidence: {
        kind: 'bound-source', authoredName: 'Customers', backend: undefined,
        resolvedBy: 'unresolved', confidence: 'low',
      },
    });

    expect(orders).not.toBe(customers);
  });

  it('excludes aggregate membership from identity', () => {
    const first = findingFingerprintV2({ ...site, controls: ['galOrders', 'galArchive'] });
    const changed = findingFingerprintV2({ ...site, controls: ['galOrders', 'galNew'] });

    expect(first).toBe(changed);
  });

  it('resolves renamed aliases and full chains from injected tables', () => {
    expect(canonicalRuleId('old-rule', { 'old-rule': 'new-rule' })).toBe('new-rule');
    expect(canonicalRuleId('old-rule', {
      'old-rule': 'middle-rule',
      'middle-rule': 'new-rule',
    })).toBe('new-rule');
  });

  it('throws a typed error for alias cycles', () => {
    expect(() => canonicalRuleId('old-rule', {
      'old-rule': 'middle-rule',
      'middle-rule': 'old-rule',
    })).toThrowError(FingerprintV2Error);
    try {
      canonicalRuleId('old-rule', { 'old-rule': 'old-rule' });
      throw new Error('expected canonicalRuleId to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'rule-alias-cycle' });
    }
  });

  it('throws a typed error rather than hashing an unidentifiable finding', () => {
    const issue: FingerprintV2Input = { ...site, rule: undefined };

    expect(() => findingFingerprintV2(issue)).toThrowError(FingerprintV2Error);
    try {
      findingFingerprintV2(issue);
      throw new Error('expected findingFingerprintV2 to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'missing-rule' });
    }
  });
});
