import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveIntake } from '../../cli/lib/intake.mjs';
import { buildZip, type ZipEntryFixture } from './helpers/build-zip';

const SCREEN = `Screens:\n  Main:\n    Children:\n      - lblOne:\n          Control: Label\n          Properties:\n            Wrap: =false\n            Text: ="hi"\n`;

function probeJunctionSupport() {
  const probeRoot = mkdtempSync(join(tmpdir(), 'intake-junction-probe-'));
  const target = join(probeRoot, 'target');
  const link = join(probeRoot, 'link');
  mkdirSync(target);
  try {
    symlinkSync(target, link, 'junction');
    return { available: true, reason: '' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[skip] junctions unavailable: ${reason}`);
    return { available: false, reason };
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

const junctionSupport = probeJunctionSupport();

function probeFileSymlinkSupport() {
  const probeRoot = mkdtempSync(join(tmpdir(), 'intake-symlink-probe-'));
  const target = join(probeRoot, 'target.txt');
  const link = join(probeRoot, 'link.txt');
  writeFileSync(target, 'x');
  try {
    symlinkSync(target, link, 'file');
    return { available: true, reason: '' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[skip] file symlinks unavailable: ${reason}`);
    return { available: false, reason };
  } finally {
    rmSync(probeRoot, { recursive: true, force: true });
  }
}

const fileSymlinkSupport = probeFileSymlinkSupport();

let root: string;
let appRoot: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'intake-'));
  appRoot = join(root, 'FieldService');
  mkdirSync(appRoot);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('directory intake', () => {
  it('resolves .pa.yaml files with canonical POSIX ids, lexical order, and exact-byte hashes', () => {
    const exactBytes = Buffer.from(`\ufeff${SCREEN.replaceAll('\n', '\r\n')}`, 'utf8');
    mkdirSync(join(appRoot, 'Screens'));
    writeFileSync(join(appRoot, 'Screens', 'B.pa.yaml'), SCREEN);
    writeFileSync(join(appRoot, 'A.pa.yaml'), exactBytes);
    writeFileSync(join(appRoot, 'notes.txt'), 'not yaml');

    const result = resolveIntake(appRoot);

    expect(result.source_kind).toBe('directory');
    expect(result.files.map(file => file.id)).toEqual(['A.pa.yaml', 'Screens/B.pa.yaml']);
    expect(result.files[0].content).toBe(exactBytes.toString('utf8'));
    expect(result.files[0].sha256)
      .toBe(createHash('sha256').update(exactBytes).digest('hex'));
    expect(result.app_name).toEqual({ value: 'FieldService', resolved_by: 'directory' });
    expect(result.datasources).toEqual({});
    expect(result.connections).toEqual([]);
    expect(result.limitations).toEqual([
      { kind: 'metadata-absent', source: 'connections', detail: expect.any(String) },
      { kind: 'metadata-absent', source: 'datasources', detail: expect.any(String) },
    ]);
    expect(result.fingerprint_basis).toBe('directory/src-stripped/v1');
  });

  it('throws usage/no-app-source for a directory with no .pa.yaml files', () => {
    writeFileSync(join(appRoot, 'readme.md'), 'x');

    expect(() => resolveIntake(appRoot)).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'no-app-source',
    }));
  });

  it.skipIf(!junctionSupport.available)(
    `does not follow directory junctions and records the skip as a limitation${junctionSupport.reason ? `: ${junctionSupport.reason}` : ''}`,
    () => {
      writeFileSync(join(appRoot, 'A.pa.yaml'), SCREEN);
      symlinkSync(appRoot, join(appRoot, 'loop'), 'junction');

      const result = resolveIntake(appRoot);

      expect(result.files.map(file => file.id)).toEqual(['A.pa.yaml']);
      expect(result.limitations).toContainEqual(expect.objectContaining({
        kind: 'skipped-symlink',
        source: 'filesystem',
      }));
    },
  );

  it('throws usage/target-not-found for a nonexistent path', () => {
    expect(() => resolveIntake(join(root, 'no-such'))).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'target-not-found',
    }));
  });

  it('strips a single leading Src/ segment so directory and archive intake agree', () => {
    mkdirSync(join(appRoot, 'Src', 'Screens'), { recursive: true });
    writeFileSync(join(appRoot, 'Src', 'App.pa.yaml'), SCREEN);
    writeFileSync(join(appRoot, 'Src', 'Screens', 'Main.pa.yaml'), SCREEN);

    const result = resolveIntake(appRoot);

    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml', 'Screens/Main.pa.yaml']);
  });

  it('excludes _EditorState.pa.yaml furniture exactly as archive intake does', () => {
    mkdirSync(join(appRoot, 'Src'), { recursive: true });
    writeFileSync(join(appRoot, 'Src', 'App.pa.yaml'), SCREEN);
    writeFileSync(join(appRoot, 'Src', '_EditorState.pa.yaml'), 'EditorState:\n  ScreensOrder: []\n');

    const result = resolveIntake(appRoot);

    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
    expect(result.limitations.some(l => l.detail.includes('_EditorState'))).toBe(false);
  });

  it('leaves a non-leading Src segment untouched', () => {
    mkdirSync(join(appRoot, 'Deep', 'Src'), { recursive: true });
    writeFileSync(join(appRoot, 'Deep', 'Src', 'File.pa.yaml'), SCREEN);

    const result = resolveIntake(appRoot);

    expect(result.files.map(file => file.id)).toEqual(['Deep/Src/File.pa.yaml']);
  });

  it('strips only one leading Src segment when they stack', () => {
    mkdirSync(join(appRoot, 'Src', 'Src'), { recursive: true });
    writeFileSync(join(appRoot, 'Src', 'Src', 'App.pa.yaml'), SCREEN);

    const result = resolveIntake(appRoot);

    expect(result.files.map(file => file.id)).toEqual(['Src/App.pa.yaml']);
  });

  it.skipIf(!fileSymlinkSupport.available)(
    'skips a symlinked file without reading it',
    () => {
      writeFileSync(join(appRoot, 'A.pa.yaml'), SCREEN);
      symlinkSync(join(appRoot, 'A.pa.yaml'), join(appRoot, 'B.pa.yaml'), 'file');

      const result = resolveIntake(appRoot);

      expect(result.files.map(file => file.id)).toEqual(['A.pa.yaml']);
      expect(result.limitations).toContainEqual(expect.objectContaining({
        kind: 'skipped-symlink',
        source: 'filesystem',
        detail: 'B.pa.yaml',
      }));
    },
  );

  it('refuses case-colliding canonical ids on any filesystem', () => {
    mkdirSync(join(appRoot, 'Src'), { recursive: true });
    writeFileSync(join(appRoot, 'Src', 'App.pa.yaml'), SCREEN);
    writeFileSync(join(appRoot, 'App.pa.yaml'), SCREEN);

    expect(() => resolveIntake(appRoot)).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'duplicate-canonical-id',
    }));
  });

});

