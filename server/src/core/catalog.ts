/**
 * Catalog contract consumed by the analyzer core.
 *
 * The core never imports generated data and never performs I/O. Execution
 * surfaces construct this value and inject it for each analysis call.
 */
export const AUGMENTATION_SCHEMA_VERSION = 7;

export const CLAIM_SCOPES = [
  'compiler_accepts',
  'roundtrip_preserves',
  'studio_materializes',
  'studio_renders',
  'player_behaves',
] as const;
export type ClaimScope = typeof CLAIM_SCOPES[number];

export type VerifiedBy =
  | 'compile_canvas'
  | `studio-export-${string}`
  | 'runtime_observation'
  | 'studio-observation';

export type AugmentationEvidence = {
  verified_at?: string | null;
  verified_by?: VerifiedBy | null;
  claim_scope?: ClaimScope | null;
  environment?: string | null;
  reproduction?: string | null;
  falsifier?: string | null;
};

export type AdditionalInputProperty = AugmentationEvidence & {
  type: string;
  verified: boolean;
};

export type SyntheticControlMetadata = AugmentationEvidence & {
  family: string | null;
  source: string | null;
  verified: boolean;
  requires_sibling: string | null;
  input_properties: Readonly<Record<string, string>>;
};

export type DumpSourcedControlMetadata = AugmentationEvidence & {
  family: string | null;
  version: string | null;
  variants: readonly string[];
  source: string | null;
  verified: boolean;
  input_properties: Readonly<Record<string, string>>;
};

/**
 * Variant names current Studio ACCEPTS but no longer EMITS (schema_version 7+).
 *
 * They can never earn studio-export evidence, so the class is always
 * `runtime_observation` — which makes all four structured evidence fields
 * mandatory. Semantics at the gate: WARN (`partial-catalog-data`), never REFUSE,
 * and the control's properties are still validated normally. Names must be
 * disjoint from `legacy_variants` and from the extractor's variant list.
 */
export type ObservedVariants = {
  evidence: AugmentationEvidence;
  variants: readonly string[];
};

export type PropertyRename = {
  from: string;
  to: readonly string[];
};

export type FormulaRewrite = {
  from: string;
  to: string;
};

export type VersionKnowledgeEntry = {
  target_type: string;
  target_version: string;
  property_renames: readonly PropertyRename[];
  formula_rewrites: readonly FormulaRewrite[];
  migration_note?: string;
  evidence: string;
  observed_at: string;
  lower_bound: true;
};

export type ModernizationBasis =
  | `field-report-2026-10-08#${number}`
  | `field-report-2026-10-05#${number}`
  | `field-report-2026-10-05-followup#${number}`
  | 'studio-update-2026-10-06'
  | 'scratch-compile-2026-10-07'
  | 'version-knowledge-Button@0.0.45'
  | 'version-knowledge-TextInput@0.0.54'
  | 'version-knowledge-DatePicker@0.0.46'
  | 'version-knowledge-CheckBox@0.0.30'
  | 'catalog-name-match'
  | 'inferred';

export type ModernizationProperty =
  | 'same'
  | {
    to: string | readonly string[];
    values?: Readonly<Record<string, string>>;
    scale?: string;
    transform?: 'display-field' | 'placeholder' | 'text-input-mode' | 'value-record';
    unless_present?: readonly string[];
    fallback_manual?: string;
    basis: ModernizationBasis;
  }
  | { manual: string; targets: readonly string[]; basis: ModernizationBasis }
  | { drop: string; impact: 'cosmetic' | 'behaviour'; basis: ModernizationBasis; unless_present?: readonly string[]; fallback_manual?: string; restore_default?: true };

/** Draft mappings checked against the extracted catalog at build time. */
export type ModernizationEntry = {
  target: string;
  add?: readonly { property: string; value: string; basis: ModernizationBasis; when?: 'single-column-items' }[];
  open_items?: readonly { property: string; reason: string; basis: ModernizationBasis; when?: 'single-column-items' }[];
  never_convert_when?: readonly { property: string; condition: 'present' | 'empty'; reason: string; basis: ModernizationBasis }[];
  note?: string;
  behaviour?: readonly string[];
  properties: Readonly<Record<string, ModernizationProperty>>;
  references: Readonly<Record<string, string | null>>;
  verified: boolean;
};

