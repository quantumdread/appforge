/** Pure, surgical modernization. No YAML serialization, I/O or tenant access. */
import { scalarSource, replaceScalarSpan } from './scalar-edits.js';
import { resolvedControlReferences } from './control-references.js';
import { buildAppBundle, validateFiles, type Issue, type ValidationResult } from './analyzer.js';
import type { AnalyzerCatalogData } from './catalog.js';
import { controlNodes, type ControlNode, type ParsedProperty } from './model.js';
import { formulaNodes, isInEnclosingBinding } from './formula-bindings.js';
import { inspectFormulaStructure, plainIdentifier } from './formula-structure.js';
import { classifyModernization, effectiveModernizationProperty, singleColumnItems } from './modernization-classification.js';

export type ModernizeFile = { name: string; content: string };
export type ModernizeOptions = { types?: string[]; controls?: string[]; include_review?: boolean };
export type ModernizeOpenItem = { file: string; control: string; property: string; line: number; reason: string };
export type ModernizeProperty = {
  property: string; target_property: string; line: number;
  action: 'kept' | 'renamed' | 'transformed' | 'dropped' | 'added';
  before: string; after: string | null; impact?: 'cosmetic' | 'behaviour'; reason?: string;
};
export type ModernizeReference = {
  file: string; control: string; property: string; line: number; before: string; after: string;
};
export type ModernizeControl = {
  file: string; control: string; line: number; source_type: string; target_type: string;
  properties: ModernizeProperty[]; references: ModernizeReference[]; open_items: ModernizeOpenItem[];
  layout_edits: Array<{ file: string; control: string; property: string; line: number; before: string; after: string }>;
};
const gate = (result: ValidationResult) => ({
  gate_decision: result.gateDecision, summary: result.summary,
  refusals: result.issues.filter(issue => issue.level === 'REFUSE'),
});
export type ModernizeReport = {
  converted: ModernizeControl[];
  skipped: Array<{ file: string; control: string; source_type: string; reason: string }>;
  summary: { converted: number; skipped: number; reference_rewrites: number; open_items: number };
  caveat: string;
  self_check: { input: ReturnType<typeof gate>; output: ReturnType<typeof gate>; new_refusals: Issue[]; regression: boolean };
};
export const MODERNIZE_REORDER_NOTICE = 'Type changes are re-inserted by the server and can move to the end of their container. After compiling, save in Studio, sync and run compare_child_order.';
export const MODERNIZE_CAVEAT = 'All pairs are verified: false. The result must be compiled in a scratch app and visually checked before it is trusted. Unauthored properties take the target defaults, which can differ from the source control defaults. ' + MODERNIZE_REORDER_NOTICE;

/** A layout property supplied by the parent (AlignInContainer, FillPortions, LayoutMin*) carries over
 * unchanged when source and target types share the parent-context group that defines it. */
function sharedParentContextProperty(catalog: AnalyzerCatalogData, source: string, target: string, property: string): boolean {
  const groups = (type: string) => (Object.hasOwn(catalog.controlProperties, type) ? catalog.controlProperties[type].parent_context : undefined) ?? [];
  const targetGroups = new Set(groups(target));
  return groups(source).some(group => targetGroups.has(group)
    && Object.hasOwn(catalog.parentContextProperties, group)
    && Object.hasOwn(catalog.parentContextProperties[group], property));
}

