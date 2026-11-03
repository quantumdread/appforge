import { createHash } from 'node:crypto';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { basename, join, relative } from 'node:path';
import {
  canonicalZipPath,
  createInflateBudget,
  MAX_CONTAINER_BYTES,
  readZipEntries,
  ZipError,
} from './zip-reader.mjs';

const CONNECTOR_BACKENDS = new Map([
  ['shared_sharepointonline', 'sharepoint'],
  ['shared_sql', 'sql'],
  ['shared_excelonlinebusiness', 'excel'],
  ['shared_commondataserviceforapps', 'dataverse'],
]);
const CONNECTOR_IDENTIFIER_FIELDS = new Set([
  'apiid',
  'connectorid',
  'connectorname',
  'connectortype',
]);
const SILENT_DATASOURCE_TYPES = new Set([
  'OptionSetInfo',
  'ViewInfo',
  'StaticDataSourceInfo',
]);

export class IntakeError extends Error {
  constructor(code, reason, message) {
    super(message);
    this.name = 'IntakeError';
    this.code = code;
    this.reason = reason;
  }
}

function compareLexically(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function filesystemError(error, targetPath) {
  const errorCode = error && typeof error === 'object' ? error.code : undefined;
  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return new IntakeError('usage', 'target-not-found', `Intake target was not found: ${targetPath}`);
  }
  if (errorCode === 'EACCES' || errorCode === 'EPERM' || errorCode === 'EIO') {
    return new IntakeError('infra', 'unreadable-target', `Intake target is unreadable: ${targetPath}`);
  }
  return new IntakeError('infra', 'unreadable-target', `Intake target could not be read: ${targetPath}`);
}

function inspectPath(targetPath) {
  try {
    return lstatSync(targetPath);
  } catch (error) {
    throw filesystemError(error, targetPath);
  }
}

function directoryEntries(targetPath) {
  try {
    return readdirSync(targetPath);
  } catch (error) {
    throw filesystemError(error, targetPath);
  }
}

function exactBytes(targetPath) {
  try {
    return readFileSync(targetPath);
  } catch (error) {
    throw filesystemError(error, targetPath);
  }
}

function exactStat(targetPath) {
  try {
    return statSync(targetPath);
  } catch (error) {
    throw filesystemError(error, targetPath);
  }
}

function canonicalSourceId(rootPath, filePath) {
  let canonical;
  try {
    canonical = canonicalZipPath(relative(rootPath, filePath));
  } catch (error) {
    if (error instanceof ZipError) {
      throw new IntakeError('infra', error.reason, error.message);
    }
    throw error;
  }
  return canonical.startsWith('Src/') ? canonical.slice('Src/'.length) : canonical;
}