describe('msapp intake', () => {
  const entry = (path: string, data: string | Buffer): ZipEntryFixture => ({ path, data });
  const SRC_APP = entry('Src\\App.pa.yaml', SCREEN);

  const msappOf = (entries: ZipEntryFixture[], fileName = 'app.msapp') => {
    const target = join(root, fileName);
    writeFileSync(target, buildZip(entries));
    return target;
  };

  it('reads Src/**/*.pa.yaml with canonical stripped ids, hashes, and archive metadata', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Src/Screens/Main.pa.yaml', SCREEN),
      entry('Header.json', '{}'),
    ]));

    expect(result.source_kind).toBe('msapp');
    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml', 'Screens/Main.pa.yaml']);
    expect(result.files[0].sha256).toBe(createHash('sha256').update(SCREEN).digest('hex'));
    expect(result.app_name).toEqual({ value: 'app', resolved_by: 'archive-entry' });
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-absent',
      source: 'datasources',
    }));
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-absent',
      source: 'connections',
    }));
    expect(result.fingerprint_basis).toBe('msapp/src-stripped/v1');
  });

  it('excludes exactly _EditorState.pa.yaml while retaining other underscore-prefixed source', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Src/Screens/_EditorState.pa.yaml', 'EditorState:\n  ScreensOrder: []\n'),
      entry('Src/_Authored.pa.yaml', SCREEN),
    ]));

    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml', '_Authored.pa.yaml']);
    expect(result.limitations.some(limitation => limitation.detail.includes('_EditorState'))).toBe(false);
  });

  it('an archive with only EditorState furniture plus legacy source is dialect-only, not mixed', () => {
    expect(() => resolveIntake(msappOf([
      entry('Src/_EditorState.pa.yaml', 'EditorState:\n  ScreensOrder: []\n'),
      entry('Src/App.fx.yaml', 'x'),
    ]))).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'unsupported-msapp-dialect',
    }));
  });

  it('omits a datasource whose own identifier fields disagree, never picking one', () => {
    const ds = JSON.stringify({ DataSources: [{
      Name: 'Cases',
      Type: 'ConnectedDataSourceInfo',
      ConnectorId: '/apis/shared_sharepointonline',
      ApiId: '/apis/shared_sql',
    }] });
    const result = resolveIntake(msappOf([SRC_APP, entry('References/DataSources.json', ds)]));

    expect(result.datasources).toEqual({});
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-unsupported',
      source: 'datasources',
      detail: expect.stringContaining('Cases'),
    }));
  });

  it('refuses a legacy .fx.yaml-only msapp with the exact dialect error', () => {
    expect(() => resolveIntake(msappOf([
      entry('Src/App.fx.yaml', 'x'),
    ]))).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'unsupported-msapp-dialect',
      message: 'unsupported msapp source format (legacy .fx.yaml) — re-export from current Studio',
    }));
  });

  it('mixed dialect: takes .pa.yaml and reports the ignored legacy count', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Src/Old.fx.yaml', 'x'),
      entry('Src/Old2.fx.yaml', 'x'),
    ]));

    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'skipped-legacy-source',
      source: 'dialect',
      detail: expect.stringContaining('2'),
    }));
  });

  it('decodes the real base64 Properties.json Name shape', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Properties.json', JSON.stringify({
        Name: 'Q29udG9zbyBGaWVsZCBTZXJ2aWNl.msapp',
      })),
    ]));

    expect(result.app_name).toEqual({
      value: 'Contoso Field Service',
      resolved_by: 'manifest',
    });
  });

  it('uses a plain-text Properties.json Name as manifest metadata', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Properties.json', JSON.stringify({ Name: 'FieldService' })),
    ]));

    expect(result.app_name).toEqual({ value: 'FieldService', resolved_by: 'manifest' });
  });

  it('falls back to the archive filename for an invalid encoded manifest Name', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Properties.json', JSON.stringify({ Name: '%%%not-base64%%%.msapp' })),
    ], 'Fallback.msapp'));

    expect(result.app_name).toEqual({ value: 'Fallback', resolved_by: 'archive-entry' });
  });

  it('maps only exact supported datasource metadata and aggregates unsupported shapes', () => {
    const datasources = JSON.stringify({ DataSources: [
      { Name: 'Accounts', Type: 'NativeCDSDataSourceInfo' },
      { Name: 'Orders', Type: 'ConnectedDataSourceInfo', ConnectorId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline' },
      { Name: 'Warehouse', Type: 'ConnectedDataSourceInfo', ApiId: '/apis/SHARED_SQL' },
      { Name: 'Workbook', Type: 'ConnectedDataSourceInfo', ConnectorName: 'shared_excelonlinebusiness' },
      { Name: 'Contacts', Type: 'ConnectedDataSourceInfo', ConnectorType: 'shared_commondataserviceforapps' },
      { Name: 'ChoiceFurniture', Type: 'OptionSetInfo' },
      { Name: 'ViewFurniture', Type: 'ViewInfo' },
      { Name: 'StaticFurniture', Type: 'StaticDataSourceInfo' },
      { Name: 'MysteryA', Type: 'ZetaType' },
      { Name: 'MysteryB', Type: 'AlphaType' },
      { Name: 'MysteryC', Type: 'ZetaType' },
      { Name: 'Conflict', Type: 'ConnectedDataSourceInfo', ConnectorId: '/apis/shared_sql' },
      { Name: 'Conflict', Type: 'ConnectedDataSourceInfo', ConnectorId: '/apis/shared_sharepointonline' },
    ] });
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('References/DataSources.json', datasources),
      entry('Connections/shared.json', '{}'),
    ]));

    expect(Object.getPrototypeOf(result.datasources)).toBeNull();
    expect(result.datasources).toEqual({
      Accounts: 'dataverse',
      Contacts: 'dataverse',
      Orders: 'sharepoint',
      Warehouse: 'sql',
      Workbook: 'excel',
    });
    expect(result.limitations.filter(limitation => (
      limitation.kind === 'metadata-unsupported'
      && limitation.source === 'datasources'
      && limitation.detail.includes('AlphaType')
    ))).toHaveLength(1);
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-unsupported',
      source: 'datasources',
      detail: expect.stringContaining('Conflict'),
    }));
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-unsupported',
      source: 'connections',
    }));
    expect(result.limitations).not.toContainEqual(expect.objectContaining({
      kind: 'metadata-absent',
      source: 'connections',
    }));
    expect(result.limitations.some(limitation => (
      limitation.detail.includes('OptionSetInfo')
      || limitation.detail.includes('ViewInfo')
      || limitation.detail.includes('StaticDataSourceInfo')
    ))).toBe(false);
  });

  it('treats malformed manifest and datasource JSON as source-scoped limitations', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Properties.json', '{ not json'),
      entry('References/DataSources.json', '{ also not json'),
    ], 'Malformed.msapp'));

    expect(result.app_name).toEqual({ value: 'Malformed', resolved_by: 'archive-entry' });
    expect(result.datasources).toEqual({});
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-malformed',
      source: 'manifest',
    }));
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-malformed',
      source: 'datasources',
    }));
  });

  it('never derives a backend from URL substrings (the sqlteam trap)', () => {
    const datasources = JSON.stringify({ DataSources: [
      {
        Name: 'Cases',
        Type: 'ConnectedDataSourceInfo',
        DatasetName: 'https://contoso.sharepoint.com/sites/sqlteam',
      },
    ] });
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('References/DataSources.json', datasources),
    ]));

    expect(result.datasources).toEqual({});
    expect(result.limitations.some(limitation => (
      limitation.kind === 'metadata-unsupported'
      && limitation.source === 'datasources'
    ))).toBe(true);
  });

  it('refuses a recognizable msapp with no Src/*.pa.yaml as usage/no-app-source', () => {
    expect(() => resolveIntake(msappOf([
      entry('Properties.json', JSON.stringify({ Name: 'Empty' })),
    ]))).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'no-app-source',
    }));
  });

  it('cross-intake fingerprint equality: identical directory and msapp content have identical ids and hashes', () => {
    mkdirSync(join(appRoot, 'Src', 'Screens'), { recursive: true });
    writeFileSync(join(appRoot, 'Src', 'App.pa.yaml'), SCREEN);
    writeFileSync(join(appRoot, 'Src', 'Screens', 'Main.pa.yaml'), `\ufeff${SCREEN}`);
    const directoryResult = resolveIntake(appRoot);
    const msappResult = resolveIntake(msappOf([
      SRC_APP,
      entry('Src/Screens/Main.pa.yaml', `\ufeff${SCREEN}`),
    ]));

    expect(directoryResult.files.map(({ id, sha256 }) => ({ id, sha256 })))
      .toEqual(msappResult.files.map(({ id, sha256 }) => ({ id, sha256 })));
  });

  it('does not absorb a .pa.yaml entry outside Src/', () => {
    const result = resolveIntake(msappOf([
      SRC_APP,
      entry('Other/Stray.pa.yaml', SCREEN),
    ]));

    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
  });

  it('does not classify harmless CanvasApps directory furniture as a solution', () => {
    const result = resolveIntake(msappOf([
      entry('CanvasApps/furniture/', ''),
      SRC_APP,
    ]));

    expect(result.source_kind).toBe('msapp');
    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
  });

  it('enforces archive caps and wraps ZipError and non-ZipError failures with typed reasons', () => {
    const valid = msappOf([SRC_APP], 'valid.msapp');
    expect(() => resolveIntake(valid, { maxContainerBytes: 16 })).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'container-cap',
    }));
    expect(() => resolveIntake(valid, { maxInflatedBytes: 1 })).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'size-cap',
    }));
    expect(() => resolveIntake(valid, { maxInflatedBytes: -1 })).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'unexpected-archive-error',
    }));

    const corrupt = join(root, 'corrupt.msapp');
    writeFileSync(corrupt, buildZip([{ ...SRC_APP, corruptCrc: true }]));
    expect(() => resolveIntake(corrupt)).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'crc-mismatch',
    }));
  });
});

