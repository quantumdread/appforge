import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type ReferenceKind =
  | 'type-import'
  | 'value-import'
  | 'export-from'
  | 'dynamic-import'
  | 'import-type-node'
  | 'require';

type ModuleReference = {
  file: string;
  kind: ReferenceKind;
  specifier: string | null;
  valueImports: string[];
};

type ImportViolation = ModuleReference & { reason: string };

const surveyRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'core',
  'survey',
);
const coreRoot = dirname(surveyRoot);

type PinnedModuleReference = Pick<ModuleReference, 'kind' | 'specifier' | 'valueImports'>;

const PINNED_CORE_IMPORTS: Readonly<Record<string, readonly PinnedModuleReference[]>> = {
  'fingerprint.ts': [
    { kind: 'type-import', specifier: './analyzer', valueImports: [] },
    { kind: 'type-import', specifier: './evidence', valueImports: [] },
    { kind: 'value-import', specifier: './sha256', valueImports: ['sha256', 'utf8Bytes'] },
  ],
  'sha256.ts': [],
  'rule-metadata.ts': [],
  'model.ts': [],
  'tokenizer.ts': [],
  'modernization-classification.ts': [
    { kind: 'type-import', specifier: './catalog', valueImports: [] },
    { kind: 'value-import', specifier: './formula-structure', valueImports: ['inspectFormulaStructure'] },
  ],
  'formula-structure.ts': [
    { kind: 'value-import', specifier: './tokenizer', valueImports: ['tokenizeFormula'] },
  ],
};

function filesUnder(directoryPath: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(directoryPath).sort()) {
    const path = join(directoryPath, name);
    if (statSync(path).isDirectory()) files.push(...filesUnder(path));
    else files.push(path);
  }
  return files;
}

function literalSpecifier(node: ts.Expression | undefined): string | null {
  return node && ts.isStringLiteralLike(node) ? node.text : null;
}

function importedValueNames(clause: ts.ImportClause | undefined): string[] {
  if (!clause || clause.isTypeOnly) return [];
  const names: string[] = [];
  if (clause.name) names.push('default');
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) names.push('*');
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    for (const element of clause.namedBindings.elements) {
      if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
    }
  }
  return names;
}