function walkDirectory(rootPath, directoryPath, files, limitations) {
  for (const name of directoryEntries(directoryPath)) {
    const entryPath = join(directoryPath, name);
    const stat = inspectPath(entryPath);
    if (stat.isSymbolicLink()) {
      limitations.push({
        kind: 'skipped-symlink',
        source: 'filesystem',
        detail: canonicalSourceId(rootPath, entryPath),
      });
      continue;
    }
    if (stat.isDirectory()) {
      walkDirectory(rootPath, entryPath, files, limitations);
      continue;
    }
    if (!stat.isFile() || !name.endsWith('.pa.yaml')) continue;
    // Same Studio-furniture exclusion as archive intake, so the same app
    // fingerprints identically however it arrives (pac canvas unpack output
    // carries Src/_EditorState.pa.yaml on disk too).
    if (name === '_EditorState.pa.yaml') continue;

    const bytes = exactBytes(entryPath);
    files.push({
      id: canonicalSourceId(rootPath, entryPath),
      content: bytes.toString('utf8'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
}

function sortLimitations(limitations) {
  limitations.sort((left, right) => (
    compareLexically(left.kind, right.kind)
    || compareLexically(left.source, right.source)
    || compareLexically(left.detail, right.detail)
  ));
}

function resolveDirectory(targetPath) {
  const files = [];
  const limitations = [
    {
      kind: 'metadata-absent',
      source: 'datasources',
      detail: 'Directory intake carries no datasource export metadata',
    },
    {
      kind: 'metadata-absent',
      source: 'connections',
      detail: 'Directory intake carries no connection export metadata',
    },
  ];
  walkDirectory(targetPath, targetPath, files, limitations);

  const ids = new Set();
  for (const file of files) {
    const duplicateKey = file.id.toLowerCase();
    if (ids.has(duplicateKey)) {
      throw new IntakeError(
        'infra',
        'duplicate-canonical-id',
        `Multiple source files resolve to canonical id ${file.id}`,
      );
    }
    ids.add(duplicateKey);
  }

  if (files.length === 0) {
    throw new IntakeError('usage', 'no-app-source', 'Directory contains no .pa.yaml app source');
  }

  files.sort((left, right) => compareLexically(left.id, right.id));
  sortLimitations(limitations);
  return {
    source_kind: 'directory',
    app_name: { value: basename(targetPath), resolved_by: 'directory' },
    files,
    datasources: {},
    connections: [],
    limitations,
    fingerprint_basis: 'directory/src-stripped/v1',
  };
}

function wrapArchiveError(error) {
  if (error instanceof IntakeError) return error;
  if (error instanceof ZipError) {
    return new IntakeError('infra', error.reason, error.message);
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new IntakeError(
    'infra',
    'unexpected-archive-error',
    `Archive intake failed unexpectedly: ${detail}`,
  );
}

function archiveName(targetPath) {
  return basename(targetPath).replace(/\.msapp$/iu, '');
}

function pathBasename(entryPath) {
  const separator = entryPath.lastIndexOf('/');
  return separator === -1 ? entryPath : entryPath.slice(separator + 1);
}

function isPaYamlSource(entryPath) {
  return entryPath.startsWith('Src/') && entryPath.endsWith('.pa.yaml');
}

function isFxYamlSource(entryPath) {
  return entryPath.startsWith('Src/') && entryPath.endsWith('.fx.yaml');
}

function looksLikeMsapp(entries) {
  return entries.some(({ path }) => (
    path === 'Properties.json'
    || isPaYamlSource(path)
    || isFxYamlSource(path)
  ));
}

function entryAt(entries, expectedPath) {
  const key = expectedPath.toLowerCase();
  return entries.find(entry => entry.path.toLowerCase() === key);
}

function addMetadataLimitation(limitations, kind, source, detail) {
  limitations.push({ kind, source, detail });
}

function decodedManifestName(name) {
  if (!name.endsWith('.msapp')) return name;

  const encoded = name.slice(0, -'.msapp'.length);
  if (encoded.length === 0) return null;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) return null;
  const decoded = bytes.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(bytes)) return null;
  return decoded;
}

function resolveManifestName(entries, targetPath, limitations) {
  const fallback = { value: archiveName(targetPath), resolved_by: 'archive-entry' };
  const properties = entryAt(entries, 'Properties.json');
  if (!properties) return fallback;

  let manifest;
  try {
    manifest = JSON.parse(properties.bytes.toString('utf8'));
  } catch {
    addMetadataLimitation(
      limitations,
      'metadata-malformed',
      'manifest',
      'Properties.json is not valid JSON',
    );
    return fallback;
  }

  if (!manifest || typeof manifest !== 'object' || typeof manifest.Name !== 'string') {
    return fallback;
  }
  const value = decodedManifestName(manifest.Name);
  return value === null
    ? fallback
    : { value, resolved_by: 'manifest' };
}

function connectorBackend(datasource) {
  const backends = new Set();
  for (const [field, value] of Object.entries(datasource)) {
    if (!CONNECTOR_IDENTIFIER_FIELDS.has(field.toLowerCase()) || typeof value !== 'string') {
      continue;
    }
    const tokens = value.split('/').filter(Boolean);
    const identifier = (tokens.at(-1) ?? '').toLowerCase();
    const backend = CONNECTOR_BACKENDS.get(identifier);
    if (backend) backends.add(backend);
  }
  return backends.size === 1 ? [...backends][0] : null;
}

function recordDatasource(datasources, conflicts, name, backend) {
  if (conflicts.has(name)) return;
  if (!Object.hasOwn(datasources, name)) {
    datasources[name] = backend;
    return;
  }
  if (datasources[name] !== backend) {
    delete datasources[name];
    conflicts.add(name);
  }
}

function resolveDatasources(entries, limitations) {
  const datasources = Object.create(null);
  const metadata = entryAt(entries, 'References/DataSources.json');
  if (!metadata) {
    addMetadataLimitation(
      limitations,
      'metadata-absent',
      'datasources',
      'Msapp carries no References/DataSources.json metadata',
    );
    return datasources;
  }

  let document;
  try {
    document = JSON.parse(metadata.bytes.toString('utf8'));
  } catch {
    addMetadataLimitation(
      limitations,
      'metadata-malformed',
      'datasources',
      'References/DataSources.json is not valid JSON',
    );
    return datasources;
  }

  if (!document || typeof document !== 'object' || !Array.isArray(document.DataSources)) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'datasources',
      'References/DataSources.json does not contain a DataSources array',
    );
    return datasources;
  }

  const unknownTypes = new Set();
  const unsupportedBindings = new Set();
  const conflicts = new Set();
  for (const datasource of document.DataSources) {
    if (!datasource || typeof datasource !== 'object') {
      unknownTypes.add('<missing>');
      continue;
    }

    const { Name: name, Type: type } = datasource;
    if (SILENT_DATASOURCE_TYPES.has(type)) continue;
    if (type !== 'NativeCDSDataSourceInfo' && type !== 'ConnectedDataSourceInfo') {
      unknownTypes.add(typeof type === 'string' ? type : '<missing>');
      continue;
    }
    if (typeof name !== 'string' || name.length === 0) {
      unsupportedBindings.add('<unnamed>');
      continue;
    }

    const backend = type === 'NativeCDSDataSourceInfo'
      ? 'dataverse'
      : connectorBackend(datasource);
    if (!backend) {
      unsupportedBindings.add(name);
      continue;
    }
    recordDatasource(datasources, conflicts, name, backend);
  }

  if (unknownTypes.size > 0) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'datasources',
      `Unsupported datasource Type values: ${[...unknownTypes].sort(compareLexically).join(', ')}`,
    );
  }
  if (unsupportedBindings.size > 0) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'datasources',
      `Datasource bindings lack an exact supported connector identifier: ${[...unsupportedBindings].sort(compareLexically).join(', ')}`,
    );
  }
  if (conflicts.size > 0) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'datasources',
      `Conflicting datasource backend metadata: ${[...conflicts].sort(compareLexically).join(', ')}`,
    );
  }
  return datasources;
}

