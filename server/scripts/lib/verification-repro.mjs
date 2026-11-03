import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sha256, validateVerificationClaim } from './verification-contracts.mjs';
import { VerificationEditError } from './verification-errors.mjs';
import { assertVerificationClaimCatalog } from './verification-catalog-claims.mjs';

/** Inspect the exact synthetic probe using its caller-selected analyzer artifact. */
export async function inspectVerificationRepro({ claim, yaml, analyzerArtifactPath, analyzerArtifactSha256 }) {
  validateVerificationClaim(claim);
  claim = structuredClone(claim);
  const mismatch = message => { throw new VerificationEditError('evidence-mismatch', message); };
  const unsupported = message => { throw new VerificationEditError('unsupported-shape', message); };
  if (typeof yaml !== 'string') mismatch('Repro must be UTF-8 text.');
  if (claim.target.kind === 'observation') unsupported('Document observations have no campaign probe.');
  const bytes = await readFile(analyzerArtifactPath);
  if (sha256(bytes) !== analyzerArtifactSha256) {
    throw new VerificationEditError('evidence-mismatch', 'Analyzer artifact bytes differ from the reviewed hash.');
  }
  // A rebuild at the same path must not reuse a module cached for older bytes.
  const artifactUrl = pathToFileURL(resolve(analyzerArtifactPath));
  artifactUrl.searchParams.set('verification-sha256', analyzerArtifactSha256);
  const analyzer = await import(artifactUrl.href);
  const catalog = analyzer.loadCatalog();
  assertVerificationClaimCatalog({ claim, catalog });
  const bundle = analyzer.walkPaYaml(yaml, 'VerificationScreen.pa.yaml');
  const nodes = analyzer.controlNodes(bundle);
  // The historical walker deliberately overwrites duplicate Control/Variant
  // fields. Count only structural keys at its already identified node offsets;
  // this is an ambiguity guard, not another YAML parser.
  const lines = yaml.split(/\r?\n/u);
  const clean = line => line.trim().replace(/\s+#.*$/u, '');
  const topLevel = lines.filter(line => line.trim() && !/^\s*#/u.test(line) && !/^\s/u.test(line));
  if (topLevel.length !== 1 || topLevel[0] !== 'Screens:') mismatch('Repro requires one canonical Screens section.');
  const atIndent = indent => lines.filter(line => line.trim() && !/^\s*#/u.test(line) && /^ */u.exec(line)[0].length === indent).map(clean);
  if (JSON.stringify(atIndent(2)) !== JSON.stringify(['VerificationScreen:']) ||
      JSON.stringify(atIndent(4)) !== JSON.stringify(['Children:'])) {
    mismatch('The canonical verification screen must own exactly one Children section.');
  }
  const capturedLines = new Set();
  lines.forEach((line, index) => {
    const wrapper = new Map([[0, 'Screens:'], [2, 'VerificationScreen:'], [4, 'Children:']]);
    if (wrapper.get(/^ */u.exec(line)[0].length) === clean(line)) capturedLines.add(index + 1);
  });
  if (lines.filter(line => /^\s*Control:/u.test(line)).length !== nodes.length ||
      lines.filter(line => /^\s*Variant:/u.test(line)).length !== nodes.filter(node => node.variant !== null).length) {
    mismatch('Repro contains duplicate or misplaced control or variant declarations.');
  }
  for (const node of nodes) {
    if (node.indent !== (node.parent ? node.parent.indent + 6 : 6)) mismatch('Probe ancestry must use the reviewed canonical nesting.');
    if (clean(lines[node.line - 1]) !== `- ${node.name}:`) mismatch('Probe names must use canonical sequence keys.');
    capturedLines.add(node.line);
    const fields = [];
    for (let index = node.line; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim() || /^\s*#/u.test(line)) continue;
      const indent = /^ */u.exec(line)[0].length;
      if (indent <= node.indent) break;
      if (indent === node.indent + 4) {
        fields.push({ text: clean(line), line: index + 1 });
        capturedLines.add(index + 1);
      }
    }
    const texts = fields.map(field => field.text);
    const controls = texts.filter(field => /^Control:/u.test(field));
    const variants = texts.filter(field => /^Variant:/u.test(field));
    if (controls.length !== 1 || controls[0] !== `Control: ${node.type}` ||
        variants.length > 1 || (variants.length === 1 && variants[0] !== `Variant: ${node.variant}`) ||
        texts.filter(field => field === 'Properties:').length > 1 ||
        texts.filter(field => field === 'Children:').length > 1 ||
        texts.some(field => ![...controls, ...variants, 'Properties:', 'Children:'].includes(field))) {
      mismatch('Repro control fields and structural sections must be canonical and unambiguous.');
    }
    for (const child of node.children) {
      if (fields.filter(field => field.line < child.line).at(-1)?.text !== 'Children:') {
        mismatch('Each declared child must belong to its parent\'s canonical Children section.');
      }
    }
    const propertyLines = new Set(node.properties.map(property => property.line));
    for (let index = node.line; index < lines.length; index++) {
      const line = lines[index];
      if (!line.trim() || /^\s*#/u.test(line)) continue;
      const indent = /^ */u.exec(line)[0].length;
      if (indent <= node.indent) break;
      if (indent === node.indent + 6 && fields.filter(field => field.line < index + 1).at(-1)?.text === 'Properties:' &&
          (!propertyLines.has(index + 1) || !/^[A-Za-z_][A-Za-z0-9_]*:/u.test(line.trim()))) {
        mismatch('Probe property keys must be canonical and fully captured by the pinned walker.');
      }
    }
    if (node.properties.some(property => /^ */u.exec(lines[property.line - 1])[0].length !== node.indent + 6)) {
      mismatch('Probe properties must use canonical direct property nesting.');
    }
    for (const property of node.properties) {
      capturedLines.add(property.line);
      if (!property.isBlockScalar) continue;
      // Only the walker's explicitly captured block-scalar span may contain
      // substantive continuation lines. Plain YAML folding is unsupported.
      for (let index = property.line; index < lines.length; index++) {
        if (!lines[index].trim()) continue;
        if (/^ */u.exec(lines[index])[0].length <= node.indent + 6) break;
        capturedLines.add(index + 1);
      }
    }
  }
  if (lines.some((line, index) => line.trim() && !/^\s*#/u.test(line) && !capturedLines.has(index + 1))) {
    mismatch('Repro contains scalar or structural content not fully captured by the pinned walker.');
  }
  if (bundle.app.length || bundle.componentDefs.length || bundle.screens.length !== 1 ||
      bundle.screens[0].name !== 'VerificationScreen' || !bundle.screens[0].line ||
      bundle.screens[0].roots.length !== 1 || nodes.length !== claim.ancestors.length + 1) {
    mismatch('Repro must contain exactly the declared VerificationScreen probe and ancestor chain.');
  }
  let cursor = bundle.screens[0].roots[0];
  for (const ancestor of claim.ancestors) {
    if (cursor.name !== ancestor.name || cursor.type !== ancestor.control ||
        cursor.authoredTypePinned || cursor.children.length !== 1) {
      mismatch('Repro ancestor chain differs from the reviewed claim.');
    }
    cursor = cursor.children[0];
  }
  if (cursor.name !== 'ctlProbe' || cursor.type !== claim.target.control ||
      cursor.authoredTypePinned || cursor.children.length) {
    mismatch('Repro target differs from the reviewed bare control.');
  }
  if (claim.target.kind === 'observed-variant') {
    if (cursor.variant !== claim.target.variant) mismatch('Repro variant differs from the reviewed claim.');
  } else {
    const targeted = cursor.properties.filter(property => property.name === claim.target.property);
    if (targeted.length !== 1 || targeted[0].value !== claim.target.property_value) {
      mismatch('Repro must contain the exact targeted property once with its reviewed value.');
    }
  }
  const result = analyzer.validateYaml(yaml, catalog, claim.local_lint_context);
  return {
    summary: result.summary,
    rule_ids: [...new Set(result.issues.map(issue => issue.rule).filter(rule => typeof rule === 'string'))].sort(),
  };
}