function moduleReferences(source: string, file: string): ModuleReference[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const references: ModuleReference[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      references.push({
        file,
        kind: statement.importClause?.isTypeOnly ? 'type-import' : 'value-import',
        specifier: literalSpecifier(statement.moduleSpecifier),
        valueImports: importedValueNames(statement.importClause),
      });
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      references.push({
        file,
        kind: 'export-from',
        specifier: literalSpecifier(statement.moduleSpecifier),
        valueImports: [],
      });
    } else if (
      ts.isImportEqualsDeclaration(statement)
      && ts.isExternalModuleReference(statement.moduleReference)
    ) {
      references.push({
        file,
        kind: 'require',
        specifier: literalSpecifier(statement.moduleReference.expression),
        valueImports: [statement.name.text],
      });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if (isDynamicImport || isRequire) {
        references.push({
          file,
          kind: isDynamicImport ? 'dynamic-import' : 'require',
          specifier: literalSpecifier(node.arguments[0]),
          valueImports: [],
        });
      }
    }
    // Inline import-type queries (`type X = import('../lint').Y`) are neither
    // statements nor call expressions; without this branch they bypass the
    // forbidden-module rule entirely (Task 1 review finding).
    if (ts.isImportTypeNode(node)) {
      const argument = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
      references.push({
        file,
        kind: 'import-type-node',
        specifier: argument && ts.isStringLiteralLike(argument) ? argument.text : null,
        valueImports: [],
      });
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(sourceFile, visit);

  return references;
}

function normalizedSpecifier(specifier: string): string {
  return specifier.replace(/\.(?:[cm]?ts|[cm]?js)$/u, '');
}

function referenceSignature(reference: PinnedModuleReference): string {
  return JSON.stringify([
    reference.kind,
    reference.specifier === null ? null : normalizedSpecifier(reference.specifier),
    [...reference.valueImports].sort(),
  ]);
}

function violationFor(reference: ModuleReference): ImportViolation | null {
  if (reference.specifier === null) {
    return { ...reference, reason: 'module specifier must be a string literal' };
  }

  const specifier = normalizedSpecifier(reference.specifier);
  if (specifier.startsWith('./') && !specifier.split('/').includes('..')) return null;
  if (['../rule-metadata', '../fingerprint', '../sha256'].includes(specifier)) return null;

  if (specifier === '../modernization-classification') {
    if (reference.kind === 'value-import' && reference.valueImports.length === 1
      && reference.valueImports[0] === 'classifyModernization') return null;
    return { ...reference, reason: '../modernization-classification permits only classifyModernization' };
  }

  if (specifier === '../tokenizer') {
    if (reference.kind === 'value-import'
      && reference.valueImports.length === 1
      && reference.valueImports[0] === 'tokenizeFormula') return null;
    return { ...reference, reason: '../tokenizer permits only the named tokenizeFormula value import' };
  }

  if (['../snapshot', '../analyzer', '../evidence', '../datasource'].includes(specifier)) {
    // Inline import-type nodes are type-erased, so they are as safe as
    // `import type` for the type-only modules.
    return reference.kind === 'type-import' || reference.kind === 'import-type-node'
      ? null
      : { ...reference, reason: `${specifier} is type-import only` };
  }

  if (specifier === '../model') {
    if (reference.kind === 'type-import') return null;
    if (
      reference.kind === 'value-import'
      && reference.valueImports.length === 1
      && reference.valueImports[0] === 'controlNodes'
    ) return null;
    return {
      ...reference,
      reason: '../model permits type imports and the single value import controlNodes only',
    };
  }

  return { ...reference, reason: `${specifier} is outside the survey import allowlist` };
}

function scanPinnedCoreImports(directoryPath: string): ImportViolation[] {
  const violations: ImportViolation[] = [];
  for (const [file, expectedReferences] of Object.entries(PINNED_CORE_IMPORTS)) {
    const actualReferences = moduleReferences(readFileSync(join(directoryPath, file), 'utf8'), file);
    const remainingExpected = new Map<string, PinnedModuleReference>();
    for (const expected of expectedReferences) {
      remainingExpected.set(referenceSignature(expected), expected);
    }
    for (const reference of actualReferences) {
      const signature = referenceSignature(reference);
      if (remainingExpected.delete(signature)) continue;
      violations.push({
        ...reference,
        reason: 'import is outside the pinned core dependency allowlist',
      });
    }
    for (const expected of remainingExpected.values()) {
      violations.push({
        file,
        ...expected,
        reason: 'pinned core dependency import is missing',
      });
    }
  }
  return violations;
}

export function scanSurveyImports(
  directoryPath: string,
  dependencyRoot: string = dirname(directoryPath),
): ImportViolation[] {
  const surveyViolations = filesUnder(directoryPath).flatMap(path => {
    const file = relative(directoryPath, path).replaceAll('\\', '/');
    return moduleReferences(readFileSync(path, 'utf8'), file)
      .map(violationFor)
      .filter((violation): violation is ImportViolation => violation !== null);
  });
  return [...surveyViolations, ...scanPinnedCoreImports(dependencyRoot)];
}

function assertSurveyImports(directoryPath: string): void {
  const violations = scanSurveyImports(directoryPath);
  if (violations.length > 0) {
    throw new Error(violations.map(violation => (
      `${violation.file}: ${violation.kind} ${violation.specifier ?? '<non-literal>'}: ${violation.reason}`
    )).join('\n'));
  }
}

describe('survey core import seam', () => {
  it('accepts every import in src/core/survey', () => {
    expect(() => assertSurveyImports(surveyRoot)).not.toThrow();
  });

  it.each([
    {
      name: 'value import of analyze from snapshot',
      poison: "import { analyze } from '../snapshot';\nvoid analyze;\n",
      expected: 'value-import ../snapshot: ../snapshot is type-import only',
    },
    {
      name: 'export of analyze from snapshot',
      poison: "export { analyze } from '../snapshot';\n",
      expected: 'export-from ../snapshot: ../snapshot is type-import only',
    },
    {
      name: 'side-effect import of lint',
      poison: "import '../lint';\n",
      expected: 'value-import ../lint: ../lint is outside the survey import allowlist',
    },
    {
      name: 'inline import-type query of lint',
      poison: "type Poison = import('../lint').LintContext;\nexport type { Poison };\n",
      expected: 'import-type-node ../lint: ../lint is outside the survey import allowlist',
    },
    {
      name: 'wildcard tokenizer import',
      poison: "import * as parser from '../tokenizer';\nvoid parser;\n",
      expected: 'value-import ../tokenizer: ../tokenizer permits only the named tokenizeFormula value import',
    },
  ])('rejects poison: $name', ({ poison, expected }) => {
    const scratchRoot = mkdtempSync(join(tmpdir(), 'survey-seam-'));
    const scratchSurvey = join(scratchRoot, 'survey');
    try {
      cpSync(surveyRoot, scratchSurvey, { recursive: true });
      for (const file of Object.keys(PINNED_CORE_IMPORTS)) {
        cpSync(join(coreRoot, file), join(scratchRoot, file));
      }
      writeFileSync(join(scratchSurvey, 'poison.ts'), poison);
      expect(() => assertSurveyImports(scratchSurvey)).toThrow(expected);
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });

  it.each(['fingerprint.ts', 'tokenizer.ts'])('rejects a value import of lint added transitively through %s', file => {
    const scratchRoot = mkdtempSync(join(tmpdir(), 'survey-seam-'));
    const scratchSurvey = join(scratchRoot, 'survey');
    try {
      cpSync(surveyRoot, scratchSurvey, { recursive: true });
      for (const file of Object.keys(PINNED_CORE_IMPORTS)) {
        cpSync(join(coreRoot, file), join(scratchRoot, file));
      }
      const fingerprintPath = join(scratchRoot, file);
      writeFileSync(
        fingerprintPath,
        `${readFileSync(fingerprintPath, 'utf8')}\nimport { runLintRules } from '../lint';\nvoid runLintRules;\n`,
      );

      expect(() => assertSurveyImports(scratchSurvey)).toThrow(
        `${file}: value-import ../lint: import is outside the pinned core dependency allowlist`,
      );
    } finally {
      rmSync(scratchRoot, { recursive: true, force: true });
    }
  });
});
