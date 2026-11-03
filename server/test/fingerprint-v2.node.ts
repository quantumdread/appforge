import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveIntake } from '../../cli/lib/intake.mjs';
import { validateFiles } from '../src/core/analyzer';
import { findingFingerprintV2 } from '../src/core/fingerprint';
import { sha256 } from '../src/core/sha256';
import { ANALYZER_CATALOG_DATA } from '../src/lib/catalog-data';
import { buildZip } from './helpers/build-zip';

describe('dependency-free SHA-256', () => {
  it('matches node:crypto for 500 random byte buffers', () => {
    for (let index = 0; index < 500; index++) {
      const bytes = randomBytes(index % 257);
      const expected = createHash('sha256').update(bytes).digest('hex');

      expect(sha256(bytes), `random buffer ${index} (${bytes.length} bytes)`).toBe(expected);
    }
  });
});

describe('finding-fingerprint/2 intake stability', () => {
  const roots: string[] = [];
  const content = `Screens:
  Main:
    Children:
      - btnPinned:
          Control: Button@1.0.0
          Properties:
            OnSelect: =true
      - unknownControl:
          Control: DefinitelyNotAControl
      - galOrders:
          Control: Gallery
          Properties:
            Items: =Search(Orders, txtQ.Text, "Namn")
`;
  const datasources = { Orders: 'sharepoint' } as const;

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('produces identical finding sets through directory and msapp intake', () => {
    const root = mkdtempSync(join(tmpdir(), 'appforge-fingerprint-v2-'));
    roots.push(root);
    const directory = join(root, 'directory');
    const directorySource = join(directory, 'Src', 'Screens');
    mkdirSync(directorySource, { recursive: true });
    writeFileSync(join(directorySource, 'Main.pa.yaml'), content, 'utf8');

    const msapp = join(root, 'same-app.msapp');
    writeFileSync(msapp, buildZip([{ path: 'Src/Screens/Main.pa.yaml', data: content }]));

    const fingerprintSet = (target: string): string[] => {
      const intake = resolveIntake(target);
      const result = validateFiles(
        intake.files.map(file => ({ name: file.id, content: file.content })),
        ANALYZER_CATALOG_DATA,
        { lintContext: { datasources } },
      );
      const findings = result.issues.filter(issue => issue.level !== 'PASS');
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.some(issue => issue.rule === 'delegation-sharepoint-search')).toBe(true);
      return findings.map(findingFingerprintV2).sort();
    };

    expect(fingerprintSet(directory)).toEqual(fingerprintSet(msapp));
  });
});