const literal = (value: string | undefined): number | null => {
  if (!value || !/^=[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(value)) return null;
  const number = Number(value.slice(1));
  return Number.isFinite(number) ? number : null;
};
const autoLayout = (node: ControlNode | null): node is ControlNode => node?.type === 'GroupContainer' && node.variant === 'AutoLayout';
const direction = (node: ControlNode) => node.properties.find(p => p.name === 'LayoutDirection')?.value;

/** Fit classic labels after Size scaling. Ancestor values track prior sibling edits. */
function fitLabel(node: ControlNode, row: ModernizeControl, lines: Map<string, string[]>, heights: Map<ControlNode, string>): void {
  const current = (name: string) => row.properties.find(p => p.target_property === name)?.after ?? undefined;
  const open = (property: string, reason: string) => row.open_items.push({ file: node.file, control: node.name,
    property, line: node.properties.find(p => p.name === property)?.line ?? node.line, reason });
  const heightProperty = node.properties.find(p => p.name === 'Height');
  if (!heightProperty) {
    if (autoLayout(node.parent) && /\.Horizontal$/u.test(direction(node.parent) ?? '')
      && literal(heights.get(node.parent) ?? node.parent.properties.find(p => p.name === 'Height')?.value) !== null) {
      open('Height', `Unsized label in fixed-height horizontal row ${node.parent.name}; review the row height.`);
    }
    return;
  }
  const size = literal(current('Size')), oldHeight = literal(current('Height'));
  if (size === null || oldHeight === null) return;
  const top = literal(current('PaddingTop')), bottom = literal(current('PaddingBottom'));
  if (top === null || bottom === null) { open('Height', 'Cannot determine required height with formula or unrecorded padding.'); return; }
  const need = Math.ceil(1.5 * size + top + bottom);
  if (!Number.isFinite(need) || oldHeight >= need) return;
  const edit = (property: ParsedProperty, before: string, after: string) => replaceScalarSpan(lines.get(node.file)!, { ...property, value: before }, 0, before.length, after);
  if (!edit(heightProperty, current('Height')!, '=' + need)) { open('Height', 'Required height has no editable source span.'); return; }
  const heightItem = row.properties.find(p => p.property === 'Height')!;
  heightItem.action = 'transformed'; heightItem.after = '=' + need;
  let delta = need - oldHeight;
  if (!autoLayout(node.parent)) {
    const y = node.properties.find(p => p.name === 'Y');
    if (!y) return;
    const before = current('Y')!;
    const numeric = literal(before);
    const after = numeric !== null ? '=' + (numeric - delta / 2) : `=(${before.slice(1)}) - ${delta / 2}`;
    let changed = numeric !== null ? edit(y, before, after) : false;
    if (numeric === null && before.startsWith('=') && before.length > 1) {
      const source = scalarSource(y, lines.get(node.file)!);
      changed = replaceScalarSpan(lines.get(node.file)!, y, before.length - 1, before.length, before.at(-1)! + `) - ${delta / 2}`, source)
        && replaceScalarSpan(lines.get(node.file)!, y, 0, 1, '=(', source);
    }
    if (changed) { const item = row.properties.find(p => p.property === 'Y')!; item.action = 'transformed'; item.after = after; }
    else open('Y', 'Centre-preserving Y has no editable formula source span.');
    return;
  }
  let childHeight = need;
  for (let parent: ControlNode | null = node.parent; autoLayout(parent); parent = parent.parent) {
    const property = parent.properties.find(p => p.name === 'Height');
    const before = heights.get(parent) ?? property?.value;
    const old = literal(before);
    if (!property || old === null) break;
    const axis = direction(parent);
    const next = /\.Vertical$/u.test(axis ?? '') ? old + delta
      : /\.Horizontal$/u.test(axis ?? '') ? Math.max(old, childHeight) : null;
    if (next === null) { open('Height', `Ancestor ${parent.name} has no explicit layout direction; height retained.`); break; }
    if (!Number.isFinite(next) || next === old) break;
    const after = '=' + next;
    if (!replaceScalarSpan(lines.get(parent.file)!, { ...property, value: before! }, 0, before!.length, after)) {
      open('Height', `Ancestor ${parent.name} has no editable height source span.`); break;
    }
    heights.set(parent, after);
    row.layout_edits.push({ file: parent.file, control: parent.name, property: 'Height', line: property.line, before: before!, after });
    delta = next - old; childHeight = next;
  }
}

export function modernize(files: ModernizeFile[], catalog: AnalyzerCatalogData, options: ModernizeOptions = {}): { files: ModernizeFile[]; report: ModernizeReport } {
  const input = validateFiles(files, catalog);
  const lines = new Map(files.map(file => [file.name, file.content.split('\n')]));
  const removed = new Map(files.map(file => [file.name, new Set<number>()]));
  const converted: ModernizeControl[] = [];
  // Delay insertions until all original source anchors and reference edits finish.
  const insertions = new Map<string, Map<number, string[]>>(files.map(file => [file.name, new Map()]));
  const skipped: ModernizeReport['skipped'] = [];
  const heights = new Map<ControlNode, string>();
  const originalNodes = controlNodes(input.bundle);
  for (const node of originalNodes) {
    if (!node.type || node.componentName || node.type.startsWith('__') || node.type === 'CanvasComponent') continue;
    const pair = catalog.modernization && Object.hasOwn(catalog.modernization, node.type) ? catalog.modernization[node.type] : undefined;
    const classification = classifyModernization(node.properties, pair);
    const reason = !pair ? 'No modernization pair.'
      : options.types && !options.types.includes(node.type) ? 'Excluded by types filter.'
      : options.controls && !options.controls.includes(node.name) ? 'Excluded by controls filter.'
      : classification.neverConvertReason ??
        (classification.needsReview && !options.include_review ? `Needs review: ${classification.reviewProperties.join(', ')}.` : null);
    if (reason || !pair) { skipped.push({ file: node.file, control: node.name, source_type: node.type, reason: reason! }); continue; }
    const source = lines.get(node.file)!;
    const row: ModernizeControl = { file: node.file, control: node.name, line: node.line, source_type: node.type, target_type: pair.target, properties: [], references: [], open_items: [], layout_edits: [] };
    const condition = (entry: {when?: 'single-column-items'}) => !entry.when || singleColumnItems(node.properties.find(p=>p.name==='Items')?.value);
    for (const entry of pair.open_items ?? []) if (condition(entry)) row.open_items.push({file:node.file,control:node.name,property:entry.property,line:node.line,reason:entry.reason});
    const splitAdditions: Array<{property: string; value: string; basis: string; block?: boolean; raw?: string[]}> = [];
    const remove = (property: ParsedProperty) => {
      const deleted = removed.get(node.file)!;
      const index = property.line - 1;
      deleted.add(index);
      if (property.isBlockScalar) {
        const indent = source[index].match(/^ */u)![0].length;
        for (let i = index + 1; i < source.length; i++) {
          if (source[i].trim() && source[i].match(/^ */u)![0].length <= indent) break;
          if (i < source.length - 1 || source[i]) deleted.add(i);
        }
      }
    };
    for (let index = node.line; index < source.length; index++) {
      if (/^\s*Control:\s*/u.test(source[index])) {
        source[index] = source[index].replace(/^(\s*Control:\s*)\S+/u, `$1${pair.target}`);
        break;
      }
    }
    for (const property of node.properties) {
      const item: ModernizeProperty = { property: property.name, target_property: property.name, line: property.line, action: 'kept', before: property.value, after: property.value };
      const uniform = pair.properties.BorderRadius;
      const corner = uniform && uniform !== 'same' && 'to' in uniform && Array.isArray(uniform.to)
        ? uniform.to.find(target=>property.name===target || property.name==='Border'+target) : undefined;
      const declared = Object.hasOwn(pair.properties, property.name) ? pair.properties[property.name] : undefined;
      const mapping = effectiveModernizationProperty(declared ?? (corner ? {to:corner,basis:uniform !== 'same' && uniform ? uniform.basis : 'inferred'} : undefined), node.properties, property.value);
      const open = (reason: string) => row.open_items.push({ file: node.file, control: node.name, property: property.name, line: property.line, reason });
      if (mapping && mapping !== 'same' && 'to' in mapping) {
        const authoredTarget = typeof mapping.to==='string' ? node.properties.find(p=>p.name===mapping.to) : undefined;
        const targetMapping = authoredTarget && effectiveModernizationProperty(pair.properties[authoredTarget.name],node.properties,authoredTarget.value);
        const targetStays = authoredTarget && (!targetMapping || targetMapping==='same' || 'manual' in targetMapping || ('to' in targetMapping && targetMapping.to===authoredTarget.name));
        if (typeof mapping.to==='string' && mapping.to!==property.name && targetStays) {
          remove(property); item.action='dropped'; item.after=null; item.target_property=mapping.to;
          item.reason=`Target ${mapping.to} is already authored; its value is preserved. Review the source ${property.name} conflict.`;
          open(item.reason); row.properties.push(item); continue;
        }
        if ('replacement' in mapping) {
          remove(property);
          splitAdditions.push({property:mapping.to,value:mapping.replacement,basis:mapping.basis,block:mapping.block});
          item.action='transformed'; item.target_property=mapping.to; item.after=mapping.replacement;
          // The pending scalar is already represented by this report item.
          row.properties.push(item);
          continue;
        }
        if (Array.isArray(mapping.to)) {
          const indent = source[property.line-1].match(/^ */u)![0].length;
          const raw = [source[property.line-1].slice(indent).replace(/\r$/u,'')];
          if (property.isBlockScalar) for (let index=property.line;index<source.length;index++) {
            if (source[index].trim() && source[index].match(/^ */u)![0].length<=indent) break;
            if (index < source.length-1 || source[index]) raw.push(source[index].slice(indent).replace(/\r$/u,''));
          }
          for (const target of mapping.to) {
            const corner = node.properties.find(p => p.name === target || p.name === 'Border' + target);
            if (!corner) splitAdditions.push({property: target, value: property.value, basis: mapping.basis,raw:raw.map((line,index)=>index===0?line.replace(/^\w+:/u,target+':'):line)});
          }
          remove(property); item.action = 'dropped'; item.after = null; item.reason = 'Split formula to absent corners; authored corner overrides preserved.';
          row.properties.push(item);
          continue;
        }
        if (mapping.values) {
          const formula = property.value.startsWith('=') ? property.value.slice(1) : null;
          const mapped = formula !== null && Object.hasOwn(mapping.values, formula) ? mapping.values[formula] : undefined;
          if (mapped !== undefined && replaceScalarSpan(source, property, 1, property.value.length, mapped)) {
            item.after = '=' + mapped; item.action = 'transformed';
          } else open('Value has no exact formula match or editable source span; retained for review.');
        }
        if (mapping.scale) {
          const current = item.after!;
          const [numerator, denominator = '1'] = mapping.scale.split('/');
          const value = Number(current.slice(1)) * Number(numerator) / Number(denominator);
          if (/^=[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/u.test(current)
            && Number.isFinite(value) && replaceScalarSpan(source, { ...property, value: current }, 1, current.length, String(Math.round(value)))) {
            item.after = '=' + Math.round(value); item.action = 'transformed';
          } else open('Scale requires a numeric literal and finite result; value retained for review.');
        }
        source[property.line - 1] = source[property.line - 1].replace(/^(\s*)\w+:/u, `$1${mapping.to}:`);
        item.target_property = mapping.to as string;
        if (item.action !== 'transformed' && mapping.to !== property.name) item.action = 'renamed';
      }
      if (mapping && mapping !== 'same' && 'drop' in mapping) {
        remove(property);
        item.action = 'dropped'; item.after = null; item.impact = mapping.impact; item.reason = mapping.drop;
      }
      if (!mapping && sharedParentContextProperty(catalog, node.type!, pair.target, property.name)) {
        item.reason = 'Parent layout property; the target inherits the same parent context.';
      } else if (!mapping) open('Authored property has no mapping; retained. The analyzer reports catalog validity separately.');
      if (mapping && mapping !== 'same' && ('manual' in mapping || ('drop' in mapping && mapping.impact === 'behaviour'))) {
        item.reason = 'manual' in mapping ? mapping.manual : mapping.drop;
        if ('drop' in mapping) item.impact = mapping.impact;
        open(item.reason);
      }
      const targetInputs = catalog.controlProperties[pair.target]?.input_properties ?? {};
      const targetAugmentations = catalog.augmentations[pair.target]?.additional_input_properties ?? {};
      if (item.after !== null && !Object.hasOwn(targetInputs, item.target_property)
        && !Object.hasOwn(targetAugmentations, item.target_property)
        && !sharedParentContextProperty(catalog, node.type, pair.target, item.target_property)) {
        remove(property); item.action = 'dropped'; item.after = null;
        const omission = `${pair.target} has no ${item.target_property} input; source-only property omitted. Review its original formula.`;
        item.reason = item.reason ? item.reason + ' ' + omission : omission;
        const existing = row.open_items.find(p=>p.property===property.name && p.line===property.line);
        if (existing) existing.reason = mapping ? existing.reason + ' ' + omission : omission;
        else open(item.reason);
        if (property.name === 'TabIndex') item.impact = 'behaviour';
      }
      row.properties.push(item);
    }
    const additions = [...(pair.add ?? []).filter(entry => condition(entry) && !row.properties.some(item => item.target_property === entry.property)), ...splitAdditions];
    if (additions.length) {
      const last = node.properties.at(-1);
      let anchor = last ? last.line : node.line;
      let indent = last ? source[last.line - 1].match(/^ */u)![0].length : node.indent + 6;
      if (last?.isBlockScalar) {
        while (anchor < source.length && (!source[anchor].trim() || source[anchor].match(/^ */u)![0].length > indent)) anchor++;
        while (anchor > last.line && !source[anchor - 1].trim()) anchor--;
      } else if (!last) {
        let header = -1;
        for (let i = node.line; i < source.length; i++) {
          if (source[i].trim() && source[i].match(/^ */u)![0].length <= node.indent) break;
          if (/^\s*Properties:\s*$/u.test(source[i])) { header = i; break; }
          if (/^\s*Children:/u.test(source[i])) break;
          if (source[i].trim()) anchor = i + 1;
        }
        if (header >= 0) { anchor = header + 1; indent = source[header].match(/^ */u)![0].length + 2; }
        else insertions.get(node.file)!.set(anchor, [' '.repeat(node.indent + 4) + 'Properties:']);
      }
      const pending = insertions.get(node.file)!.get(anchor) ?? [];
      for (const entry of additions) {
        if ('raw' in entry && entry.raw) pending.push(...entry.raw.map(line=>' '.repeat(indent)+line));
        else if (('block' in entry && entry.block) || entry.value.includes('\n') || entry.value.includes(': ')) pending.push(' '.repeat(indent) + entry.property + ': |-', ...entry.value.split('\n').map(line => ' '.repeat(indent + 2) + line));
        else pending.push(' '.repeat(indent) + entry.property + ': ' + entry.value);
        if (!row.properties.some(item=>item.target_property===entry.property)) row.properties.push({ property: entry.property, target_property: entry.property, line: anchor + 1,
          action: 'added', before: '', after: entry.value, reason: entry.basis });
      }
      insertions.get(node.file)!.set(anchor, pending);
    }
    if (node.type === 'Label' && pair.target === 'ModernText') fitLabel(node, row, lines, heights);
    converted.push(row);
  }
  const outputFiles = files.map(file => {
    const source = lines.get(file.name)!;
    const eol = file.content.includes('\r\n') ? '\r' : '';
    const output: string[] = [];
    for (let index = 0; index <= source.length; index++) {
      const added = insertions.get(file.name)!.get(index);
      if (added) {
        if (eol && output.length && !output.at(-1)!.endsWith(eol)) output[output.length - 1] += eol;
        output.push(...added.map(line => line + eol));
      }
      if (index < source.length && !removed.get(file.name)!.has(index)) output.push(source[index]);
    }
    if (eol && !file.content.endsWith('\n') && output.at(-1)?.endsWith(eol)) output[output.length - 1] = output.at(-1)!.slice(0, -1);
    return { name: file.name, content: output.join('\n') };
  });
  // Resolve after all scalar insertions, including references copied by splits.
  const finalBundle = buildAppBundle(outputFiles);
  const referenceLines = new Map(outputFiles.map(file=>[file.name,file.content.split('\n')]));
  const convertedBySourceAnchor = new Map(converted.map(row=>[JSON.stringify([row.file,row.line]),row]));
  const convertedByAnchor = new Map<string,ModernizeControl>();
  const finalNodes = controlNodes(finalBundle);
  originalNodes.forEach((node,index)=> {
    const row=convertedBySourceAnchor.get(JSON.stringify([node.file,node.line]));
    if (row) convertedByAnchor.set(JSON.stringify([finalNodes[index].file,finalNodes[index].line]),row);
  });
  const references = [...resolvedControlReferences(finalBundle, {includeSelf:true})];
  const sourceMaps = new Map<ParsedProperty, ReturnType<typeof scalarSource>>();
  for (const reference of references) if (!sourceMaps.has(reference.property)) sourceMaps.set(reference.property, scalarSource(reference.property, referenceLines.get(reference.control.file)!));
  // Reverse source order keeps offsets valid for multiple reads on one line.
  for (const reference of references.reverse()) {
    const row = convertedByAnchor.get(JSON.stringify([reference.target.file, reference.target.line]));
    if (!row) continue;
    const pair = catalog.modernization![row.source_type];
    const mapped = Object.entries(pair.references).find(([name]) => name.toLowerCase() === reference.member.toLowerCase());
    if (!mapped || mapped[1]?.toLowerCase() === reference.member.toLowerCase()) continue;
    const { control, property } = reference;
    const open = (reason: string) => row.open_items.push({ file: control.file, control: control.name, property: property.name, line: property.line, reason });
    const before = property.value.slice(reference.referenceSpan.start, reference.referenceSpan.end);
    const owner = convertedByAnchor.get(JSON.stringify([control.file, control.line]));
    const ownerMapping = owner && effectiveModernizationProperty(catalog.modernization![owner.source_type].properties[property.name], control.properties, property.value);
    if (mapped[1] === null) { open(`Reference ${before} has no safe counterpart (~); left unchanged.`); continue; }
    if (reference.name.toLowerCase() !== 'self' && ownerMapping && ownerMapping !== 'same' && ('manual' in ownerMapping || ('drop' in ownerMapping && ownerMapping.impact === 'behaviour'))) {
      open(`Reference ${before} needs ${mapped[1]}; manual/behaviour property is left unchanged.`); continue;
    }
    const memberText = property.value.slice(reference.memberSpan.start, reference.memberSpan.end);
    const replacement = memberText.startsWith("'") ? "'" + mapped[1] + "'" : mapped[1];
    if (!replaceScalarSpan(referenceLines.get(control.file)!, property, reference.memberSpan.start, reference.memberSpan.end, replacement, sourceMaps.get(property))) {
      open(`Reference ${before} could not be located safely in source; left unchanged.`); continue;
    }
    const after = before.slice(0, reference.memberSpan.start - reference.referenceSpan.start) + replacement;
    row.references.unshift({ file: control.file, control: control.name, property: property.name, line: property.line, before, after });
  }
  for (const file of outputFiles) file.content = referenceLines.get(file.name)!.join('\n');
  const classicIcons = originalNodes.filter(node=>node.type==='Classic/Icon');
  if (classicIcons.length && classicIcons.every(node=>convertedBySourceAnchor.has(JSON.stringify([node.file,node.line])))) {
    const row=convertedBySourceAnchor.get(JSON.stringify([classicIcons[0].file,classicIcons[0].line]))!;
    const iconMapping=catalog.modernization!['Classic/Icon'].properties.Icon;
    const iconValues=iconMapping !== 'same' && 'to' in iconMapping ? iconMapping.values : undefined;
    for (const control of formulaNodes(input.bundle)) for (const property of control.properties) {
      if (control.type==='Classic/Icon' && property.name==='Icon') continue;
      const structure=inspectFormulaStructure(property.value,true);
      if (!structure?.isFormula) continue;
      const source=scalarSource(property,files.find(file=>file.name===control.file)!.content.split('\n'));
      for (let index=0;index<structure.tokens.length-2;index++) {
        const name=plainIdentifier(structure,{start:index,end:index+1});
        const member=plainIdentifier(structure,{start:index+2,end:index+3});
        if (name?.toLowerCase()!=='icon' || !member || structure.tokens[index+1].text!=='.' || structure.tokens[index-1]?.text==='.'
          || isInEnclosingBinding(structure,{start:index,end:index+3},name)) continue;
        const proposed=iconValues?.['Icon.'+member];
        const line=(source?.points[structure.tokens[index].span.start]?.line ?? property.line-1)+1;
        row.open_items.push({file:control.file,control:control.name,property:property.name,line,
          reason:`Elsewhere icon enum Icon.${member}: ${proposed ? 'proposed text name '+proposed : 'no field-report text name is known'}; left unchanged. Review consumers before replacing the enum.`});
      }
    }
  }
  const output = validateFiles(outputFiles, catalog);
  // Line movement and source-to-target type changes do not make an existing
  // finding new. Count occurrences to avoid hiding additional identical refusals.
  // Duplicate-name prose embeds every declaration's line number. The control
  // names and occurrence counts establish identity; those locations can move.
  const identity = (issue: Issue) => JSON.stringify([issue.file, issue.control, issue.property, issue.rule,
    issue.rule === 'duplicate-control-name' ? null : issue.detail]);
  const prior = new Map<string, number>();
  for (const issue of gate(input).refusals) prior.set(identity(issue), (prior.get(identity(issue)) ?? 0) + 1);
  const newRefusals = gate(output).refusals.filter(issue => {
    const key = identity(issue), count = prior.get(key) ?? 0;
    if (!count) return true;
    prior.set(key, count - 1); return false;
  });
  return { files: outputFiles, report: {
    converted, skipped,
    summary: { converted: converted.length, skipped: skipped.length, reference_rewrites: converted.reduce((n, row) => n + row.references.length, 0), open_items: converted.reduce((n, row) => n + row.open_items.length, 0) },
    caveat: MODERNIZE_CAVEAT,
    self_check: { input: gate(input), output: gate(output), new_refusals: newRefusals, regression: newRefusals.length > 0 },
  } };
}

export function modernizeSummary(report: ModernizeReport): string {
  const s = report.summary;
  return `${report.self_check.regression ? 'BUG: NEW REFUSE introduced. ' : ''}Modernization: ${s.converted} converted, ${s.skipped} skipped, ${s.reference_rewrites} reference rewrites, ${s.open_items} open items; gate ${report.self_check.output.gate_decision}; ${report.self_check.new_refusals.length} new REFUSE.${s.converted > 0 ? ' ' + MODERNIZE_REORDER_NOTICE : ''}`;
}

export function renderModernizeReport(report: ModernizeReport): string {
  const lines = ['# Modernization report', '', modernizeSummary(report), '', report.caveat, ''];
  for (const row of report.converted) {
    lines.push(`## ${row.file}: ${row.control} — ${row.source_type} → ${row.target_type}`, '');
    for (const item of row.properties) lines.push(`- ${item.property} → ${item.target_property}: ${item.action}; ${JSON.stringify(item.before)} → ${JSON.stringify(item.after)}${item.impact ? '; impact: ' + item.impact : ''}${item.reason ? '; ' + item.reason : ''}`);
    for (const reference of row.references) lines.push(`- Reference ${reference.file}:${reference.line} ${reference.control}.${reference.property}: ${reference.before} → ${reference.after}`);
    for (const edit of row.layout_edits) lines.push(`- Layout ${edit.file}:${edit.line} ${edit.control}.${edit.property}: transformed; ${edit.before} → ${edit.after}`);
    for (const item of row.open_items) lines.push(`- OPEN ${item.file}:${item.line} ${item.control}.${item.property}: ${item.reason}`);
    lines.push('');
  }
  lines.push('## Skipped', '');
  for (const row of report.skipped) lines.push(`- ${row.file}: ${row.control} (${row.source_type}): ${row.reason}`);
  lines.push('', '## Analyzer self-check', '', '```json', JSON.stringify(report.self_check, null, 2), '```', '');
  return lines.join('\n');
}
