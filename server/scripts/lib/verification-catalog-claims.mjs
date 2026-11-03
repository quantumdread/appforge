import { VerificationEditError } from './verification-errors.mjs';

/** Exact catalog identities and declared type vocabulary, without formula inference. */
export function assertVerificationClaimCatalog({ claim, catalog }) {
  const unsupported = message => { throw new VerificationEditError('unsupported-shape', message); };
  if (claim.target.kind === 'observation') return;
  const knownControls = new Set(catalog.controls.map(control => control.type));
  if (!knownControls.has(claim.target.control) || claim.ancestors.some(ancestor => !knownControls.has(ancestor.control))) {
    unsupported('Probe and ancestors must name exact known catalog controls.');
  }
  if (claim.target.kind === 'dump-property' && !catalog.dumpSourced.includes(claim.target.control)) {
    unsupported('Dump property claims require an exact dump-sourced control.');
  }
  const augmentation = Object.hasOwn(catalog.augmentations, claim.target.control) ? catalog.augmentations[claim.target.control] : undefined;
  if (claim.target.kind === 'observed-variant' && !augmentation?.observed_variants?.variants.includes(claim.target.variant)) {
    unsupported('Variant claims require an exact current observed variant.');
  }
  if (claim.target.kind !== 'augmentation-property') return;
  const properties = augmentation?.additional_input_properties ?? {};
  const existing = Object.hasOwn(properties, claim.target.property) ? properties[claim.target.property] : null;
  if (existing && existing.type !== claim.target.property_type) unsupported('Reviewed property type differs from the existing overlay.');
  const types = new Set();
  const addTypes = entries => {
    for (const type of Object.values(entries ?? {})) {
      if (typeof type === 'string' && type !== 'unknown' && !type.startsWith('@enum:')) types.add(type);
    }
  };
  for (const entry of Object.values(catalog.controlProperties)) {
    addTypes(entry.input_properties);
    for (const variant of Object.values(entry.variant_input_properties ?? {})) addTypes(variant);
  }
  for (const entry of Object.values(catalog.parentContextProperties)) addTypes(entry);
  for (const entry of Object.values(catalog.augmentations)) {
    addTypes(Object.fromEntries(Object.entries(entry.additional_input_properties ?? {}).map(([name, property]) => [name, property.type])));
  }
  const type = claim.target.property_type;
  if (type.startsWith('@enum:') ? !Object.hasOwn(catalog.enums, type.slice('@enum:'.length)) : !types.has(type)) {
    unsupported('The explicit property type must be a recognized catalog type or enum reference.');
  }
}