export type ClaimRef =
  | `augmentation:${string}.${string}`
  | `dump_sourced:${string}`
  // The catalog: scheme is pinned (schema + validator + type) but no producer
  // emits it yet — per-finding claim refs arrive with claim-ref wiring in a
  // later plan. Deliberately unreachable, not dead code.
  | `catalog:${string}.${string}`;

export type EvidenceClassSummary = {
  claim_ref: ClaimRef;
  evidence_class: string;
  falsifier?: string;
};

export type AnalyzerCatalogData = {
  /** Function namespace injected by adapters for rename collision checks. */
  functionNames?: readonly string[];
  augmentationSchemaVersion: number;
  /** Generated catalog identity — the extractor's `extracted_at` value. */
  catalogVersion: string;
  /** ISO-8601 extraction timestamp; the survey derives staleness from it. */
  extractedAt: string;
  versionKnowledge: Readonly<Record<string, VersionKnowledgeEntry>>;
  modernization?: Readonly<Record<string, ModernizationEntry>>;
  modernizationDeferred?: readonly { source: string; reason: string }[];
  evidenceClasses: readonly EvidenceClassSummary[];
  controls: ReadonlyArray<{ type: string; variants: readonly string[]; family?: string | null; source?: string | null;
    /** Replacement the authoring service names for a superseded control (extracted 2026-11-11 onward). */
    superseded_by?: string | null; listed?: boolean }>;
  controlProperties: Readonly<Record<string, {
    output_properties?: readonly string[];
    input_properties?: Readonly<Record<string, string>>;
    variant_input_properties?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    common_variant_properties?: Readonly<Record<string, string>>;
    variant_property_variants?: Readonly<Record<string, readonly string[]>>;
    parent_context?: readonly string[];
  }>>;
  augmentations: Readonly<Record<string, {
    legacy_variants?: readonly string[];
    current_variants?: readonly CurrentVariant[];
    observed_variants?: ObservedVariants;
    additional_input_properties?: Readonly<Record<string, AdditionalInputProperty>>;
  }>>;
  dumpSourcedControls?: Readonly<Record<string, DumpSourcedControlMetadata>>;
  syntheticControls?: Readonly<Record<string, SyntheticControlMetadata>>;
  parentContextProperties: Readonly<Record<string, Readonly<Record<string, string>>>>;
  dumpSourced: readonly string[];
  enums: Readonly<Record<string, readonly string[]>>;
};

export type CurrentVariant = {
  name: string;
  verified: true;
  verified_at: string;
  verified_by: 'compile_canvas';
};

const CLAIM_SCOPE_SET: ReadonlySet<string> = new Set(CLAIM_SCOPES);
const BLOCK_SCALAR_INDICATORS: ReadonlySet<string> = new Set(['|', '|-', '>', '>-']);
const EVIDENCE_FIELDS = [
  'verified_at',
  'verified_by',
  'claim_scope',
  'environment',
  'reproduction',
  'falsifier',
] as const;
const REQUIRED_RUNTIME_EVIDENCE_FIELDS = [
  'claim_scope',
  'environment',
  'reproduction',
  'falsifier',
] as const;

const isIsoDate = (value: string): boolean => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf())
    && date.getUTCFullYear() === Number(match[1])
    && date.getUTCMonth() + 1 === Number(match[2])
    && date.getUTCDate() === Number(match[3]);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const CLAIM_REF = /^(?:augmentation:[^.]+\..+|dump_sourced:.+|catalog:[^.]+\..+)$/u;

