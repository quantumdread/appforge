/** Strict, side-effect-free source parser and build-time modernization gate. */
export class ModernizationCatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModernizationCatalogError';
    this.code = 'modernization-catalog';
  }
}
const locations = new WeakMap();
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const fail = (path, line, message) => {
  throw new ModernizationCatalogError(`${path} (line ${line ?? 'unknown'}): ${message}`);
};
const lineOf = (object, key) => locations.get(object)?.[key] ?? locations.get(object)?._start;
const at = (object, key, path, message) => fail(path, lineOf(object, key), message);

// Strip comments only outside quoted scalars; preserve # in evidence identifiers.
function uncomment(text, path, line) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (quote === "'" && ch === "'" && text[i + 1] === "'") { i++; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/u.test(text[i - 1]))) return text.slice(0, i).trimEnd();
  }
  if (quote) fail(path, line, 'unterminated quoted scalar');
  return text.trimEnd();
}
function scalar(text, path, line) {
  if (/^\[\s*[A-Za-z]\w*(?:\s*,\s*[A-Za-z]\w*)*\s*\]$/u.test(text)) return text.slice(1, -1).split(',').map(item => item.trim());
  if (text.startsWith('"')) {
    try {
      const value = JSON.parse(text);
      if (typeof value === 'string' && value.length && !/[\r\n]/u.test(value)) return value;
    } catch { /* report the same strict scalar error */ }
  } else if (/^'(?:[^']|'')*'$/u.test(text)) {
    const value = text.slice(1, -1).replaceAll("''", "'");
    if (value.length) return value;
  } else if (text === '~') return null;
  else if (/^[A-Za-z0-9_@./#-]+$/u.test(text)) return text;
  fail(path, line, 'malformed scalar; quote one-line text/formulas');
}
function splitEntry(text, path, line) {
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (quote === '"' && ch === '\\') { i++; continue; }
      if (quote === "'" && ch === "'" && text[i + 1] === "'") { i++; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ':' && (i + 1 === text.length || text[i + 1] === ' ')) {
      return [scalar(text.slice(0, i), path, line), text.slice(i + 1).trim()];
    }
  }
  fail(path, line, 'malformed mapping line');
}

