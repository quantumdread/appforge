import { decodeClaimRef, sha256, validateVerificationDocument } from './verification-contracts.mjs';
import { VerificationEditError } from './verification-errors.mjs';

function unsupported(message) {
  throw new VerificationEditError('unsupported-shape', message);
}

function tableCells(line) {
  const value = line.trim();
  if (!value.startsWith('|') || !value.endsWith('|')) return null;
  const cells = [];
  let start = 1;
  for (let i = 1; i < value.length; i++) {
    if (value[i] === '\\') { i++; continue; }
    if (value[i] === '|') {
      cells.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  return start === value.length ? cells : null;
}

const isSeparator = cells => cells?.length >= 2
  && cells.every(cell => /^:?-{3,}:?$/u.test(cell));

const unsupportedTableShape = line => /^\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+$/u.test(line)
  || /^\s{4,}\|/u.test(line);

function hasUnescapedPipe(line) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === '|') return true;
  }
  return false;
}

export function readDisproofRows(text) {
  if (typeof text !== 'string' || text.includes('\u0000') || /\r(?!\n)/u.test(text)) {
    unsupported('The disproof register must be UTF-8 Markdown with LF or CRLF lines.');
  }
  const lines = text.split(/\r?\n/u);
  const rows = [];
  let fence = null;
  let columns = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length
        && /^ {0,3}(?:`+|~+)\s*$/u.test(line)) fence = null;
      continue;
    }
    if (marker) { fence = marker; columns = null; continue; }
    const unquoted = line.replace(/^ {0,3}(?:>[ \t]*)+/u, '');
    if (unquoted !== line && (/^\s*\|/u.test(unquoted) || unsupportedTableShape(unquoted))) {
      unsupported(`Blockquoted disproof tables are unsupported at line ${i + 1}.`);
    }
    if (unsupportedTableShape(line)) {
      unsupported(`Unsupported disproof table structure at line ${i + 1}.`);
    }
    const cells = tableCells(line);
    const next = tableCells(lines[i + 1] ?? '');
    if (cells && isSeparator(next)) {
      if (columns !== null) unsupported(`A disproof row cannot become another header inside the same table at line ${i + 1}.`);
      if (cells.length !== next.length || cells.some(cell => cell.length === 0)) {
        unsupported(`Ambiguous disproof table header at line ${i + 1}.`);
      }
      columns = cells.length;
      i++;
      continue;
    }
    if (cells && columns !== null && cells.length === columns && !isSeparator(cells)) {
      if (cells.every(cell => cell.length === 0)) unsupported(`Empty disproof table row at line ${i + 1}.`);
      rows.push({ line: i + 1, text: line, row_sha256: sha256(line) });
      continue;
    }
    if (cells || /^\s*\|/u.test(line) || (columns !== null && hasUnescapedPipe(line))) {
      unsupported(`Dangling or malformed disproof table row at line ${i + 1}.`);
    }
    columns = null;
  }
  if (fence) unsupported('The disproof register has an unclosed code fence.');
  return rows;
}

export function validateDisproofIndex(registerText, index) {
  try { validateVerificationDocument(index, 'appforge-disproof-index/1'); }
  catch { unsupported('The disproof index does not match its closed document contract.'); }
  const rows = readDisproofRows(registerText);
  const hashes = new Set(rows.map(row => row.row_sha256));
  if (hashes.size !== rows.length) {
    throw new VerificationEditError('ambiguous-target', 'Identical disproof rows cannot have distinct row identities.');
  }
  const indexed = new Set(index.entries.map(entry => entry.row_sha256));
  if (rows.some(row => !indexed.has(row.row_sha256))) {
    throw new VerificationEditError('source-drift', 'A substantive disproof row has no current companion-index record.');
  }
  if (index.entries.some(entry => !hashes.has(entry.row_sha256))) {
    throw new VerificationEditError('source-drift', 'A companion-index record no longer matches a current disproof row.');
  }
  return index;
}

export function matchDisproofs(index, claimRef) {
  let decoded;
  try {
    validateVerificationDocument(index, 'appforge-disproof-index/1');
    decoded = decodeClaimRef(claimRef);
  } catch { unsupported('The disproof index or claim reference is invalid.'); }
  return index.entries.filter(entry => entry.match.kind === 'exact'
    ? entry.match.claim_ref === claimRef
    : (decoded.kind === 'augmentation-property' || decoded.kind === 'dump-property')
      && decoded.control === entry.match.control && decoded.property.startsWith(entry.match.prefix));
}

const ADDITION_FIELDS = ['id', 'claim_ref', 'claim_text', 'date', 'evidence_class', 'evidence_summary', 'reason'];
const ADDITION_HEADING = '## Verification disproof additions';
const ADDITION_HEADER = '| Claim | Disproven | Evidence | Notes |';
const ADDITION_SEPARATOR = '|---|---|---|---|';

function additionIdentity(addition) {
  if (!addition || typeof addition !== 'object' || Array.isArray(addition)
    || Object.keys(addition).length !== ADDITION_FIELDS.length
    || Object.keys(addition).some(key => !ADDITION_FIELDS.includes(key))
    || ADDITION_FIELDS.some(key => typeof addition[key] !== 'string' || !/\S/u.test(addition[key]) || addition[key].includes('\u0000'))
    || !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(addition.id) || /[\r\n]/u.test(addition.id + addition.evidence_class)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(addition.date) || addition.date.length !== 10) {
    unsupported('A disproof addition must match its closed structured claim contract.');
  }
  const date = new Date(`${addition.date}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== addition.date) unsupported('A disproof date must be a real calendar date.');
  try { return decodeClaimRef(addition.claim_ref); }
  catch { unsupported('A disproof addition must carry an exact scoped claim reference.'); }
}

