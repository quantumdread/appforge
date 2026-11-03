import type { Issue } from './analyzer.js';
import type { LintRule, RuleContext } from './lint.js';
import { controlNodes, type AppBundle, type ControlNode, type ParsedProperty } from './model.js';
import { inspectFormulaStructure, plainIdentifier, type FormulaCall, type FormulaStructure } from './formula-structure.js';
import { collectKnownSymbols, formulaNodes, isKnownSymbol, isInEnclosingBinding } from './formula-bindings.js';
import { resolveDatasourceReference } from './datasource.js';

function issue(rule: string, control: ControlNode, property: ParsedProperty | null, detail: string, fix: string): Issue {
  return { level: 'WARN', rule, file: control.file, line: property?.line ?? control.line,
    control: control.name, type: control.type ?? 'unknown', ...(property ? { property: property.name } : {}), detail, fix };
}

function uniqueIssueSites(issues: Issue[]): Issue[] {
  const sites = new Set<string>();
  return issues.filter(row => {
    const key = JSON.stringify([row.rule, row.file, row.control, row.property ?? null]);
    if (sites.has(key)) return false;
    sites.add(key);
    return true;
  });
}

type WriteTarget = { name: string; conditional: boolean };

function uniqueForms(bundle: AppBundle): ReadonlyMap<string, ControlNode> {
  const byName = new Map<string, ControlNode[]>();
  for (const control of controlNodes(bundle)) {
    const key = control.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), control]);
  }
  return new Map([...byName].flatMap(([name, controls]) => controls.length === 1 && controls[0].type === 'Form'
    ? [[name, controls[0]] as const] : []));
}

function submittedForm(
  structure: FormulaStructure, call: FormulaCall, forms: ReadonlyMap<string, ControlNode>, symbols: ReadonlySet<string>,
): ControlNode | null {
  if (!call.unqualified || call.name !== 'submitform' || call.arguments.length !== 1
    || isInEnclosingBinding(structure, { start: call.nameIndex, end: call.endIndex + 1 })) return null;
  const name = plainIdentifier(structure, call.arguments[0]);
  return name && !isKnownSymbol(symbols, name) ? forms.get(name.toLowerCase()) ?? null : null;
}

type BehaviorSite = { control: ControlNode; property: ParsedProperty; structure: FormulaStructure };
function behaviorSites(bundle: AppBundle): BehaviorSite[] {
  const sites: BehaviorSite[] = [];
  for (const control of formulaNodes(bundle)) {
    for (const property of control.properties) {
      if (!/^On/iu.test(property.name)
        || control.properties.filter(row => row.name.toLowerCase() === property.name.toLowerCase()).length !== 1) continue;
      const structure = inspectFormulaStructure(property.value);
      if (structure?.isFormula) sites.push({ control, property, structure });
    }
  }
  return sites;
}

function directPairs(structure: FormulaStructure): Array<[FormulaCall, FormulaCall]> {
  const pairs: Array<[FormulaCall, FormulaCall]> = [];
  for (let index = 0; index < structure.statements.length - 1; index++) {
    const first = structure.statements[index].directCallIndex;
    const next = structure.statements[index + 1].directCallIndex;
    if (first !== null && next !== null) pairs.push([structure.calls[first], structure.calls[next]]);
  }
  return pairs;
}

function navigates(call: FormulaCall): boolean {
  return call.unqualified && (call.name === 'navigate' || call.name === 'back');
}

function writeTarget(
  structure: FormulaStructure, call: FormulaCall, context: RuleContext, symbols: ReadonlySet<string>,
): WriteTarget | null {
  if (!call.unqualified || !['patch', 'collect', 'remove', 'removeif'].includes(call.name)
    || call.arguments.length < (call.name === 'patch' ? 3 : 2)
    || call.arguments.some(argument => argument.start === argument.end)) return null;
  const name = plainIdentifier(structure, call.arguments[0]);
  if (!name || isKnownSymbol(symbols, name)
    || isInEnclosingBinding(structure, { start: call.nameIndex, end: call.endIndex + 1 })) return null;
  const reference = resolveDatasourceReference(name, { datasources: context.datasources, exportMetadata: context.exportDatasources });
  if (reference.backend === 'collection') return null;
  const authoritative = reference.resolvedBy === 'explicit-input' || reference.resolvedBy === 'export-metadata';
  if (call.name !== 'patch' && !authoritative) return null;
  return { name, conditional: !authoritative };
}

const writeNavigation: LintRule = {
  id: 'write-followed-by-unconditional-navigation', level: 'WARN', docRef: 'write-error-rules.md §Write navigation',
  check(bundle, context) {
    const issues: Issue[] = [];
    const symbols = collectKnownSymbols(bundle);
    for (const { control, property, structure } of behaviorSites(bundle)) {
      for (const [first, continuation] of directPairs(structure)) {
        const target = writeTarget(structure, first, context, symbols);
        if (!target || !navigates(continuation)) continue;
        issues.push(issue(writeNavigation.id, control, property,
          `${target.conditional ? `If ${target.name} is a datasource, this write` : `The write to ${target.name}`} is immediately followed by navigation without a recognized success gate in this sequence.`,
          'Review conditional continuation and error handling, such as IfError, before navigating after a synchronous datasource write.'));
        break;
      }
    }
    return uniqueIssueSites(issues);
  },
};