function resolveConnections(entries, limitations) {
  const connectionFiles = entries.filter(({ path }) => (
    path.startsWith('Connections/') && path.endsWith('.json')
  ));
  if (connectionFiles.length === 0) {
    addMetadataLimitation(
      limitations,
      'metadata-absent',
      'connections',
      'Msapp carries no Connections/*.json metadata',
    );
  } else {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'connections',
      'Connections/*.json is not parsed pending real-export adjudication',
    );
  }
  return [];
}

function resolveMsapp(targetPath, entries) {
  if (!looksLikeMsapp(entries)) {
    throw new IntakeError(
      'usage',
      'no-app-source',
      'Archive contains no recognizable msapp source or manifest',
    );
  }

  const legacyEntries = entries.filter(entry => isFxYamlSource(entry.path));
  const sourceEntries = entries.filter(entry => (
    isPaYamlSource(entry.path)
    && pathBasename(entry.path) !== '_EditorState.pa.yaml'
  ));
  if (sourceEntries.length === 0 && legacyEntries.length > 0) {
    throw new IntakeError(
      'infra',
      'unsupported-msapp-dialect',
      'unsupported msapp source format (legacy .fx.yaml) — re-export from current Studio',
    );
  }
  if (sourceEntries.length === 0) {
    throw new IntakeError('usage', 'no-app-source', 'Msapp contains no Src/**/*.pa.yaml app source');
  }

  const limitations = [];
  if (legacyEntries.length > 0) {
    limitations.push({
      kind: 'skipped-legacy-source',
      source: 'dialect',
      detail: `${legacyEntries.length} legacy .fx.yaml file(s) ignored`,
    });
  }

  const files = sourceEntries.map(entry => ({
    id: entry.path.slice('Src/'.length),
    content: entry.bytes.toString('utf8'),
    sha256: createHash('sha256').update(entry.bytes).digest('hex'),
  }));
  // Defensive only: the zip reader already refuses case-folded duplicate paths
  // archive-wide, and the literal-case Src/ prefix requirement means no two
  // surviving entries can collide after the strip. Kept as a cheap invariant.
  const ids = new Set();
  for (const file of files) {
    const duplicateKey = file.id.toLowerCase();
    if (ids.has(duplicateKey)) {
      throw new IntakeError(
        'infra',
        'duplicate-canonical-id',
        `Multiple source files resolve to canonical id ${file.id}`,
      );
    }
    ids.add(duplicateKey);
  }

  const appName = resolveManifestName(entries, targetPath, limitations);
  const datasources = resolveDatasources(entries, limitations);
  const connections = resolveConnections(entries, limitations);
  files.sort((left, right) => compareLexically(left.id, right.id));
  sortLimitations(limitations);
  return {
    source_kind: 'msapp',
    app_name: appName,
    files,
    datasources,
    connections,
    limitations,
    fingerprint_basis: 'msapp/src-stripped/v1',
  };
}