describe('solution intake', () => {
  const entry = (path: string, data: string | Buffer): ZipEntryFixture => ({ path, data });
  const MSAPP = (manifestName?: string, sourcePath = 'Src/App.pa.yaml') => buildZip([
    entry(sourcePath, SCREEN),
    ...(manifestName === undefined
      ? []
      : [entry('Properties.json', JSON.stringify({ Name: manifestName }))]),
  ]);
  const candidate = (
    id: string,
    manifestName?: string,
    sourcePath?: string,
  ): ZipEntryFixture => entry(`CanvasApps/${id}`, MSAPP(manifestName, sourcePath));
  const solutionOf = (entries: ZipEntryFixture[]) => {
    const target = join(root, 'solution.zip');
    writeFileSync(target, buildZip(entries));
    return target;
  };

  it('resolves the only direct CanvasApps/*.msapp candidate and uses its manifest identity', () => {
    const result = resolveIntake(solutionOf([
      candidate('crbf9_portal_hash_DocumentUri.MSAPP', 'Technician Portal'),
      entry('CanvasApps/crbf9_portal_hash_DocumentUri_identity.json', '{}'),
      entry('CanvasApps/crbf9_portal_hash_DocumentUri_BackgroundImageUri', 'ignored'),
      candidate('nested/ignored.msapp', 'Nested App', 'Src/Nested.pa.yaml'),
      entry('Other/ignored.msapp', MSAPP('Other App', 'Src/Other.pa.yaml')),
    ]));

    expect(result.source_kind).toBe('solution');
    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
    expect(result.app_name).toEqual({ value: 'Technician Portal', resolved_by: 'manifest' });
    expect(result.fingerprint_basis).toBe('solution/Technician Portal/src-stripped/v1');
  });

  it('a whole-body CDATA-wrapped ConnectionReferences is unsupported, never an authoritative empty', () => {
    const populated = JSON.stringify({ ref1: { ConnectorId: '/apis/shared_sharepointonline' } });
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'App'),
      entry('customizations.xml', `<ImportExportXml><ConnectionReferences><![CDATA[${populated}]]></ConnectionReferences></ImportExportXml>`),
    ]));

    expect(result.connections).toEqual([]);
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-unsupported',
      source: 'customizations',
    }));
  });

  it('a fully commented-out ConnectionReferences body still reads as genuinely empty', () => {
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'App'),
      entry('customizations.xml', '<ImportExportXml><ConnectionReferences><!-- {"x": 1} --></ConnectionReferences></ImportExportXml>'),
    ]));

    expect(result.connections).toEqual([]);
    expect(result.limitations.some(l => l.source === 'customizations')).toBe(false);
  });

  it('a plain msapp is never routed down the solution path by the discriminator', () => {
    const target = join(root, 'plain.msapp');
    writeFileSync(target, buildZip([
      entry('Src/App.pa.yaml', SCREEN),
      entry('Properties.json', JSON.stringify({ Name: 'Plain App' })),
      entry('References/DataSources.json', JSON.stringify({ DataSources: [] })),
    ]));

    const result = resolveIntake(target);
    expect(result.source_kind).toBe('msapp');
    expect(result.app_name).toEqual({ value: 'Plain App', resolved_by: 'manifest' });
  });

  it('reports usage/no-app-source when a recognized solution has no app candidate', () => {
    const target = solutionOf([
      entry('solution.xml', '<ImportExportXml />'),
      entry('CanvasApps/app_identity.json', '{}'),
      entry('Other/not-a-candidate.msapp', MSAPP('Other App')),
    ]);

    expect(() => resolveIntake(target)).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'no-app-source',
    }));
  });

  it('demands app selection for multiple candidates and lists their ids', () => {
    const target = solutionOf([
      candidate('machine_a.msapp', 'Alpha'),
      candidate('machine_b.msapp', 'Beta'),
    ]);

    expect(() => resolveIntake(target)).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'app-selection-required',
      message: expect.stringContaining('machine_a.msapp'),
    }));
    expect(() => resolveIntake(target)).toThrowError(expect.objectContaining({
      message: expect.stringContaining('machine_b.msapp'),
    }));
  });

  it('selects against resolved app names: exact first, otherwise case-insensitive unique', () => {
    const exactTarget = solutionOf([
      candidate('first.msapp', 'Portal', 'Src/Exact.pa.yaml'),
      candidate('second.msapp', 'PORTAL', 'Src/Upper.pa.yaml'),
    ]);
    expect(resolveIntake(exactTarget, { appName: 'Portal' }).files.map(file => file.id))
      .toEqual(['Exact.pa.yaml']);

    const foldedTarget = solutionOf([
      candidate('first.msapp', 'Alpha', 'Src/Alpha.pa.yaml'),
      candidate('second.msapp', 'Beta', 'Src/Beta.pa.yaml'),
    ]);
    const result = resolveIntake(foldedTarget, { appName: 'bEtA' });
    expect(result.files.map(file => file.id)).toEqual(['Beta.pa.yaml']);
    expect(result.app_name).toEqual({ value: 'Beta', resolved_by: 'manifest' });
    expect(result.fingerprint_basis).toBe('solution/Beta/src-stripped/v1');
  });

  it('selects lazily after manifest peeks and never inflates an unselected sibling payload', () => {
    const selected = MSAPP('Healthy', 'Src/Healthy.pa.yaml');
    const unrelatedCorrupt = buildZip([
      entry('Properties.json', JSON.stringify({ Name: 'Unrelated' })),
      { path: 'Src/Broken.pa.yaml', data: SCREEN, corruptCrc: true },
    ]);
    const target = solutionOf([
      entry('CanvasApps/healthy.msapp', selected),
      entry('CanvasApps/unrelated.msapp', unrelatedCorrupt),
    ]);

    expect(resolveIntake(target, { appName: 'Healthy' }).files.map(file => file.id))
      .toEqual(['Healthy.pa.yaml']);
    expect(() => resolveIntake(target, { appName: 'Unrelated' }))
      .toThrowError(expect.objectContaining({ code: 'infra', reason: 'crc-mismatch' }));
  });

  it('refuses to guess when any candidate manifest peek fails', () => {
    const unreadableManifest = buildZip([
      { path: 'Properties.json', data: JSON.stringify({ Name: 'Unknown' }), corruptCrc: true },
      entry('Src/Unknown.pa.yaml', SCREEN),
    ]);
    const target = solutionOf([
      candidate('healthy.msapp', 'Healthy', 'Src/Healthy.pa.yaml'),
      entry('CanvasApps/unreadable.msapp', unreadableManifest),
    ]);

    expect(() => resolveIntake(target, { appName: 'Healthy' }))
      .toThrowError(expect.objectContaining({ code: 'infra', reason: 'app-selection-indeterminate' }));
  });

  it('refuses to guess when any candidate manifest identity is absent or unusable', () => {
    const unusableManifests: ZipEntryFixture[][] = [
      [],
      [entry('Properties.json', '{ not json')],
      [entry('Properties.json', JSON.stringify({ Name: 42 }))],
      [entry('Properties.json', JSON.stringify({ Name: '' }))],
      [entry('Properties.json', JSON.stringify({ Name: '%%%not-base64%%%.msapp' }))],
    ];

    for (const manifestEntries of unusableManifests) {
      const indeterminate = buildZip([
        ...manifestEntries,
        entry('Src/Unknown.pa.yaml', SCREEN),
      ]);
      const target = solutionOf([
        candidate('healthy.msapp', 'Healthy', 'Src/Healthy.pa.yaml'),
        entry('CanvasApps/indeterminate.msapp', indeterminate),
      ]);

      expect(() => resolveIntake(target, { appName: 'Healthy' }))
        .toThrowError(expect.objectContaining({
          code: 'infra',
          reason: 'app-selection-indeterminate',
        }));
    }
  });

  it('does not spend the shared solution budget on unrelated outer payloads', () => {
    const app = MSAPP('Healthy', 'Src/Healthy.pa.yaml');
    const target = solutionOf([
      entry('CanvasApps/healthy.msapp', app),
      entry('WebResources/unrelated.bin', Buffer.alloc(32 * 1024, 0x41)),
    ]);
    const selectedOnlyBudget = app.length
      + Buffer.byteLength(SCREEN)
      + Buffer.byteLength(JSON.stringify({ Name: 'Healthy' }))
      + 128;

    expect(resolveIntake(target, {
      appName: 'Healthy',
      maxInflatedBytes: selectedOnlyBudget,
    }).files.map(file => file.id)).toEqual(['Healthy.pa.yaml']);
  });

  it('classifies the outer archive before inflating root msapp-layout payloads', () => {
    const app = MSAPP('Healthy', 'Src/Healthy.pa.yaml');
    const target = solutionOf([
      entry('Src/outer-furniture.pa.yaml', Buffer.alloc(32 * 1024, 0x41)),
      entry('Properties.json', JSON.stringify({ Name: 'Outer furniture' })),
      entry('CanvasApps/healthy.msapp', app),
    ]);
    const selectedOnlyBudget = app.length
      + Buffer.byteLength(SCREEN)
      + Buffer.byteLength(JSON.stringify({ Name: 'Healthy' }))
      + 128;

    expect(resolveIntake(target, {
      appName: 'Healthy',
      maxInflatedBytes: selectedOnlyBudget,
    }).files.map(file => file.id)).toEqual(['Healthy.pa.yaml']);
  });

  it('reports unknown names as not found and duplicate folded identities as ambiguous', () => {
    const target = solutionOf([
      candidate('first.msapp', 'Portal'),
      candidate('second.msapp', 'PORTAL'),
    ]);

    expect(() => resolveIntake(target, { appName: 'missing' })).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'app-not-found',
      message: expect.stringContaining('first.msapp'),
    }));
    expect(() => resolveIntake(target, { appName: 'portal' })).toThrowError(expect.objectContaining({
      code: 'usage',
      reason: 'app-selection-required',
      message: expect.stringContaining('second.msapp'),
    }));

    const duplicateExact = solutionOf([
      candidate('duplicate-a.msapp', 'Portal'),
      candidate('duplicate-b.msapp', 'Portal'),
    ]);
    expect(() => resolveIntake(duplicateExact, { appName: 'Portal' }))
      .toThrowError(expect.objectContaining({
        code: 'usage',
        reason: 'app-selection-required',
        message: expect.stringContaining('duplicate-a.msapp'),
      }));
  });

  it('parses populated JSON ConnectionReferences into a sorted connector inventory only', () => {
    const references = JSON.stringify({
      first: { ConnectorId: '/providers/Microsoft.PowerApps/apis/shared_sql' },
      second: { ApiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline' },
      third: { connectorId: 'SHARED_SQL' },
    });
    const customizations = `<ImportExportXml><ConnectionReferences>${references}</ConnectionReferences></ImportExportXml>`;
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry('customizations.xml', customizations),
    ]));

    expect(result.connections).toEqual([
      { connector_type: 'shared_sharepointonline', count: 1 },
      { connector_type: 'shared_sql', count: 2 },
    ]);
    expect(result.datasources).toEqual({});
    expect(result.limitations.some(limitation => limitation.source === 'customizations')).toBe(false);
  });

  it('treats empty JSON or whitespace ConnectionReferences as authoritative empty metadata', () => {
    for (const body of ['{}', '  \n  ']) {
      const customizations = `<ImportExportXml><ConnectionReferences>${body}</ConnectionReferences></ImportExportXml>`;
      const result = resolveIntake(solutionOf([
        candidate('a.msapp', 'Portal'),
        entry('customizations.xml', customizations),
      ]));

      expect(result.connections).toEqual([]);
      expect(result.limitations.some(limitation => limitation.source === 'customizations')).toBe(false);
    }
  });

  it('supports the legacy nested-XML connectionreference shape as a secondary matcher', () => {
    const customizations = `<ImportExportXml><ConnectionReferences>
      <connectionreference connectionreferencelogicalname="contoso_sharepoint">
        <connectorid>/providers/Microsoft.PowerApps/apis/shared_sharepointonline</connectorid>
      </connectionreference>
    </ConnectionReferences></ImportExportXml>`;
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry('customizations.xml', customizations),
    ]));

    expect(result.connections).toEqual([
      { connector_type: 'shared_sharepointonline', count: 1 },
    ]);
    expect(result.datasources).toEqual({});
  });

  it('reports unsupported and malformed populated customizations without guessing', () => {
    const unsupported = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry(
        'customizations.xml',
        '<ImportExportXml><ConnectionReferences>{"one":{"Name":"not a connector id"}}</ConnectionReferences></ImportExportXml>',
      ),
    ]));
    expect(unsupported.connections).toEqual([]);
    expect(unsupported.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-unsupported',
      source: 'customizations',
    }));

    const malformed = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry(
        'customizations.xml',
        '<ImportExportXml><ConnectionReferences>{ not json</ConnectionReferences></ImportExportXml>',
      ),
    ]));
    expect(malformed.connections).toEqual([]);
    expect(malformed.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-malformed',
      source: 'customizations',
    }));
  });

  it('does not extract connector ids from comments or CDATA', () => {
    const customizations = `<ImportExportXml><ConnectionReferences>
      <connectionreference>
        <connectorid>/providers/Microsoft.PowerApps/apis/shared_sql</connectorid>
      </connectionreference>
      <!-- <connectionreference><connectorid>/apis/shared_sharepointonline</connectorid></connectionreference> -->
      <![CDATA[<connectionreference><connectorid>/apis/shared_excelonlinebusiness</connectorid></connectionreference>]]>
    </ConnectionReferences></ImportExportXml>`;
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry('customizations.xml', customizations),
    ]));

    expect(result.connections).toEqual([{ connector_type: 'shared_sql', count: 1 }]);
  });

  it('treats a namespaced ConnectionReferences variant as unsupported, never as guessed metadata', () => {
    const customizations = `<ImportExportXml xmlns:ns="urn:test"><ns:ConnectionReferences>
      <ns:connectionreference><ns:connectorid>/apis/shared_sql</ns:connectorid></ns:connectionreference>
    </ns:ConnectionReferences></ImportExportXml>`;
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry('customizations.xml', customizations),
    ]));

    expect(result.connections).toEqual([]);
    expect(result.datasources).toEqual({});
    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-unsupported',
      source: 'customizations',
    }));
  });

  it('reports metadata-absent when the solution has no customizations.xml', () => {
    const result = resolveIntake(solutionOf([candidate('a.msapp', 'Portal')]));

    expect(result.limitations).toContainEqual(expect.objectContaining({
      kind: 'metadata-absent',
      source: 'customizations',
    }));
  });

  it('ignores unrelated nested archives instead of recursing outside the declared graph', () => {
    const result = resolveIntake(solutionOf([
      candidate('a.msapp', 'Portal'),
      entry('other/random.zip', buildZip([entry('Src/Stray.pa.yaml', SCREEN)])),
      entry('Other/also-not-a-candidate.msapp', MSAPP('Other App', 'Src/Other.pa.yaml')),
    ]));

    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
  });

  it('shares one inflation budget across the outer zip and nested msapp', () => {
    const msapp = MSAPP();
    const target = solutionOf([entry('CanvasApps/a.msapp', msapp)]);
    const budget = msapp.length + 16;

    expect(() => resolveIntake(target, { maxInflatedBytes: budget }))
      .toThrowError(expect.objectContaining({ code: 'infra', reason: 'size-cap' }));
    expect(resolveIntake(target, { maxInflatedBytes: 64 * 1024 * 1024 }).source_kind)
      .toBe('solution');
  });

  it('surfaces inner msapp ZipError reasons through the solution resolver', () => {
    const corruptMsapp = buildZip([
      { path: 'Src/App.pa.yaml', data: SCREEN, corruptCrc: true },
    ]);
    const target = solutionOf([entry('CanvasApps/a.msapp', corruptMsapp)]);

    expect(() => resolveIntake(target)).toThrowError(expect.objectContaining({
      code: 'infra',
      reason: 'crc-mismatch',
    }));
  });

  it('refuses an oversized root solution container before archive reads', () => {
    const target = solutionOf([candidate('a.msapp', 'Portal')]);

    expect(() => resolveIntake(target, { maxContainerBytes: 16 })).toThrowError(
      expect.objectContaining({ code: 'infra', reason: 'container-cap' }),
    );
  });
});

