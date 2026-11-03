import type { LintRule } from './lint.js';
import type { Issue } from './analyzer.js';
import { APP_TYPE, COMPONENT_DEFINITION_TYPE, type AppBundle, type AppScreen, type ControlNode, type ParsedProperty } from './model.js';
import { inspectFormulaStructure, plainIdentifier, type FormulaStructure, type TokenRange } from './formula-structure.js';
import { collectKnownSymbols, formulaNodes, isInEnclosingBinding, isKnownSymbol } from './formula-bindings.js';
import { resolveDatasourceReference } from './datasource.js';
import { boundSourceEvidence } from './evidence.js';

function warning(rule: LintRule, node: ControlNode, property: ParsedProperty, detail: string, fix: string): Issue {
  return {
    level: rule.level, file: node.file, line: property.line,
    control: node.name, type: node.type ?? 'unknown', property: property.name,
    rule: rule.id, detail, fix,
  };
}

function uniqueProperties(node: ControlNode): ParsedProperty[] {
  return node.properties.filter(property => node.properties.filter(other => (
    other.name.toLowerCase() === property.name.toLowerCase()
  )).length === 1);
}

function uniqueIssueSites(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const source = issue.evidence?.kind === 'bound-source' ? issue.evidence.authoredName : null;
    const key = JSON.stringify([issue.rule, issue.file, issue.control, issue.property ?? null, source]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TABLE_WRAPPERS = new Set(['filter', 'search', 'sort', 'sortbycolumns', 'showcolumns', 'addcolumns']);

function forallSource(structure: FormulaStructure, range: TokenRange): string | null {
  let current = range;
  for (;;) {
    const name = plainIdentifier(structure, current);
    if (name !== null) return name;
    const wrapper = structure.calls.find(call => call.nameIndex === current.start && call.endIndex + 1 === current.end);
    if (!wrapper?.unqualified || !TABLE_WRAPPERS.has(wrapper.name) || !wrapper.arguments[0]) return null;
    current = wrapper.arguments[0];
  }
}

const forallTruncation: LintRule = {
  id: 'delegation-forall-truncation', level: 'WARN',
  docRef: 'navigation-app-rules.md §ForAll source iteration',
  check(bundle, context) {
    const out: Issue[] = [];
    const known = collectKnownSymbols(bundle);
    for (const node of formulaNodes(bundle)) for (const property of uniqueProperties(node)) {
      const structure = inspectFormulaStructure(property.value);
      if (!structure?.isFormula) continue;
      const emitted = new Set<string>();
      for (const call of structure.calls) {
        if (!call.unqualified || call.name !== 'forall' || call.arguments.length !== 2
          || isInEnclosingBinding(structure, { start: call.nameIndex, end: call.endIndex + 1 })) continue;
        const name = forallSource(structure, call.arguments[0]);
        if (name === null || isKnownSymbol(known, name) || emitted.has(name)) continue;
        const reference = resolveDatasourceReference(name, {
          datasources: context.datasources, exportMetadata: context.exportDatasources,
        });
        if (reference.backend === 'collection') continue;
        const uncertainty = reference.resolvedBy === 'unresolved'
          ? ' Source identity is unresolved; this concern applies if the name denotes an external datasource.' : '';
        const row = warning(this, node, property,
          `ForAll over '${name}' has possible row-limit truncation: a nondelegable iteration can process only the retrieved portion of a datasource.${uncertainty}`,
          'Review required row coverage and connector delegation; consider a delegable source query or server-side processing.');
        row.evidence = boundSourceEvidence(reference);
        out.push(row);
        emitted.add(name);
      }
    }
    return uniqueIssueSites(out);
  },
};

const appOnErrorMissing: LintRule = {
  id: 'app-onerror-missing',
  level: 'WARN',
  docRef: 'navigation-app-rules.md §Global error reporting',
  check(bundle) {
    return uniqueIssueSites(bundle.app.filter(app => {
      const handlers = app.properties.filter(property => property.name.toLowerCase() === 'onerror');
      if (handlers.length > 1) return false;
      if (handlers.length === 0) return true;
      const structure = inspectFormulaStructure(handlers[0].value);
      return structure !== null && structure.statements.length === 0;
    })
      .map(app => ({
        level: this.level,
        file: app.file,
        line: app.line,
        control: app.name,
        type: app.type ?? 'unknown',
        rule: this.id,
        detail: 'App has no configured OnError handler for global error reporting; the default error banner remains available.',
        fix: 'Review global error reporting or logging in App.OnError; this handler cannot repair failed calculations.',
      })));
  },
};

function uniqueScreens(bundle: AppBundle): Map<string, AppScreen> | null {
  const screens = new Map<string, AppScreen>();
  for (const screen of bundle.screens) {
    const key = screen.name.toLowerCase();
    if (screens.has(key)) return null;
    screens.set(key, screen);
  }
  return screens;
}

const unknownScreen: LintRule = {
  id: 'navigate-to-unknown-screen', level: 'WARN',
  docRef: 'navigation-app-rules.md §Navigation targets',
  check(bundle) {
    const screens = uniqueScreens(bundle);
    if (screens === null) return [];
    const known = collectKnownSymbols(bundle);
    const out: Issue[] = [];
    for (const node of formulaNodes(bundle)) for (const property of uniqueProperties(node)) {
      const structure = inspectFormulaStructure(property.value);
      if (!structure?.isFormula) continue;
      for (const call of structure.calls) {
        if (!call.unqualified || call.name !== 'navigate' || !call.arguments[0]
          || isInEnclosingBinding(structure, { start: call.nameIndex, end: call.endIndex + 1 })) continue;
        const name = plainIdentifier(structure, call.arguments[0]);
        if (name === null || isKnownSymbol(known, name) || screens.has(name.toLowerCase())) continue;
        out.push(warning(this, node, property,
          `Navigate target '${name}' was not found among analyzed screens; the full app may include additional source.`,
          'Check the target spelling and that all relevant screen source files were included; do not automatically rename the target.'));
        break;
      }
    }
    return uniqueIssueSites(out);
  },
};

/** Event names are declaration facts; unresolved instances can hide navigation. */
function componentEvents(bundle: AppBundle, nodes: ControlNode[]): Map<ControlNode, Set<string>> | null {
  const definitions = new Map<string, ControlNode[]>();
  for (const definition of bundle.componentDefs) {
    const propertyNames = new Set<string>();
    for (const property of definition.customProperties ?? []) {
      const name = property.name.toLowerCase();
      if (propertyNames.has(name) || !['Input', 'Output', 'Event'].includes(property.fields.PropertyKind)) return null;
      propertyNames.add(name);
    }
    const key = definition.name.toLowerCase();
    definitions.set(key, [...(definitions.get(key) ?? []), definition]);
  }
  const events = new Map<ControlNode, Set<string>>();
  for (const node of nodes) {
    let definition: ControlNode | undefined;
    if (node.type === COMPONENT_DEFINITION_TYPE) definition = node;
    if (node.type === 'CanvasComponent') {
      const matches = node.componentName === null ? [] : definitions.get(node.componentName.toLowerCase()) ?? [];
      if (matches.length !== 1) return null;
      definition = matches[0];
    }
    if (definition) events.set(node, new Set((definition.customProperties ?? [])
      .filter(property => property.fields.PropertyKind === 'Event')
      .map(property => property.name.toLowerCase())));
  }
  return events;
}

const unreachableScreen: LintRule = {
  id: 'unreachable-screen', level: 'WARN',
  docRef: 'navigation-app-rules.md §Static reachability',
  check(bundle) {
    if (bundle.app.length !== 1 || bundle.screens.some(screen => screen.properties === undefined)) return [];
    const screens = uniqueScreens(bundle);
    if (screens === null) return [];
    const known = collectKnownSymbols(bundle);
    const starts = bundle.app[0].properties.filter(property => property.name.toLowerCase() === 'startscreen');
    if (starts.length !== 1) return [];
    const startStructure = inspectFormulaStructure(starts[0].value);
    if (!startStructure?.isFormula || startStructure.statements.length !== 1) return [];
    const start = plainIdentifier(startStructure, startStructure.statements[0].range);
    if (start === null || isKnownSymbol(known, start) || !screens.has(start.toLowerCase())) return [];

    const nodes = formulaNodes(bundle);
    const events = componentEvents(bundle, nodes);
    if (events === null) return [];
    const roots = new Set([start.toLowerCase()]);
    const edges = new Map([...screens.keys()].map(name => [name, new Set<string>()]));
    for (const node of nodes) for (const property of node.properties) {
      const navigationCapable = /^on/iu.test(property.name)
        || (node.type === APP_TYPE && /^(?:formulas|startscreen)$/iu.test(property.name))
        || (events.get(node)?.has(property.name.toLowerCase()) ?? false);
      const structure = inspectFormulaStructure(property.value);
      if (structure === null) {
        if (navigationCapable) return [];
        continue;
      }
      if (!structure.isFormula) continue;
      const navigations = structure.calls.filter(call => call.unqualified && call.name === 'navigate');
      const duplicate = node.properties.some(other => other !== property && other.name.toLowerCase() === property.name.toLowerCase());
      if (duplicate && (navigationCapable || navigations.length > 0)) return [];
      for (const call of navigations) {
        if (!call.arguments[0] || isInEnclosingBinding(structure, { start: call.nameIndex, end: call.endIndex + 1 })) return [];
        const name = plainIdentifier(structure, call.arguments[0]);
        if (name === null || isKnownSymbol(known, name) || !screens.has(name.toLowerCase())) return [];
        const target = name.toLowerCase();
        if (node.screen === null) roots.add(target);
        else edges.get(node.screen.name.toLowerCase())?.add(target);
      }
    }
    const reachable = new Set<string>();
    const pending = [...roots];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (reachable.has(current)) continue;
      reachable.add(current);
      for (const target of edges.get(current) ?? []) pending.push(target);
    }
    return [...screens.entries()].filter(([name]) => !reachable.has(name)).map(([, screen]) => ({
      level: this.level, file: screen.file, line: screen.line ?? 1,
      control: screen.name, type: 'Screen', rule: this.id,
      detail: `Screen '${screen.name}': no static path found from recognized entry points in analyzed source.`,
      fix: 'Review real navigation workflows and unmodeled entry points before changing this screen; do not automatically delete it.',
    }));
  },
};

export const NAVIGATION_APP_RULES: LintRule[] = [forallTruncation, appOnErrorMissing, unknownScreen, unreachableScreen];
