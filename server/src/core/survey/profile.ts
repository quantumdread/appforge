import { controlNodes } from '../model.js';
import type { ParsedProperty } from '../model.js';
import { tokenizeFormula } from '../tokenizer.js';
import type { ReadonlySnapshot } from './readonly.js';

export type SurveyProfile = 'shared' | 'existing-export';

function isExportPasteAdvice(property: Readonly<ParsedProperty>): boolean {
  const value = property.value;
  if (property.isBlockScalar || property.wasQuoted || !value.startsWith('=') || value.includes(': ')) return false;
  const parsed = tokenizeFormula(value);
  if (parsed.parseConfidence !== 'complete') return false;

  // A complete lexical parse does not establish invariant-locale syntax. Keep
  // nested separators and doubled behavior separators at their shared level.
  let depth = 0;
  let previousSeparator = false;
  for (const token of parsed.tokens) {
    if (token.kind === 'comment') continue;
    if (token.kind === 'delimiter') depth += '([{'.includes(token.text) ? 1 : -1;
    const separator = token.kind === 'separator' && token.text === ';';
    if (separator && (depth > 0 || previousSeparator)) return false;
    previousSeparator = separator;
  }

  // This is the approved outside-ordinary-string predicate, matching the
  // existing finding's hazard bound. Power Fx quotes never quote YAML.
  const strings = parsed.tokens.filter(token => token.kind === 'string');
  let stringIndex = 0;
  for (const match of value.matchAll(/[;{}]/g)) {
    while (stringIndex < strings.length && strings[stringIndex].span.end <= match.index) stringIndex++;
    if (stringIndex === strings.length || strings[stringIndex].span.start > match.index) return true;
  }
  return false;
}

/** Apply survey purpose before classification; retain the caller's raw snapshot. */
export function snapshotForProfile(snapshot: ReadonlySnapshot, profile: SurveyProfile): ReadonlySnapshot {
  if (profile === 'shared') return snapshot;
  const key = (file: string, control: string, property: string | undefined, line: number) =>
    JSON.stringify([file, control, property, line]);
  const properties = new Map<string, Readonly<ParsedProperty> | null>();
  for (const node of controlNodes(snapshot.bundle)) for (const property of node.properties) {
    const id = key(node.file, node.name, property.name, property.line);
    properties.set(id, properties.has(id) ? null : property);
  }
  const movedByFile = new Map<string, number>();
  const issues = snapshot.validation.issues.map(issue => {
    if (issue.level !== 'REFUSE') return issue;
    if (issue.rule === 'addcolumns-string-column-name') {
      movedByFile.set(issue.file, (movedByFile.get(issue.file) ?? 0) + 1);
      return { ...issue, level: 'WARN' as const };
    }
    if (issue.rule !== 'block-scalar-required') return issue;
    const property = properties.get(key(issue.file, issue.control, issue.property, issue.line));
    if (!property || !isExportPasteAdvice(property)) return issue;
    movedByFile.set(issue.file, (movedByFile.get(issue.file) ?? 0) + 1);
    return {
      ...issue,
      level: 'WARN' as const,
      detail: 'Existing-export survey: inline formula has a paste-formatting hazard outside an ordinary string literal; this advice does not establish compilation or round-trip preservation.',
      fix: `Existing-export survey advice is not compile or round-trip evidence. For paste, use a block scalar: ${property.name}: |-  (newline)  ${property.value}`,
    };
  });
  if (movedByFile.size === 0) return snapshot;
  const moved = [...movedByFile.values()].reduce((total, count) => total + count, 0);
  const summary = {
    ...snapshot.validation.summary,
    warn: snapshot.validation.summary.warn + moved,
    refuse: snapshot.validation.summary.refuse - moved,
  };
  return {
    ...snapshot,
    validation: {
      ...snapshot.validation,
      issues,
      summary,
      per_file: snapshot.validation.per_file.map(file => ({
        ...file,
        warn: file.warn + (movedByFile.get(file.file) ?? 0),
        refuse: file.refuse - (movedByFile.get(file.file) ?? 0),
      })),
      gateDecision: summary.refuse > 0 ? 'BLOCK' : summary.warn > 0 ? 'PROCEED_WITH_WARNINGS' : 'CLEAR',
    },
  };
}