// The one archive shape that makes a root zip a solution container: a direct,
// non-directory `CanvasApps/<name>.msapp`. Any other `CanvasApps/` furniture
// (a sibling note, an identity json, a deeper nested archive) is content that a
// plain .msapp may legitimately carry, and must never reclassify the intake.
function directSolutionCandidateId(path) {
  if (!path.startsWith('CanvasApps/')) return null;
  const id = path.slice('CanvasApps/'.length);
  if (id.includes('/') || !id.toLowerCase().endsWith('.msapp')) return null;
  return id;
}

function looksLikeSolution(entries) {
  return entries.some(({ path, isDirectory }) => (
    isDirectory !== true
    && (
      path.toLowerCase() === 'customizations.xml'
      || path.toLowerCase() === 'solution.xml'
      || directSolutionCandidateId(path) !== null
    )
  ));
}

function solutionCandidates(entries) {
  const candidates = [];
  for (const entry of entries) {
    if (entry.isDirectory === true) continue;
    const id = directSolutionCandidateId(entry.path);
    if (id === null) continue;
    candidates.push({ id, entry });
  }
  candidates.sort((left, right) => compareLexically(left.id, right.id));
  return candidates;
}

function candidateList(candidates) {
  return candidates.map(({ id }) => id).join(', ');
}

// A connector identifier is recognized only when its last path segment is a
// declared connector type. Minting an inventory row from an arbitrary trailing
// segment (a bare URL, a GUID, a display name) would publish a guessed
// `state: 'available'` connection inventory; unrecognized segments are dropped
// and reported as an aggregated metadata limitation instead.
function connectorType(identifier) {
  const segments = identifier.trim().split('/').filter(Boolean);
  const type = segments.at(-1)?.trim().toLowerCase() ?? '';
  return CONNECTOR_BACKENDS.has(type) ? type : null;
}

function aggregateConnections(connectorTypes) {
  const counts = new Map();
  for (const type of connectorTypes) {
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([connector_type, count]) => ({ connector_type, count }))
    .sort((left, right) => compareLexically(left.connector_type, right.connector_type));
}

function connectorTypeFromReference(reference) {
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) return null;

  const types = new Set();
  for (const [field, value] of Object.entries(reference)) {
    if (!CONNECTOR_IDENTIFIER_FIELDS.has(field.toLowerCase()) || typeof value !== 'string') {
      continue;
    }
    const type = connectorType(value);
    if (type) types.add(type);
  }
  return types.size === 1 ? [...types][0] : null;
}

function jsonConnectionTypes(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  const types = [];
  let unrecognized = 0;
  for (const value of Object.values(document)) {
    const type = connectorTypeFromReference(value);
    if (!type) {
      unrecognized += 1;
      continue;
    }
    types.push(type);
  }
  return { types, unrecognized };
}

function finalizeConnections({ types, unrecognized }, limitations) {
  if (unrecognized > 0) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'customizations',
      `${unrecognized} connection reference(s) carry unrecognized connector identifiers`,
    );
  }
  return aggregateConnections(types);
}

function stripXmlComments(xml) {
  return xml.replace(/<!--[\s\S]*?-->/gu, '');
}

function stripXmlInertContent(xml) {
  return stripXmlComments(xml).replace(/<!\[CDATA\[[\s\S]*?\]\]>/gu, '');
}

