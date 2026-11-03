import type { ModernizationBasis, ModernizationEntry, ModernizationProperty } from './catalog.js';
import { inspectFormulaStructure } from './formula-structure.js';

type EffectiveProperty = ModernizationProperty | { to: string; basis: ModernizationBasis; replacement: string; block?: boolean };

/** Recognize a complete literal table with precisely one Value column. */
export function singleColumnItems(value: string | undefined): boolean {
  if (!value) return false;
  const structure = inspectFormulaStructure(value);
  if (!structure?.isFormula) return false;
  const tokens = structure.tokens;
  let index = 1;
  const literal = () => {
    const signed = ['+','-'].includes(tokens[index]?.text);
    if (signed) index++;
    const token = tokens[index];
    if (!token || (signed && token.kind !== 'number') || !(token.kind === 'string' || token.kind === 'number' || /^(?:true|false)$/iu.test(token.text))) return false;
    index++; return true;
  };
  if (tokens[index]?.text === '[') {
    index++;
    if (!literal()) return false;
    while (tokens[index]?.text === ',') { index++; if (!literal()) return false; }
    return tokens[index]?.text === ']' && index + 1 === tokens.length;
  }
  if (tokens[index]?.text.toLowerCase() !== 'table' || tokens[index+1]?.text !== '(') return false;
  index += 2;
  const record = () => {
    if (tokens[index++]?.text !== '{') return false;
    const name = tokens[index++]?.text;
    if (!name || !/^(?:Value|'Value')$/iu.test(name) || tokens[index++]?.text !== ':' || !literal()) return false;
    return tokens[index++]?.text === '}';
  };
  if (!record()) return false;
  while (tokens[index]?.text === ',') { index++; if (!record()) return false; }
  return tokens[index]?.text === ')' && index + 1 === tokens.length;
}

/** Conditional drops become manual review when any named property is authored. */
export function effectiveModernizationProperty(mapping: ModernizationProperty | undefined, properties: readonly { readonly name: string; readonly value?: string }[], value?: string): EffectiveProperty | undefined {
  if (mapping && mapping !== 'same' && 'drop' in mapping
    && mapping.unless_present?.some(name => properties.some(property => property.name === name))) {
    return { manual: mapping.fallback_manual!, targets: [], basis: mapping.basis };
  }
  if (mapping && mapping !== 'same' && 'to' in mapping && mapping.values && mapping.fallback_manual && !mapping.transform) {
    const formula=value?.startsWith('=') ? value.slice(1) : '';
    if (!Object.hasOwn(mapping.values,formula)) return {manual:mapping.fallback_manual,targets:[mapping.to as string],basis:mapping.basis};
  }
  if (mapping && mapping !== 'same' && 'to' in mapping && mapping.transform) {
    const manual = () => ({manual: mapping.fallback_manual!,targets: [mapping.to as string],basis: mapping.basis});
    if (mapping.unless_present?.some(name=>properties.some(p=>p.name===name))) return manual();
    if (mapping.transform === 'value-record') {
      return singleColumnItems(properties.find(p=>p.name==='Items')?.value) && value?.startsWith('=') && value.length > 1
        ? {to:mapping.to as string,basis:mapping.basis,replacement:'={Value: '+value.slice(1)+'}',block:true} : manual();
    }
    if (mapping.transform === 'placeholder') {
      return properties.some(p => p.name === mapping.to)
        ? {drop:'Authored InputTextPlaceholder takes precedence over NoSelectionText.',impact:'cosmetic',basis:mapping.basis}
        : mapping;
    }
    if (mapping.transform === 'text-input-mode') {
      const formula = value?.startsWith('=') ? value.slice(1) : '';
      if (['"SingleLine"','TextInputCanvas.Mode.SingleLine',"'TextInputCanvas.Mode'.SingleLine"].includes(formula)) {
        return {drop:'SingleLine is the ModernTextInput default.',impact:'cosmetic',basis:mapping.basis};
      }
      const target = mapping.values && Object.hasOwn(mapping.values,formula) ? mapping.values[formula] : undefined;
      return target ? {to:mapping.to as string,basis:mapping.basis,replacement:'='+target} : manual();
    }
    const structure = value && inspectFormulaStructure(value);
    const tokens = structure && structure.isFormula ? structure.tokens : [];
    if (tokens.length !== 4 || tokens[0].text !== '=' || tokens[1].text !== '[' || tokens[2].kind !== 'string' || tokens[3].text !== ']') return manual();
    const column = tokens[2].text.slice(1,-1).replaceAll('""','"');
    if (!column) return manual();
    const identifier = /^[A-Za-z_]\w*$/u.test(column) && !/^(true|false|Blank|Self|Parent|ThisItem|As|And|Or|Not)$/iu.test(column)
      ? column : "'" + column.replaceAll("'","''") + "'";
    return {to:mapping.to as string,basis:mapping.basis,replacement:'=ThisItem.'+identifier};
  }
  return mapping;
}

/** Authored-property classification shared by survey and conversion. Unknowns
 * remain the analyzer's responsibility, matching the survey inventory contract. */
export function classifyModernization(properties: readonly { readonly name: string; readonly value?: string }[], pair?: ModernizationEntry) {
  const authored = { same: 0, renamed: 0, manual: 0, dropped_cosmetic: 0, dropped_behaviour: 0 };
  const reviewProperties: string[] = [];
  for (const name of new Set(properties.map(property => property.name))) {
    if (!pair || !Object.hasOwn(pair.properties, name)) continue;
    const mapping = effectiveModernizationProperty(pair.properties[name], properties, properties.find(p=>p.name===name)?.value)!;
    if (mapping === 'same') authored.same++;
    else if ('to' in mapping) authored.renamed++;
    else if ('manual' in mapping || mapping.impact === 'behaviour') {
      if ('manual' in mapping) authored.manual++;
      else authored.dropped_behaviour++;
      // Field-run focus-order drops convert with an explicit behaviour open item.
      if (!('drop' in mapping && name === 'TabIndex' && mapping.basis === 'field-report-2026-10-08#9')) reviewProperties.push(name);
    } else authored.dropped_cosmetic++;
  }
  const guard = pair?.never_convert_when?.find(entry => {
    const property = properties.find(property => property.name === entry.property);
    return entry.condition === 'present' ? property !== undefined
      : property === undefined || property.value?.trim() === '' || property.value?.trim() === '=""';
  });
  if (guard && !reviewProperties.includes(guard.property)) reviewProperties.push(guard.property);
  return { authored, reviewProperties, neverConvertReason: guard?.reason,
    needsReview: pair === undefined || reviewProperties.length > 0 };
}