describe('archive classification boundary', () => {
  const entry = (path: string, data: string | Buffer): ZipEntryFixture => ({ path, data });
  const INNER = (sourcePath = 'Src/Inner.pa.yaml') => buildZip([
    entry(sourcePath, SCREEN),
    entry('Properties.json', JSON.stringify({ Name: 'Inner App' })),
  ]);
  const archiveOf = (entries: ZipEntryFixture[], fileName = 'archive.msapp') => {
    const target = join(root, fileName);
    writeFileSync(target, buildZip(entries));
    return target;
  };

  it('keeps a plain msapp carrying a CanvasApps/ non-msapp file classified as msapp', () => {
    const result = resolveIntake(archiveOf([
      entry('Src/App.pa.yaml', SCREEN),
      entry('Src/Screens/Main.pa.yaml', SCREEN),
      entry('CanvasApps/note.txt', 'not an app'),
    ]));

    expect(result.source_kind).toBe('msapp');
    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml', 'Screens/Main.pa.yaml']);
    expect(result.fingerprint_basis).toBe('msapp/src-stripped/v1');
  });

  it('keeps a plain msapp carrying a NON-direct CanvasApps/**/*.msapp classified as msapp', () => {
    const result = resolveIntake(archiveOf([
      entry('Src/App.pa.yaml', SCREEN),
      entry('CanvasApps/nested/inner.msapp', INNER()),
    ]));

    expect(result.source_kind).toBe('msapp');
    expect(result.files.map(file => file.id)).toEqual(['App.pa.yaml']);
    expect(result.fingerprint_basis).toBe('msapp/src-stripped/v1');
  });

  it('still classifies a DIRECT CanvasApps/*.msapp entry as the solution container shape', () => {
    const result = resolveIntake(archiveOf([
      entry('Src/App.pa.yaml', SCREEN),
      entry('CanvasApps/inner.msapp', INNER()),
    ], 'container.zip'));

    expect(result.source_kind).toBe('solution');
    expect(result.files.map(file => file.id)).toEqual(['Inner.pa.yaml']);
    expect(result.app_name).toEqual({ value: 'Inner App', resolved_by: 'manifest' });
  });
});