function legacyConnectionTypes(body) {
  const references = [...body.matchAll(
    /<connectionreference\b[^>]*>([\s\S]*?)<\/connectionreference\s*>/giu,
  )];
  if (references.length === 0) return null;

  const types = [];
  let unrecognized = 0;
  for (const reference of references) {
    const identifier = reference[1].match(
      /<connectorid\b[^>]*>([\s\S]*?)<\/connectorid\s*>/iu,
    );
    const type = identifier ? connectorType(identifier[1]) : null;
    if (!type) {
      unrecognized += 1;
      continue;
    }
    types.push(type);
  }
  return { types, unrecognized };
}

function resolveCustomizations(entries, limitations) {
  const metadata = entryAt(entries, 'customizations.xml');
  if (!metadata) {
    addMetadataLimitation(
      limitations,
      'metadata-absent',
      'customizations',
      'Solution carries no customizations.xml metadata',
    );
    return [];
  }

  const rawXml = metadata.bytes.toString('utf8');
  const xml = stripXmlInertContent(rawXml);
  if (/<[A-Za-z_][\w.-]*:ConnectionReferences\b/iu.test(xml)) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'customizations',
      'Namespaced ConnectionReferences metadata is unsupported',
    );
    return [];
  }

  const section = xml.match(
    /<ConnectionReferences\b[^>]*>([\s\S]*?)<\/ConnectionReferences\s*>/iu,
  );
  if (!section) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'customizations',
      'customizations.xml has no supported ConnectionReferences section',
    );
    return [];
  }

  const body = section[1].trim();
  if (body.length === 0) {
    // A blank inventory must never look authoritative: if the section only
    // reads as empty because comment/CDATA stripping hollowed it out, the
    // export DID carry content we cannot interpret — say so.
    const rawSection = stripXmlComments(rawXml).match(
      /<ConnectionReferences\b[^>]*>([\s\S]*?)<\/ConnectionReferences\s*>/iu,
    );
    if (rawSection && rawSection[1].trim().length > 0) {
      addMetadataLimitation(
        limitations,
        'metadata-unsupported',
        'customizations',
        'ConnectionReferences content is entirely comment/CDATA-wrapped and was not interpreted',
      );
    }
    return [];
  }

  let document;
  try {
    document = JSON.parse(body);
  } catch {
    const legacy = legacyConnectionTypes(body);
    if (legacy) return finalizeConnections(legacy, limitations);
    addMetadataLimitation(
      limitations,
      'metadata-malformed',
      'customizations',
      'ConnectionReferences is neither valid JSON nor supported legacy XML',
    );
    return [];
  }

  const parsed = jsonConnectionTypes(document);
  if (!parsed) {
    addMetadataLimitation(
      limitations,
      'metadata-unsupported',
      'customizations',
      'ConnectionReferences JSON does not contain supported connector identifiers',
    );
    return [];
  }
  return finalizeConnections(parsed, limitations);
}

function resolveSolutionCandidate(candidate, budget) {
  const entries = readZipEntries(candidate.entry.bytes, {
    budget,
    include: ({ path }) => msappEntryUsedByIntake(path),
  });
  return resolveMsapp(candidate.id, entries);
}

function msappEntryUsedByIntake(path) {
  return path === 'Properties.json'
    || path === 'References/DataSources.json'
    || path.startsWith('Connections/')
    || path.startsWith('Src/');
}

function rootArchiveEntryUsedByIntake(path, isSolution) {
  if (!isSolution) return msappEntryUsedByIntake(path);
  if (path === 'customizations.xml' || path === 'solution.xml') return true;
  return directSolutionCandidateId(path) !== null;
}

function peekSolutionCandidate(candidate, budget) {
  try {
    const entries = readZipEntries(candidate.entry.bytes, {
      budget,
      include: ({ path }) => path === 'Properties.json',
    });
    const limitations = [];
    const appName = resolveManifestName(entries, candidate.id, limitations);
    if (appName.resolved_by !== 'manifest' || appName.value.length === 0) {
      throw new IntakeError(
        'infra',
        'manifest-identity-unavailable',
        `Solution app manifest identity is unavailable for ${candidate.id}`,
      );
    }
    return {
      candidate,
      entries,
      appName: appName.value,
      error: null,
    };
  } catch (error) {
    return { candidate, entries: [], appName: null, error };
  }
}

