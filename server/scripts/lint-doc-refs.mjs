import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Return every Markdown filename cited by a LINT_RULES docRef declaration. */
export function lintRuleDocumentNames(source) {
  const documents = new Set();
  for (const declaration of source.matchAll(/\bdocRef:\s*'([^']+)'/gu)) {
    for (const reference of declaration[1].matchAll(/[A-Za-z0-9_./-]+\.md/gu)) {
      documents.add(basename(reference[0]));
    }
  }
  return documents;
}

/** Return every Markdown filename in one already-evaluated docRef string. */
export function documentNamesFromDocRef(docRef) {
  return new Set([...docRef.matchAll(/[A-Za-z0-9_./-]+\.md/gu)]
    .map(reference => basename(reference[0])));
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
export const LINT_SOURCE_FILE = resolve(REPO_ROOT, 'server/src/core/lint.ts');
const RULE_SOURCE_FILES = [
  LINT_SOURCE_FILE,
  resolve(REPO_ROOT, 'server/src/core/write-form-rules.ts'),
  resolve(REPO_ROOT, 'server/src/core/navigation-app-rules.ts'),
  resolve(REPO_ROOT, 'server/src/core/field-report-rules.ts'),
];
export const REQUIRED_REFERENCE_DOCS = new Set(RULE_SOURCE_FILES.flatMap(file => (
  [...lintRuleDocumentNames(readFileSync(file, 'utf8'))]
)));