function versionKnowledgeError(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (typeof value.target_type !== 'string' || value.target_type.length === 0) {
    return `${path}.target_type must be a non-empty string`;
  }
  if (typeof value.target_version !== 'string' || !/^\d+(?:\.\d+){2}$/u.test(value.target_version)) {
    return `${path}.target_version must be a major.minor.patch string`;
  }
  if (!Array.isArray(value.property_renames)) return `${path}.property_renames must be an array`;
  for (const [index, rename] of value.property_renames.entries()) {
    if (!isRecord(rename)
      || typeof rename.from !== 'string'
      || rename.from.length === 0
      || !Array.isArray(rename.to)
      || rename.to.length === 0
      || rename.to.some(target => typeof target !== 'string' || target.length === 0)) {
      return `${path}.property_renames[${index}] must carry non-empty from and to: string[]`;
    }
  }
  if (!Array.isArray(value.formula_rewrites)) return `${path}.formula_rewrites must be an array`;
  for (const [index, rewrite] of value.formula_rewrites.entries()) {
    if (!isRecord(rewrite)
      || typeof rewrite.from !== 'string'
      || rewrite.from.length === 0
      || typeof rewrite.to !== 'string'
      || rewrite.to.length === 0) {
      return `${path}.formula_rewrites[${index}] must carry non-empty from and to strings`;
    }
  }
  if (value.migration_note !== undefined
    && (typeof value.migration_note !== 'string' || value.migration_note.length === 0)) {
    return `${path}.migration_note must be a non-empty string when present`;
  }
  if (typeof value.evidence !== 'string' || value.evidence.length === 0) {
    return `${path}.evidence must be a non-empty string`;
  }
  if (typeof value.observed_at !== 'string' || !isIsoDate(value.observed_at)) {
    return `${path}.observed_at must be an ISO date`;
  }
  if (value.lower_bound !== true) return `${path}.lower_bound must be true`;
  return null;
}

/**
 * Validate one `observed_variants` block, independently of the build parser.
 * Same rigor as versionKnowledgeError: shape, required evidence class, the four
 * structured fields (via augmentationEvidenceError), and disjointness from every
 * vocabulary that PASSes.
 */
function observedVariantsError(
  value: unknown,
  path: string,
  legacyVariants: readonly string[],
  manifestVariants: ReadonlySet<string>,
  currentVariants: readonly string[] = [],
): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (!isRecord(value.evidence)) {
    return `${path}.evidence must be an object carrying verified_by: runtime_observation and all four structured fields`;
  }
  const evidence = value.evidence as AugmentationEvidence;
  const evidenceError = augmentationEvidenceError(evidence, `${path}.evidence`);
  if (evidenceError) return evidenceError;
  if (evidence.verified_by !== 'runtime_observation') {
    return `${path}.evidence.verified_by must be runtime_observation (got ${String(evidence.verified_by)})`;
  }
  if (!Array.isArray(value.variants) || value.variants.length === 0) {
    return `${path}.variants must be a non-empty array of variant names`;
  }
  const legacySet = new Set(legacyVariants);
  const seen = new Set<string>();
  for (const [index, variant] of value.variants.entries()) {
    if (typeof variant !== 'string' || variant.trim().length === 0) {
      return `${path}.variants[${index}] must be a non-empty string`;
    }
    if (seen.has(variant)) return `${path}.variants repeats '${variant}'`;
    seen.add(variant);
    if (legacySet.has(variant)) {
      return `${path}.variants '${variant}' also appears in legacy_variants — a variant belongs to exactly one vocabulary`;
    }
    if (currentVariants.includes(variant)) {
      return `${path}.variants '${variant}' also appears in current_variants — a variant belongs to exactly one vocabulary`;
    }
    if (manifestVariants.has(variant)) {
      return `${path}.variants '${variant}' is already an extractor-emitted variant — retire it from observed_variants`;
    }
  }
  return null;
}

function evidenceClassError(value: unknown, path: string): string | null {
  if (!isRecord(value)) return `${path} must be an object`;
  if (typeof value.claim_ref !== 'string' || !CLAIM_REF.test(value.claim_ref)) {
    return `${path}.claim_ref does not match the catalog claim-ref scheme`;
  }
  if (typeof value.evidence_class !== 'string' || value.evidence_class.length === 0) {
    return `${path}.evidence_class must be a non-empty string`;
  }
  if (value.falsifier !== undefined
    && (typeof value.falsifier !== 'string' || value.falsifier.length === 0)) {
    return `${path}.falsifier must be a non-empty string when present`;
  }
  return null;
}