function resolvePeekedSolutionCandidate(peeked, budget) {
  const remaining = readZipEntries(peeked.candidate.entry.bytes, {
    budget,
    include: ({ path }) => path !== 'Properties.json' && msappEntryUsedByIntake(path),
  });
  return resolveMsapp(peeked.candidate.id, [...peeked.entries, ...remaining]);
}

function selectSolutionApp(candidates, appName, budget) {
  if (candidates.length === 0) {
    throw new IntakeError(
      'usage',
      'no-app-source',
      'Solution contains no CanvasApps/*.msapp app source',
    );
  }
  if (candidates.length > 1 && appName === undefined) {
    throw new IntakeError(
      'usage',
      'app-selection-required',
      `Solution contains multiple apps; select one of: ${candidateList(candidates)}`,
    );
  }

  if (appName === undefined) return resolveSolutionCandidate(candidates[0], budget);

  const peeked = candidates.map(candidate => peekSolutionCandidate(candidate, budget));
  if (peeked.some(candidate => candidate.error !== null)) {
    throw new IntakeError(
      'infra',
      'app-selection-indeterminate',
      'One or more solution app manifests could not be inspected; refusing to guess the selected app',
    );
  }

  const exact = peeked.filter(candidate => candidate.appName === appName);
  if (exact.length === 1) return resolvePeekedSolutionCandidate(exact[0], budget);
  if (exact.length > 1) {
    throw new IntakeError(
      'usage',
      'app-selection-required',
      `Multiple solution apps resolve to "${appName}": ${candidateList(exact.map(({ candidate }) => candidate))}`,
    );
  }

  const foldedName = appName.toLowerCase();
  const folded = peeked.filter(candidate => (
    typeof candidate.appName === 'string'
    && candidate.appName.toLowerCase() === foldedName
  ));
  if (folded.length === 1) return resolvePeekedSolutionCandidate(folded[0], budget);
  if (folded.length > 1) {
    throw new IntakeError(
      'usage',
      'app-selection-required',
      `Multiple solution apps case-fold to "${appName}": ${candidateList(folded.map(({ candidate }) => candidate))}`,
    );
  }

  throw new IntakeError(
    'usage',
    'app-not-found',
    `Solution app "${appName}" was not found; available candidates: ${candidateList(candidates)}`,
  );
}

function resolveSolution(entries, appName, budget) {
  const selected = selectSolutionApp(solutionCandidates(entries), appName, budget);
  const limitations = [...selected.limitations];
  const connections = resolveCustomizations(entries, limitations);
  sortLimitations(limitations);
  return {
    ...selected,
    source_kind: 'solution',
    connections,
    limitations,
    fingerprint_basis: `solution/${selected.app_name.value}/src-stripped/v1`,
  };
}

function resolveArchive(targetPath, appName, maxInflatedBytes, maxContainerBytes) {
  const containerSize = exactStat(targetPath).size;
  if (containerSize > (maxContainerBytes ?? MAX_CONTAINER_BYTES)) {
    throw new IntakeError(
      'infra',
      'container-cap',
      `Archive exceeds the ${maxContainerBytes ?? MAX_CONTAINER_BYTES} byte container cap`,
    );
  }

  try {
    const budget = createInflateBudget(maxInflatedBytes);
    let isSolution;
    const entries = readZipEntries(exactBytes(targetPath), {
      budget,
      include: ({ path }, archiveEntries) => {
        isSolution ??= looksLikeSolution(archiveEntries);
        return rootArchiveEntryUsedByIntake(path, isSolution);
      },
    });
    if (looksLikeSolution(entries)) return resolveSolution(entries, appName, budget);
    return resolveMsapp(targetPath, entries);
  } catch (error) {
    throw wrapArchiveError(error);
  }
}

export function resolveIntake(
  targetPath,
  { appName, maxInflatedBytes, maxContainerBytes } = {},
) {
  const stat = inspectPath(targetPath);
  if (stat.isDirectory()) return resolveDirectory(targetPath);
  if (stat.isFile()) {
    return resolveArchive(targetPath, appName, maxInflatedBytes, maxContainerBytes);
  }
  throw new IntakeError('usage', 'target-not-found', `Intake target is not a file or directory: ${targetPath}`);
}