describe('connection identifier allowlist', () => {
  const entry = (path: string, data: string | Buffer): ZipEntryFixture => ({ path, data });
  const MSAPP = () => buildZip([
    entry('Src/App.pa.yaml', SCREEN),
    entry('Properties.json', JSON.stringify({ Name: 'Portal' })),
  ]);
  const solutionWith = (customizations: string) => {
    const target = join(root, 'allowlist-solution.zip');
    writeFileSync(target, buildZip([
      entry('CanvasApps/a.msapp', MSAPP()),
      entry('customizations.xml', customizations),
    ]));
    return target;
  };

  it('keeps only allowlisted connector identifiers and aggregates the rest as unsupported', () => {
    const references = JSON.stringify({
      first: { ConnectorId: '/providers/Microsoft.PowerApps/apis/shared_sql' },
      second: { ConnectorId: 'https://contoso.example/api/v2/orders' },
      third: { ApiId: '/providers/Microsoft.PowerApps/apis/shared_invented_backend' },
    });
    const result = resolveIntake(solutionWith(
      `<ImportExportXml><ConnectionReferences>${references}</ConnectionReferences></ImportExportXml>`,
    ));

    expect(result.connections).toEqual([{ connector_type: 'shared_sql', count: 1 }]);
    expect(result.limitations.filter(row => row.source === 'customizations')).toEqual([
      { kind: 'metadata-unsupported', source: 'customizations', detail: expect.any(String) },
    ]);
  });

  it('never mints a connection row from an unrecognized legacy connectorid segment', () => {
    const result = resolveIntake(solutionWith(`<ImportExportXml><ConnectionReferences>
      <connectionreference><connectorid>/apis/shared_sharepointonline</connectorid></connectionreference>
      <connectionreference><connectorid>https://contoso.example/orders</connectorid></connectionreference>
    </ConnectionReferences></ImportExportXml>`));

    expect(result.connections).toEqual([
      { connector_type: 'shared_sharepointonline', count: 1 },
    ]);
    expect(result.limitations.filter(row => row.source === 'customizations')).toEqual([
      { kind: 'metadata-unsupported', source: 'customizations', detail: expect.any(String) },
    ]);
  });

  it('keeps an empty ConnectionReferences body authoritative with no limitation', () => {
    const result = resolveIntake(solutionWith(
      '<ImportExportXml><ConnectionReferences>{}</ConnectionReferences></ImportExportXml>',
    ));

    expect(result.connections).toEqual([]);
    expect(result.limitations.some(row => row.source === 'customizations')).toBe(false);
  });
});