export function parseModernization(text) {
  const root = Object.create(null);
  locations.set(root, { _start: 1 });
  const stack = [{ indent: -2, value: root, path: 'modernization catalog' }];
  let currentPair = 'modernization catalog';
  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  for (const [index, raw] of lines.entries()) {
    const line = index + 1;
    if (/^\s*(?:#.*)?$/u.test(raw)) continue;
    if (/\t|\r/u.test(raw)) fail(currentPair, line, 'tabs/bare CR are not allowed');
    const indent = raw.length - raw.trimStart().length;
    const content = uncomment(raw.trimStart(), currentPair, line);
    const targetItem = content.startsWith('- ') && /\.(?:targets|unless_present)$/u.test(stack.at(-1).path);
    while (stack.length > 1 && (indent < stack.at(-1).indent
      || (indent === stack.at(-1).indent && !targetItem))) stack.pop();
    const parent = stack.at(-1);
    if (indent !== parent.indent + 2 && !(targetItem && indent === parent.indent)) {
      fail(currentPair, line, 'bad indentation; use two-space steps');
    }
    if (parent.path === 'modernization' && indent === 2) {
      currentPair = `modernization.${content.split(':')[0]}`;
    }
    if (Array.isArray(parent.value)) {
      if (parent.path === 'deferred' || /\.(?:add|open_items|never_convert_when)$/u.test(parent.path)) {
        if (!content.startsWith('- ')) fail('deferred', line, 'malformed deferred list line');
        const [key, tail] = splitEntry(content.slice(2), 'deferred', line);
        const first = parent.path === 'deferred' ? 'source' : 'property';
        if (key !== first || !tail) fail(currentPair, line, `list item must begin with ${first}`);
        const item = Object.create(null);
        item[first] = scalar(tail, currentPair, line);
        locations.set(item, { _start: line, [first]: line });
        parent.value.push(item);
        stack.push({ indent, value: item, path: `${parent.path}.${parent.value.length - 1}` });
        continue;
      }
      const listName = parent.path.endsWith('.targets') ? 'targets' : 'behaviour';
      if (!content.startsWith('- ')) fail(currentPair, line, `malformed ${listName} list line`);
      const value = scalar(content.slice(2), currentPair, line);
      if (typeof value !== 'string') fail(currentPair, line, `${listName} requires one-line text`);
      locations.get(parent.value)[parent.value.length] = line;
      parent.value.push(value);
      continue;
    }
    const [key, tail] = splitEntry(content, currentPair, line);
    if (typeof key !== 'string') fail(currentPair, line, 'invalid mapping key');
    if (own(parent.value, key)) fail(currentPair, line, `duplicate key '${key}'`);
    locations.get(parent.value)[key] = line;
    const path = parent.value === root ? key : `${parent.path}.${key}`;
    if (tail) parent.value[key] = scalar(tail, currentPair, line);
    else {
      const value = (key === 'deferred' && indent === 0)
        || (['behaviour', 'add', 'open_items', 'never_convert_when'].includes(key) && indent === 4) || (['targets', 'unless_present'].includes(key) && indent === 8)
        ? [] : Object.create(null);
      locations.set(value, { _start: line });
      parent.value[key] = value;
      stack.push({ indent, value, path });
    }
  }
  validateShape(root, true);
  root.schema_version = 1;
  for (const pair of Object.values(root.modernization)) {
    pair.verified = pair.verified === 'true';
    for (const entry of Object.values(pair.properties)) if (entry !== 'same' && entry.restore_default !== undefined) entry.restore_default = entry.restore_default === 'true';
  }
  return root;
}

const identifier = /^[A-Za-z][\w/]*$/u;
const propertyName = /^[A-Za-z]\w*$/u;
const basisPattern = /^(?:inferred|scratch-compile-2026-10-07|catalog-name-match|field-report-2026-10-08#[1-9]\d*|field-report-2026-10-05(?:-followup)?#[1-9]\d*|studio-update-2026-10-06|version-knowledge-(?:Button@0\.0\.45|TextInput@0\.0\.54|DatePicker@0\.0\.46|CheckBox@0\.0\.30))$/u;
function keys(object, allowed, path, fallbackLine) {
  if (!record(object)) fail(path, fallbackLine, 'must be a mapping');
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) at(object, key, path, `unknown key '${key}'`);
  }
}
function required(object, key, path) {
  if (!own(object, key)) fail(path, lineOf(object, Object.keys(object)[0]), `missing ${key}`);
}
function validateShape(parsed, fromText = false) {
  keys(parsed, ['schema_version', 'last_reviewed', 'modernization', 'deferred'], 'modernization catalog');
  for (const key of ['schema_version', 'last_reviewed', 'modernization']) required(parsed, key, 'modernization catalog');
  if (String(parsed.schema_version) !== '1') at(parsed, 'schema_version', 'modernization catalog', 'schema_version must be 1');
  const date = parsed.last_reviewed;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    at(parsed, 'last_reviewed', 'modernization catalog', 'last_reviewed must be a valid ISO date');
  }
  if (!record(parsed.modernization) || !Object.keys(parsed.modernization).length) {
    at(parsed, 'modernization', 'modernization catalog', 'modernization must be a nonempty mapping');
  }
  if (parsed.deferred !== undefined) {
    if (!Array.isArray(parsed.deferred)) at(parsed, 'deferred', 'deferred', 'must be a block list');
    const seen = new Set();
    for (const entry of parsed.deferred) {
      keys(entry, ['source', 'reason'], 'deferred');
      for (const key of ['source', 'reason']) required(entry, key, 'deferred');
      if (typeof entry.source !== 'string' || !identifier.test(entry.source)) at(entry, 'source', 'deferred', 'invalid source type');
      if (typeof entry.reason !== 'string' || !entry.reason.trim() || /[\r\n]/u.test(entry.reason)) at(entry, 'reason', 'deferred', 'reason must be one-line text');
      if (seen.has(entry.source)) at(entry, 'source', 'deferred', `duplicate source '${entry.source}'`);
      seen.add(entry.source);
    }
  }
  for (const [source, pair] of Object.entries(parsed.modernization)) {
    const path = `modernization.${source}`;
    if (!identifier.test(source)) at(parsed.modernization, source, path, 'invalid source type');
    keys(pair, ['target', 'note', 'behaviour', 'add', 'open_items', 'never_convert_when', 'properties', 'references', 'verified'], path, lineOf(parsed.modernization, source));
    for (const key of ['target', 'properties', 'references', 'verified']) required(pair, key, path);
    if (typeof pair.target !== 'string' || !identifier.test(pair.target)) at(pair, 'target', path, 'invalid target type');
    if (fromText ? !['false', 'true'].includes(pair.verified) : typeof pair.verified !== 'boolean') {
      at(pair, 'verified', path, 'verified must be a boolean');
    }
    if (pair.note !== undefined && (typeof pair.note !== 'string' || !pair.note.length)) at(pair, 'note', path, 'note must be one-line text');
    if (pair.behaviour !== undefined && (!Array.isArray(pair.behaviour) || !pair.behaviour.length
      || pair.behaviour.some(value => typeof value !== 'string' || !value.length))) at(pair, 'behaviour', path, 'behaviour must be a nonempty text list');
    if (pair.add !== undefined) {
      if (!Array.isArray(pair.add) || !pair.add.length) at(pair, 'add', path, 'add must be a nonempty list');
      const seen = new Set();
      for (const entry of pair.add) {
        keys(entry, ['property', 'value', 'basis', 'when'], `${path}.add`);
        for (const key of ['property', 'value', 'basis']) required(entry, key, `${path}.add`);
        if (typeof entry.property !== 'string' || !propertyName.test(entry.property) || seen.has(entry.property)) at(entry, 'property', path, 'invalid or duplicate add property');
        seen.add(entry.property);
        if (typeof entry.value !== 'string' || !entry.value.startsWith('=') || /[\r\n]/u.test(entry.value)) at(entry, 'value', path, 'add value must be a one-line formula');
        if (typeof entry.basis !== 'string' || !basisPattern.test(entry.basis)) at(entry, 'basis', path, 'invalid add basis');
        if (entry.when !== undefined && entry.when !== 'single-column-items') at(entry,'when',path,'when must be single-column-items');
      }
    }
    if (pair.open_items !== undefined) {
      if (!Array.isArray(pair.open_items) || !pair.open_items.length) at(pair,'open_items',path,'open_items must be a nonempty list');
      for (const entry of pair.open_items) {
        keys(entry,['property','reason','basis','when'],`${path}.open_items`);
        for (const key of ['property','reason','basis']) required(entry,key,path);
        if (typeof entry.property !== 'string' || !propertyName.test(entry.property)) at(entry,'property',path,'invalid open item property');
        if (typeof entry.reason !== 'string' || !entry.reason.trim() || /[\r\n]/u.test(entry.reason)) at(entry,'reason',path,'open item requires one-line reason');
        if (typeof entry.basis !== 'string' || !basisPattern.test(entry.basis)) at(entry,'basis',path,'invalid open item basis');
        if (entry.when !== undefined && entry.when !== 'single-column-items') at(entry,'when',path,'when must be single-column-items');
      }
    }
    if (!record(pair.properties)) at(pair, 'properties', path, 'properties must be a mapping');
    if (pair.never_convert_when !== undefined) {
      if (!Array.isArray(pair.never_convert_when) || !pair.never_convert_when.length) at(pair, 'never_convert_when', path, 'never_convert_when must be a nonempty list');
      for (const entry of pair.never_convert_when) {
        keys(entry, ['property', 'condition', 'reason', 'basis'], `${path}.never_convert_when`);
        for (const key of ['property', 'condition', 'reason', 'basis']) required(entry, key, path);
        if (typeof entry.property !== 'string' || !propertyName.test(entry.property)) at(entry, 'property', path, 'invalid guard property');
        if (!['present', 'empty'].includes(entry.condition)) at(entry, 'condition', path, 'condition must be present or empty');
        if (typeof entry.reason !== 'string' || !entry.reason.trim() || /[\r\n]/u.test(entry.reason)) at(entry, 'reason', path, 'guard reason must be one-line text');
        if (typeof entry.basis !== 'string' || !basisPattern.test(entry.basis)) at(entry, 'basis', path, 'invalid guard basis');
      }
    }
    for (const [property, entry] of Object.entries(pair.properties)) {
      const pp = `${path}.properties.${property}`;
      if (!propertyName.test(property)) at(pair.properties, property, path, 'invalid property name');
      if (entry === 'same') continue;
      keys(entry, ['to', 'drop', 'restore_default', 'impact', 'manual', 'targets', 'values', 'scale', 'transform', 'basis', 'unless_present', 'fallback_manual'], pp, lineOf(pair.properties, property));
      if (['to', 'drop', 'manual'].filter(key => own(entry, key)).length !== 1) {
        at(pair.properties, property, pp, 'choose exactly one of same, to, manual or drop');
      }
      if (own(entry, 'to')) {
        const targets = Array.isArray(entry.to) ? entry.to : [entry.to];
        if (!targets.length || targets.some(name => typeof name !== 'string' || !propertyName.test(name)) || new Set(targets).size !== targets.length) at(entry, 'to', pp, 'to must name unique input properties');
        if (Array.isArray(entry.to) && (own(entry, 'values') || own(entry, 'scale'))) at(entry, 'to', pp, 'split to cannot transform values/scale');
      }
      if (own(entry, 'manual')) {
        if (typeof entry.manual !== 'string' || !entry.manual.length || /[\r\n]/u.test(entry.manual)
          || own(entry, 'values') || own(entry, 'scale')) at(entry, 'manual', pp, 'manual requires a one-line instruction and cannot transform values/scale');
        required(entry, 'targets', pp);
        if (!Array.isArray(entry.targets) || !entry.targets.length
          || entry.targets.some(value => typeof value !== 'string' || !propertyName.test(value))) {
          at(entry, 'targets', pp, 'targets must be a nonempty input property list');
        }
        const seen = new Set();
        for (const [index, target] of entry.targets.entries()) {
          if (seen.has(target)) at(entry.targets, index, pp, `duplicate target '${target}'`);
          seen.add(target);
        }
      } else if (own(entry, 'targets')) at(entry, 'targets', pp, 'targets is only allowed on manual entries');
      if (own(entry, 'drop') && (typeof entry.drop !== 'string' || !entry.drop.length
        || own(entry, 'values') || own(entry, 'scale'))) at(entry, 'drop', pp, 'drop requires a reason and cannot transform values/scale');
      if (own(entry, 'drop')) {
        required(entry, 'impact', pp);
        if (!['cosmetic', 'behaviour'].includes(entry.impact)) at(entry, 'impact', pp, 'impact must be cosmetic or behaviour');
      } else if (own(entry, 'impact')) at(entry, 'impact', pp, 'impact is only allowed on drop entries');
      if (own(entry,'restore_default') && (!own(entry,'drop') || entry.restore_default !== (fromText ? 'true' : true))) at(entry,'restore_default',pp,'restore_default is true only on drop entries');
      if (own(entry, 'unless_present')) {
        if (!own(entry, 'drop') && !own(entry,'transform')) at(entry, 'unless_present', pp, 'unless_present is only allowed on drop or transform entries');
        if (!Array.isArray(entry.unless_present) || !entry.unless_present.length || entry.unless_present.some(name => typeof name !== 'string' || !propertyName.test(name)) || new Set(entry.unless_present).size !== entry.unless_present.length) at(entry, 'unless_present', pp, 'unless_present must be a nonempty unique property list');
        required(entry, 'fallback_manual', pp);
        if (typeof entry.fallback_manual !== 'string' || !entry.fallback_manual.trim() || /[\r\n]/u.test(entry.fallback_manual)) at(entry, 'fallback_manual', pp, 'fallback_manual must be a one-line review instruction');
      } else if (own(entry, 'fallback_manual') && !own(entry, 'transform') && !own(entry,'values')) at(entry, 'fallback_manual', pp, 'fallback_manual requires unless_present, transform or values');
      if (own(entry,'fallback_manual') && (typeof entry.fallback_manual !== 'string' || !entry.fallback_manual.trim() || /[\r\n]/u.test(entry.fallback_manual))) at(entry,'fallback_manual',pp,'fallback_manual must be one-line text');
      if (own(entry, 'transform')) {
        if (typeof entry.to !== 'string' || !['display-field','placeholder','text-input-mode','value-record'].includes(entry.transform) || own(entry,'scale') || (own(entry,'values') && entry.transform !== 'text-input-mode')) at(entry,'transform',pp,'transform requires a scalar to and a supported transform without incompatible values/scale');
        if (typeof entry.fallback_manual !== 'string' || !entry.fallback_manual.trim() || /[\r\n]/u.test(entry.fallback_manual)) at(entry,'fallback_manual',pp,'transform requires one-line fallback_manual');
      }
      if (own(entry, 'values') && (!record(entry.values) || !Object.keys(entry.values).length
        || Object.entries(entry.values).some(([key, value]) => !key.length || typeof value !== 'string' || !value.length))) at(entry, 'values', pp, 'values must map nonempty source formulas to target formulas');
      // Basis and numeric scale semantics are checked at the gate, including in-memory inputs.
    }
    if (!record(pair.references)) at(pair, 'references', path, 'references must be a mapping');
    for (const [member, target] of Object.entries(pair.references)) {
      if (!propertyName.test(member) || (target !== null && (typeof target !== 'string' || !propertyName.test(target)))) {
        at(pair.references, member, path, 'references require member names or ~');
      }
    }
  }
}

