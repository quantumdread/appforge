/**
 * Catalog query helpers.
 *
 * The auto-extracted catalog (CONTROLS, CONTROL_PROPERTIES) is the spine.
 * AUGMENTATIONS overlays notes, legacy variants, and additional input
 * properties with verification status. These helpers merge the two views
 * for tool consumers.
 */
import {
  CONTROLS,
  CONTROL_PROPERTIES,
  AUGMENTATIONS,
  ENUMS,
  PARENT_CONTEXT_PROPERTIES,
  DUMP_SOURCED,
} from '../generated/catalog.js';
import type { CurrentVariant } from '../core/catalog.js';

const DUMP_SOURCED_SET = new Set<string>(DUMP_SOURCED);

export type VerifiedStatus = 'verified' | 'unverified';

export type MergedAdditionalProperty = {
  type: string;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  claim_scope: string | null;
  environment: string | null;
  reproduction: string | null;
  falsifier: string | null;
};

export type MergedControl = {
  type: string;
  family: string | null;
  version: string | null;
  variants: string[];
  legacy_variants: string[];
  current_variants: CurrentVariant[];
  input_properties: Record<string, string>;
  variant_input_properties: Record<string, Record<string, string>>;
  additional_input_properties: Record<string, MergedAdditionalProperty>;
  parent_context: string[];
  output_properties: string[];
  notes: string[];
  /** Origin of the catalog entry. 'studio-dump' for recovered controls; null for extractor-sourced. */
  source: string | null;
  /** True when the catalog data is a lower bound (studio-dump) — unknown props/variants WARN, not REFUSE. */
  partial: boolean;
};

/** Resolve an enum reference string ("@enum:Foo") to its values, or null. */
export function resolveEnum(value: string): string[] | null {
  if (typeof value !== 'string' || !value.startsWith('@enum:')) return null;
  const name = value.slice('@enum:'.length);
  return (ENUMS as Record<string, readonly string[]>)[name] as string[] | undefined ?? null;
}

/** Return the merged view of a control (auto + augmentation), or null. */
export function getMergedControl(type: string): MergedControl | null {
  const manifest = (CONTROLS as ReadonlyArray<{ type: string; family: string | null; version: string | null; variants: readonly string[]; source?: string }>)
    .find(c => c.type === type);
  if (!manifest) return null;

  const props = (CONTROL_PROPERTIES as Record<string, any>)[type] ?? {
    family: manifest.family, variants: manifest.variants,
    input_properties: {}, variant_input_properties: {},
    parent_context: [], output_properties: [],
  };
  const aug = (AUGMENTATIONS as Record<string, any>)[type] ?? {
    notes: [], legacy_variants: [], additional_input_properties: {},
  };

  return {
    type: manifest.type,
    family: manifest.family,
    version: manifest.version,
    variants: [...manifest.variants, ...(aug.current_variants ?? []).map((entry: CurrentVariant) => entry.name)],
    legacy_variants: aug.legacy_variants ?? [],
    current_variants: aug.current_variants ?? [],
    input_properties: props.input_properties ?? {},
    variant_input_properties: props.variant_input_properties ?? {},
    additional_input_properties: aug.additional_input_properties ?? {},
    parent_context: props.parent_context ?? [],
    output_properties: props.output_properties ?? [],
    notes: aug.notes ?? [],
    source: manifest.source ?? null,
    partial: DUMP_SOURCED_SET.has(manifest.type),
  };
}

/** Categorise a control loosely for the `category` filter on list_controls. */
function categoryOf(c: MergedControl): string[] {
  const cats: string[] = ['all'];
  if (c.type.startsWith('Classic/')) cats.push('classic');
  else if (c.family === 'FluentV9' || c.family === 'React') cats.push('modern');
  if (['GroupContainer', 'Gallery', 'Form', 'EntityForm', 'FormViewer', 'DataTable', 'DataGrid', 'ModernDataGrid'].includes(c.type)) cats.push('layout');
  if (['TextInput', 'ModernTextInput', 'NumberInput', 'ModernNumberInput', 'DatePicker', 'ModernDatePicker', 'DropDown', 'ModernDropdown', 'ComboBox', 'ModernCombobox', 'CheckBox', 'Toggle', 'Radio', 'ModernRadio', 'Slider', 'ModernSlider', 'Rating', 'RichTextEditor'].includes(c.type)) cats.push('input');
  if (['ModernText', 'Text', 'Label', 'Image', 'Avatar', 'Badge', 'Icon', 'ModernIcon', 'BarChart', 'LineChart', 'PieChart', 'Progress', 'HtmlViewer', 'PDFViewer', 'Video', 'StreamVideo', 'Audio'].includes(c.type)) cats.push('display');
  return cats;
}

/** List all controls, optionally filtered by category. */
export function listMergedControls(category: string = 'all'): MergedControl[] {
  const all = (CONTROLS as ReadonlyArray<{ type: string }>).map(c => getMergedControl(c.type)!).filter(Boolean);
  if (category === 'all') return all;
  return all.filter(c => categoryOf(c).includes(category));
}

/** Search controls by keyword across name, properties, and notes. */
export function searchMergedControls(query: string): MergedControl[] {
  const q = query.toLowerCase();
  return listMergedControls().filter(c => {
    if (c.type.toLowerCase().includes(q)) return true;
    if (Object.keys(c.input_properties).some(p => p.toLowerCase().includes(q))) return true;
    for (const v of Object.values(c.variant_input_properties)) {
      if (Object.keys(v).some(p => p.toLowerCase().includes(q))) return true;
    }
    if (Object.keys(c.additional_input_properties).some(p => p.toLowerCase().includes(q))) return true;
    if (c.notes.some(n => n.toLowerCase().includes(q))) return true;
    return false;
  });
}

export { ENUMS, PARENT_CONTEXT_PROPERTIES };