/** Return a schema error for one evidence-bearing entry, or null when valid. */
export function augmentationEvidenceError(
  evidence: AugmentationEvidence,
  path: string,
): string | null {
  for (const field of EVIDENCE_FIELDS) {
    if (BLOCK_SCALAR_INDICATORS.has(evidence[field] as string)) {
      return `${path}.${field}: evidence fields must be single-line scalars — quote the text`;
    }
  }
  const verifiedBy = evidence.verified_by;
  if (verifiedBy !== undefined && verifiedBy !== null) {
    const valid = typeof verifiedBy === 'string' && (verifiedBy === 'compile_canvas'
      || verifiedBy === 'runtime_observation'
      || verifiedBy === 'studio-observation'
      || (verifiedBy.startsWith('studio-export-')
        && isIsoDate(verifiedBy.slice('studio-export-'.length))));
    if (!valid) {
      return `${path}.verified_by '${String(verifiedBy)}' is invalid; expected compile_canvas, studio-export-<YYYY-MM-DD>, runtime_observation, or legacy studio-observation`;
    }
  }

  if (evidence.claim_scope !== undefined && evidence.claim_scope !== null
    && (typeof evidence.claim_scope !== 'string' || !CLAIM_SCOPE_SET.has(evidence.claim_scope))) {
    return `${path}.claim_scope '${String(evidence.claim_scope)}' is invalid; expected one of: ${CLAIM_SCOPES.join(', ')}`;
  }

  for (const field of ['environment', 'reproduction', 'falsifier'] as const) {
    const value = evidence[field];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return `${path}.${field} must be a string when present`;
    }
  }

  if (verifiedBy === 'runtime_observation' || verifiedBy === 'studio-observation') {
    for (const field of REQUIRED_RUNTIME_EVIDENCE_FIELDS) {
      const value = evidence[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        return `${path} uses ${verifiedBy} and therefore requires non-empty ${REQUIRED_RUNTIME_EVIDENCE_FIELDS.join(', ')}`;
      }
    }
  }
  return null;
}

/**
 * Validate evidence supplied to the pure core, independently of the catalog
 * build parser. This protects alternate adapters/injected catalogs as well as
 * the generated Worker/CLI catalog.
 */
export function assertValidAugmentationCatalog(catalogData: AnalyzerCatalogData): void {
  if (typeof catalogData.catalogVersion !== 'string' || catalogData.catalogVersion.length === 0) {
    throw new Error('injected catalog is missing catalogVersion');
  }
  if (typeof catalogData.extractedAt !== 'string' || !Number.isFinite(Date.parse(catalogData.extractedAt))) {
    throw new Error('injected catalog has a missing or unparseable extractedAt');
  }
  if (catalogData.augmentationSchemaVersion !== AUGMENTATION_SCHEMA_VERSION) {
    throw new Error(
      `control augmentations schema_version must be ${AUGMENTATION_SCHEMA_VERSION} (got ${String(catalogData.augmentationSchemaVersion)})`,
    );
  }
  if (!isRecord(catalogData.versionKnowledge)) {
    throw new Error('injected catalog is missing versionKnowledge');
  }
  for (const [authored, entry] of Object.entries(catalogData.versionKnowledge)) {
    if (!/^[A-Za-z][\w/]*@\d+(?:\.\d+){2}$/u.test(authored)) {
      throw new Error(`versionKnowledge authored key '${authored}' must be <Control>@<major.minor.patch>`);
    }
    const error = versionKnowledgeError(entry, `versionKnowledge.${authored}`);
    if (error) throw new Error(error);
  }
  if (!Array.isArray(catalogData.evidenceClasses)) {
    throw new Error('injected catalog is missing evidenceClasses');
  }
  const claimRefs = new Set<string>();
  for (const [index, entry] of catalogData.evidenceClasses.entries()) {
    const error = evidenceClassError(entry, `evidenceClasses[${index}]`);
    if (error) throw new Error(error);
    if (claimRefs.has(entry.claim_ref)) {
      throw new Error(`evidenceClasses repeats claim_ref '${entry.claim_ref}'`);
    }
    claimRefs.add(entry.claim_ref);
  }
  const manifestVariantsByType = new Map<string, ReadonlySet<string>>();
  for (const control of catalogData.controls) {
    manifestVariantsByType.set(control.type, new Set(control.variants));
  }
  for (const [control, augmentation] of Object.entries(catalogData.augmentations)) {
    if (augmentation.current_variants !== undefined) {
      const path = `augmentations.${control}.current_variants`;
      if (!Array.isArray(augmentation.current_variants) || augmentation.current_variants.length === 0) {
        throw new Error(`${path} must be a non-empty array`);
      }
      const seen = new Set(augmentation.legacy_variants ?? []);
      for (const entry of augmentation.current_variants) {
        if (!isRecord(entry) || typeof entry.name !== 'string' || !entry.name.trim()
          || entry.verified !== true || entry.verified_by !== 'compile_canvas'
          || typeof entry.verified_at !== 'string' || !isIsoDate(entry.verified_at)) {
          throw new Error(`${path} requires name, verified: true, ISO verified_at and verified_by: compile_canvas`);
        }
        if (seen.has(entry.name)) throw new Error(`${path} repeats '${entry.name}' or overlaps legacy_variants`);
        if (manifestVariantsByType.get(control)?.has(entry.name)) {
          throw new Error(`${path} '${entry.name}' is extractor-emitted; retire its current_variants entry`);
        }
        seen.add(entry.name);
      }
    }
    for (const [property, evidence] of Object.entries(augmentation.additional_input_properties ?? {})) {
      const error = augmentationEvidenceError(evidence, `augmentations.${control}.additional_input_properties.${property}`);
      if (error) throw new Error(error);
    }
    if (augmentation.observed_variants !== undefined) {
      const error = observedVariantsError(
        augmentation.observed_variants,
        `augmentations.${control}.observed_variants`,
        augmentation.legacy_variants ?? [],
        manifestVariantsByType.get(control) ?? new Set<string>(),
        (augmentation.current_variants ?? []).map(entry => entry.name),
      );
      if (error) throw new Error(error);
    }
  }
  for (const [control, evidence] of Object.entries(catalogData.syntheticControls ?? {})) {
    const error = augmentationEvidenceError(evidence, `synthetic_controls.${control}`);
    if (error) throw new Error(error);
  }
  for (const [control, evidence] of Object.entries(catalogData.dumpSourcedControls ?? {})) {
    const error = augmentationEvidenceError(evidence, `dump_sourced_controls.${control}`);
    if (error) throw new Error(error);
  }
}