const inputSurface = (control, augmentations) => ({
  ...control?.input_properties,
  ...Object.fromEntries(Object.entries(augmentations?.additional_input_properties ?? {})
    .map(([name, entry]) => [name, entry.type])),
});
const enumName = type => typeof type === 'string' && type.startsWith('@enum:') ? type.slice(6) : null;
function positiveScale(value) {
  if (typeof value !== 'string' || !/^(?:\d+\/\d+|\d+(?:\.\d+)?|\.\d+)$/u.test(value)) return false;
  const [a, b = '1'] = value.split('/');
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Number(a) > 0 && Number(b) > 0;
}
function enumMember(formula, name, members) {
  let member;
  if (/^"(?:[^"\r\n]|"")+"$/u.test(formula)) member = formula.slice(1, -1).replaceAll('""', '"');
  else if (formula.startsWith(`${name}.`)) member = formula.slice(name.length + 1);
  else if (formula.startsWith(`'${name}'.`)) member = formula.slice(name.length + 3);
  else return false;
  return members.some(value => value === member || value === `${name}.${member}` || value === `"${member}"`);
}

export function validateModernization(parsed, { manifestControls, controlProperties, augmentations = {}, enums = {} }) {
  validateShape(parsed);
  const summary = { pairs: 0, properties: 0, same: 0, renamed: 0, manual: 0,
    droppedCosmetic: 0, droppedBehaviour: 0, inferred: 0, verified: 0 };
  const manifest = new Map(manifestControls.map(control => [control.type, control]));
  for (const entry of parsed.deferred ?? []) {
    if (!manifest.has(entry.source)) at(entry, 'source', 'deferred', `type '${entry.source}' is absent from extracted manifest`);
    if (own(parsed.modernization, entry.source)) at(entry, 'source', 'deferred', `type '${entry.source}' already has a modernization pair`);
  }
  const targets = new Set(Object.values(parsed.modernization).map(pair => pair.target));
  for (const [source, pair] of Object.entries(parsed.modernization)) {
    const path = `modernization.${source}`;
    const pairLine = lineOf(parsed.modernization, source);
    const bad = message => fail(path, pairLine, message);
    if (!manifest.has(source)) bad(`source type '${source}' is absent from extracted manifest`);
    const sourceFamily = manifest.get(source).family;
    if (!['Classic', 'FluentV9'].includes(sourceFamily)) {
      bad(`source '${source}' must have family Classic or FluentV9`);
    }
    if (sourceFamily === 'FluentV9' && targets.has(source)) {
      bad(`FluentV9 source '${source}' must not also appear as a target`);
    }
    if (!manifest.has(pair.target)) bad(`target type '${pair.target}' is absent from extracted manifest`);
    if (!pair.target.startsWith('Modern') || manifest.get(pair.target).family !== 'React') {
      bad(`target '${pair.target}' must be a Modern* type with family React`);
    }
    if (!controlProperties[source] || !controlProperties[pair.target]) bad('source and target require extracted property lists');
    const sourceInputs = inputSurface(controlProperties[source], augmentations[source]);
    const targetInputs = inputSurface(controlProperties[pair.target], augmentations[pair.target]);
    for (const entry of pair.add ?? []) {
      if (!own(targetInputs, entry.property)) at(entry, 'property', `${path}.add`, `target input property '${entry.property}' does not exist on ${pair.target}`);
    }
    for (const entry of [...(pair.add ?? []), ...(pair.open_items ?? [])]) {
      if (!own(targetInputs,entry.property)) at(entry,'property',path,`target input property '${entry.property}' does not exist on ${pair.target}`);
      if (entry.when && sourceInputs.Items !== 'Table') at(entry,'when',path,'single-column-items requires source Items Table');
    }
    for (const entry of pair.never_convert_when ?? []) {
      if (!own(sourceInputs, entry.property)) at(entry, 'property', `${path}.never_convert_when`, `guard '${entry.property}' is outside source input surface`);
    }
    for (const name of Object.keys(sourceInputs)) {
      if (!own(pair.properties, name)) bad(`missing source property '${name}'`);
    }
    for (const [name, entry] of Object.entries(pair.properties)) {
      const pp = `${path}.properties.${name}`;
      const propBad = message => fail(pp, lineOf(pair.properties, name) ?? pairLine, message);
      if (!own(sourceInputs, name)) propBad(`property '${name}' is outside source input surface`);
      for (const condition of entry.unless_present ?? []) {
        if (!own(sourceInputs, condition)) propBad(`unless_present '${condition}' is outside source input surface`);
      }
      summary.properties++;
      if (entry !== 'same') {
        if (typeof entry.basis !== 'string' || !basisPattern.test(entry.basis)) propBad('basis is required: field-report-2026-10-05[#item/-followup#n], studio-update-2026-10-06, scratch-compile-2026-10-07, version-knowledge-<Type>@<version>, catalog-name-match or inferred');
        if (entry.basis === 'inferred') summary.inferred++;
        if (own(entry, 'manual')) {
          for (const target of entry.targets) {
            if (!own(targetInputs, target)) propBad(`target input property '${target}' does not exist on ${pair.target}`);
          }
          summary.manual++;
          continue;
        }
        if (own(entry, 'drop')) {
          if (entry.restore_default) {
            if (!own(targetInputs,name) || sourceInputs[name] !== targetInputs[name]) propBad('restore_default requires a compatible target input property');
          } else if (own(targetInputs, name)) propBad(`drop '${name}' is still present on target ${pair.target}`);
          summary[entry.impact === 'cosmetic' ? 'droppedCosmetic' : 'droppedBehaviour']++;
          continue;
        }
      }
      if (entry !== 'same' && Array.isArray(entry.to)) {
        for (const target of entry.to) {
          if (!own(targetInputs, target)) propBad(`target input property '${target}' does not exist on ${pair.target}`);
          if (sourceInputs[name] !== targetInputs[target]) propBad('split requires compatible types on every target');
        }
        summary.renamed++;
        continue;
      }
      const target = entry === 'same' ? name : entry.to;
      if (!own(targetInputs, target)) propBad(`target input property '${target}' does not exist on ${pair.target}`);
      const sourceType = sourceInputs[name], targetType = targetInputs[target];
      if (entry !== 'same' && entry.transform) {
        const expected = entry.transform === 'display-field' ? ['DisplayFields','ItemDisplayText','Table','Text'] : entry.transform === 'placeholder' ? ['NoSelectionText','InputTextPlaceholder','Text','Text'] : entry.transform === 'text-input-mode' ? ['Mode','Type','@enum:TextInputCanvas.Mode','@enum:TextInputType'] : ['Default','Default','Text','Record'];
        if (name !== expected[0] || target !== expected[1] || sourceType !== expected[2] || targetType !== expected[3]) propBad('transform requires its declared source/target surface and types');
      }
      const se = enumName(sourceType), te = enumName(targetType);
      if (se && te && se !== te && !entry.values) propBad(`enum mismatch ${se} -> ${te} requires values`);
      if (entry === 'same' && sourceType !== targetType) propBad(`same requires compatible types (${sourceType} -> ${targetType})`);
      if (entry !== 'same' && own(entry, 'values')) {
        if (te) {
          const members = enums[te];
          if (!Array.isArray(members)) propBad(`target enum '${te}' is absent`);
          for (const value of Object.values(entry.values)) {
            if (!enumMember(value, te, members)) propBad(`target enum '${te}' has no member for '${value}'`);
          }
        }
      }
      if (entry !== 'same' && own(entry, 'scale')) {
        if (sourceType !== 'Number' || targetType !== 'Number') propBad('scale requires Number on both sides');
        if (!positiveScale(entry.scale)) propBad('scale must be a positive rational a/b or decimal');
      }
      summary[entry === 'same' ? 'same' : 'renamed']++;
    }
    const readableSource = new Set([...Object.keys(sourceInputs), ...(controlProperties[source]?.output_properties ?? [])]);
    const readableTarget = new Set([...Object.keys(targetInputs), ...(controlProperties[pair.target]?.output_properties ?? [])]);
    for (const [member, target] of Object.entries(pair.references)) {
      if (!readableSource.has(member)) at(pair.references, member, path, `reference '${member}' is outside source readable surface`);
      if (target !== null && !readableTarget.has(target)) at(pair.references, member, path, `reference '${target}' is outside target readable surface`);
    }
    summary.pairs++;
    if (pair.verified) summary.verified++;
  }
  return { map: parsed.modernization, deferred: parsed.deferred ?? [], summary };
}

export function modernizationSummary(summary) {
  return `✓ modernization gate: ${summary.pairs} pairs, ${summary.properties} properties (${summary.same} same, ${summary.renamed} renamed, ${summary.manual} manual, ${summary.droppedCosmetic} dropped-cosmetic, ${summary.droppedBehaviour} dropped-behaviour), ${summary.inferred} inferred, ${summary.verified} verified`;
}