const submitNavigation: LintRule = {
  id: 'submitform-navigation-not-in-onsuccess', level: 'WARN', docRef: 'write-error-rules.md §SubmitForm navigation',
  check(bundle) {
    const issues: Issue[] = [];
    const forms = uniqueForms(bundle);
    const symbols = collectKnownSymbols(bundle);
    for (const { control, property, structure } of behaviorSites(bundle)) {
      for (const [first, continuation] of directPairs(structure)) {
        const form = submittedForm(structure, first, forms, symbols);
        if (!form || !navigates(continuation)) continue;
        issues.push(issue(submitNavigation.id, control, property,
          `SubmitForm(${form.name}) is immediately followed by navigation outside that submission's success event.`,
          `Review moving this continuation to ${form.name}.OnSuccess; handle failure through the submitted form's lifecycle.`));
        break;
      }
    }
    return uniqueIssueSites(issues);
  },
};

const ERROR_DISPLAYS: ReadonlyMap<string, string> = new Map([
  ['Label', 'Text'], ['Text', 'Text'], ['ModernText', 'Text'], ['HtmlViewer', 'HtmlText'],
]);

function displaysFormError(bundle: AppBundle, form: ControlNode): boolean {
  for (const control of controlNodes(bundle)) {
    const displayProperty = ERROR_DISPLAYS.get(control.type ?? '');
    if (!displayProperty) continue;
    const properties = control.properties.filter(property => property.name.toLowerCase() === displayProperty.toLowerCase());
    if (properties.length !== 1) continue;
    const structure = inspectFormulaStructure(properties[0].value);
    if (!structure?.isFormula) continue;
    for (let index = 0; index < structure.tokens.length - 2; index++) {
      const name = plainIdentifier(structure, { start: index, end: index + 1 });
      const error = structure.tokens[index + 2];
      if (name?.toLowerCase() === form.name.toLowerCase()
        && structure.tokens[index - 1]?.text !== '.' && structure.tokens[index + 1].text === '.'
        && error.kind === 'identifier' && error.text.toLowerCase() === 'error'
        && !isInEnclosingBinding(structure, { start: index, end: index + 3 })) return true;
    }
  }
  return false;
}

const formFailure: LintRule = {
  id: 'form-without-failure-path', level: 'WARN', docRef: 'write-error-rules.md §Form failure presentation',
  check(bundle) {
    const issues: Issue[] = [];
    const forms = uniqueForms(bundle);
    const symbols = collectKnownSymbols(bundle);
    const submitted = new Set<ControlNode>();
    for (const { structure } of behaviorSites(bundle)) {
      for (const call of structure.calls) {
        const form = submittedForm(structure, call, forms, symbols);
        if (form) submitted.add(form);
      }
    }
    for (const form of submitted) {
      const handlers = form.properties.filter(property => property.name.toLowerCase() === 'onfailure');
      if (handlers.length > 1) continue;
      if (handlers.length === 1) {
        const structure = inspectFormulaStructure(handlers[0].value);
        if (!structure || structure.statements.length > 0) continue;
      }
      if (displaysFormError(bundle, form)) continue;
      issues.push(issue(formFailure.id, form, handlers[0] ?? null,
        `No explicit nonempty OnFailure handler or recognized ${form.name}.Error display was found for this submitted Form in analyzed source.`,
        `Review ${form.name}.OnFailure or a visible error display bound to ${form.name}.Error; App.OnError alone does not establish form-error presentation.`));
    }
    return uniqueIssueSites(issues);
  },
};

function notifiesSuccess(structure: FormulaStructure, call: FormulaCall): boolean {
  if (!call.unqualified || call.name !== 'notify' || call.arguments.length < 2) return false;
  const argument = call.arguments[1];
  if (argument.end - argument.start !== 3) return false;
  const [type, dot, member] = structure.tokens.slice(argument.start, argument.end);
  return type.kind === 'identifier' && type.text.toLowerCase() === 'notificationtype'
    && dot.text === '.' && member.kind === 'identifier' && member.text.toLowerCase() === 'success';
}

const successNotification: LintRule = {
  id: 'success-notification-not-gated', level: 'WARN', docRef: 'write-error-rules.md §Success notification',
  check(bundle, context) {
    const issues: Issue[] = [];
    const forms = uniqueForms(bundle);
    const symbols = collectKnownSymbols(bundle);
    for (const { control, property, structure } of behaviorSites(bundle)) {
      for (const [first, continuation] of directPairs(structure)) {
        if (!notifiesSuccess(structure, continuation)) continue;
        const form = submittedForm(structure, first, forms, symbols);
        const target = form ? null : writeTarget(structure, first, context, symbols);
        if (!form && !target) continue;
        issues.push(issue(successNotification.id, control, property,
          form
            ? `SubmitForm(${form.name}) is immediately followed by a success notification outside that submission's success event.`
            : `${target!.conditional ? `If ${target!.name} is a datasource, this write` : `The write to ${target!.name}`} is immediately followed by a success notification without a recognized success gate in this sequence.`,
          form
            ? `Review placing the success notification in ${form.name}.OnSuccess and presenting submission failures through the form's lifecycle.`
            : 'Review success-gated notification and error handling, such as IfError, for this synchronous datasource write.'));
        break;
      }
    }
    return uniqueIssueSites(issues);
  },
};

export const WRITE_FORM_RULES: LintRule[] = [writeNavigation, submitNavigation, formFailure, successNotification];