/** Catalog dictionaries contain authored keys; inherited JavaScript names are not entries. */
export function ownValue<T>(record: Readonly<Record<string, T>> | null | undefined, key: string): T | undefined {
  return record && Object.hasOwn(record, key) ? record[key] : undefined;
}

/** An accepted variant without a platform bundle has only the shared lower bound. */
export function usesCommonVariantProperties(
  catalogData: AnalyzerCatalogData,
  controlType: string,
  variant: string | null,
): boolean {
  if (!variant) return true;
  if (ownValue(ownValue(catalogData.controlProperties, controlType)?.variant_input_properties, variant) !== undefined) return false;
  const augmentation = ownValue(catalogData.augmentations, controlType);
  return (augmentation?.legacy_variants ?? []).includes(variant)
    || (augmentation?.current_variants ?? []).some(entry => entry.name === variant)
    || (augmentation?.observed_variants?.variants ?? []).includes(variant)
    || (catalogData.controls.find(control => control.type === controlType)?.variants ?? []).includes(variant);
}

/** Declared catalog type for (control, prop), including variant, parent, and augmentation data. */
export function declaredPropType(
  catalogData: AnalyzerCatalogData,
  controlType: string,
  variant: string | null,
  prop: string,
): string | null {
  const propsEntry = ownValue(catalogData.controlProperties, controlType);
  const type = ownValue(propsEntry?.input_properties, prop);
  if (typeof type === 'string') return type;
  if (variant) {
    const variantType = ownValue(ownValue(propsEntry?.variant_input_properties, variant), prop);
    if (typeof variantType === 'string') return variantType;
  }
  if (usesCommonVariantProperties(catalogData, controlType, variant)) {
    const commonType = ownValue(propsEntry?.common_variant_properties, prop);
    if (typeof commonType === 'string') return commonType;
  }
  for (const bundle of propsEntry?.parent_context ?? []) {
    const parentType = ownValue(ownValue(catalogData.parentContextProperties, bundle), prop);
    if (typeof parentType === 'string') return parentType;
  }
  return ownValue(ownValue(catalogData.augmentations, controlType)?.additional_input_properties, prop)?.type ?? null;
}