function markdownCell(value) {
  return value.replace(/\\/gu, '\\\\').replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/\|/gu, '\\|')
    .replace(/\r\n|\r|\n/gu, '<br>');
}

function appendRow(text, row) {
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const headings = [...text.matchAll(/^## Verification disproof additions[ \t]*\r?$/gmu)];
  if (headings.length > 1) throw new VerificationEditError('ambiguous-target', 'The disproof addition heading occurs more than once.');
  if (!headings.length) {
    const gap = text.length ? (text.endsWith('\n') ? newline : newline + newline) : '';
    return text + gap + [ADDITION_HEADING, '', ADDITION_HEADER, ADDITION_SEPARATOR, row, ''].join(newline);
  }
  const heading = headings[0];
  const start = heading.index + heading[0].length;
  const remainder = text.slice(start);
  const nextHeading = remainder.search(/^## /mu);
  const end = nextHeading < 0 ? text.length : start + nextHeading;
  const body = text.slice(start, end);
  const lines = body.split(/\r?\n/u).filter(line => line.trim().length);
  if (lines[0] !== ADDITION_HEADER || lines[1] !== ADDITION_SEPARATOR
    || lines.slice(2).some(line => tableCells(line)?.length !== 4)) {
    unsupported('The dedicated disproof addition section has an unsupported structure.');
  }
  const content = body.replace(/(?:\r?\n[ \t]*)+$/u, '');
  const offset = start + content.length;
  return text.slice(0, offset) + newline + row + text.slice(offset);
}

export function appendDisproofs(registerText, index, additions) {
  validateDisproofIndex(registerText, index);
  if (!Array.isArray(additions)) unsupported('Disproof additions must be an array.');
  const ids = new Set();
  for (const addition of additions) {
    additionIdentity(addition);
    if (ids.has(addition.id)) throw new VerificationEditError('ambiguous-target', 'Disproof addition IDs must be unique.');
    ids.add(addition.id);
  }
  const proposed = { ...index, entries: [...index.entries] };
  for (const addition of additions) {
    const decoded = additionIdentity(addition);
    const refs = decoded.kind === 'augmentation-property' || decoded.kind === 'dump-property'
      ? [`augmentation:${decoded.control}.${decoded.property}`, `dump-property:${decoded.control}.${decoded.property}`]
      : [addition.claim_ref];
    const row = `| ${markdownCell(`${addition.id}; ${addition.claim_text}; ${addition.claim_ref}`)} | ${addition.date} | ${markdownCell(`${addition.evidence_class}; ${addition.evidence_summary}`)} | ${markdownCell(addition.reason)} |`;
    const rowHash = sha256(row);
    const entries = refs.map(ref => ({
      id: `disproof-${sha256(JSON.stringify([addition.id, ref.split(':')[0]])).slice(0, 24)}`,
      match: { kind: 'exact', claim_ref: ref }, row_sha256: rowHash,
    }));
    const prior = entries.map(entry => proposed.entries.find(candidate => candidate.id === entry.id));
    if (prior.some(Boolean)) {
      if (prior.every((entry, i) => entry && entry.row_sha256 === rowHash
        && entry.match.kind === 'exact' && entry.match.claim_ref === refs[i])) continue;
      throw new VerificationEditError('disproof-conflict', 'A disproof ID already records different evidence or scope.');
    }
    if (refs.some(ref => matchDisproofs(proposed, ref).length)) {
      throw new VerificationEditError('disproof-conflict', 'An existing disproof already covers this scoped claim; it requires explicit review.');
    }
    registerText = appendRow(registerText, row);
    proposed.entries.push(...entries);
  }
  validateDisproofIndex(registerText, proposed);
  return { registerText, index: proposed };
}
