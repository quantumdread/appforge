import { POWERFX_FUNCTION_NAMES } from '../generated/powerfx.js';
import {
  AUGMENTATIONS,
  AUGMENTATION_SCHEMA_VERSION,
  CATALOG_VERSION,
  CONTROLS,
  CONTROL_PROPERTIES,
  DUMP_SOURCED,
  DUMP_SOURCED_CONTROL_METADATA,
  EVIDENCE_CLASSES,
  ENUMS,
  MODERNIZATION_MAP,
  MODERNIZATION_DEFERRED,
  PARENT_CONTEXT_PROPERTIES,
  SYNTHETIC_CONTROL_METADATA,
  VERSION_KNOWLEDGE,
} from '../generated/catalog.js';
import type { AnalyzerCatalogData } from '../core/catalog.js';

/** Worker-side injection boundary for the generated catalog. */
export const ANALYZER_CATALOG_DATA: AnalyzerCatalogData = {
  augmentationSchemaVersion: AUGMENTATION_SCHEMA_VERSION,
  catalogVersion: CATALOG_VERSION,
  extractedAt: CATALOG_VERSION,
  versionKnowledge: VERSION_KNOWLEDGE,
  modernization: MODERNIZATION_MAP,
  modernizationDeferred: MODERNIZATION_DEFERRED,
  evidenceClasses: EVIDENCE_CLASSES,
  controls: CONTROLS,
  controlProperties: CONTROL_PROPERTIES,
  augmentations: AUGMENTATIONS,
  dumpSourcedControls: DUMP_SOURCED_CONTROL_METADATA,
  syntheticControls: SYNTHETIC_CONTROL_METADATA,
  parentContextProperties: PARENT_CONTEXT_PROPERTIES,
  dumpSourced: DUMP_SOURCED,
  enums: ENUMS,
  functionNames: POWERFX_FUNCTION_NAMES,
};
