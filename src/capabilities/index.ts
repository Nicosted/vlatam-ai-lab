/**
 * AI-71 capability contracts — public surface.
 *
 * The capability layer is the stable seam between domain workflows and
 * the future model-execution / governance / evaluation / routing
 * layers. Domain code SHOULD import from this module only. The
 * individual files (`contracts.ts`, `policy.ts`, `error.ts`,
 * `registry.ts`, `bindings.ts`, `validation.ts`) are internal and may
 * move; this module is the supported entry point.
 *
 * Re-exports are grouped:
 *
 *  - Core types: the request, result, context, and definition shapes.
 *  - Policy types: the four requirement blocks.
 *  - Error model: codes, categories, and the `CapabilityError` shape.
 *  - Enums and type guards: enums mirroring the JSON Schemas, plus
 *    the `is*()` guards that match them.
 *  - Validation: the structured validation result type and the
 *    `validateCapability*` functions.
 *  - Registry: the typed catalog-backed definition registry.
 *  - Bindings: the explicit mapping between the catalog and the
 *    existing input/output JSON Schemas.
 *  - Version: the contract MAJOR/MINOR/PATCH constants.
 */

export type {
  CapabilityContext,
  CapabilityDefinition,
  CapabilityDomain,
  CapabilityId,
  CapabilityPolicy,
  CapabilityRequest,
  CapabilityResult,
  CapabilityResultStatus,
  CapabilityRiskTier,
  CapabilityStatus,
  DataClassification,
  DownstreamPolicy,
  DownstreamUse,
  ProviderExecution,
  ResultGovernance,
} from './contracts.js';

export {
  CAPABILITY_DOMAINS,
  CAPABILITY_RESULT_STATUSES,
  CAPABILITY_RISK_TIERS,
  CAPABILITY_STATUSES,
  DATA_CLASSIFICATIONS,
  DOWNSTREAM_USE_VALUES,
  PROVIDER_EXECUTION_VALUES,
  isCapabilityDomain,
  isCapabilityId,
  isCapabilityResultStatus,
  isCapabilityRiskTier,
  isCapabilityStatus,
  isDataClassification,
  isDownstreamUse,
  isProviderExecution,
  isSchemaVersion,
} from './contracts.js';

export type {
  BudgetRequirement,
  BudgetWindow,
  EvaluationRequirement,
  ExecutionRequirement,
  HumanReviewPolicy,
  PrivacyRequirement,
  PrivacyTier,
  RetentionClass,
} from './policy.js';

export {
  BUDGET_WINDOWS,
  PRIVACY_TIERS,
  RETENTION_CLASSES,
} from './policy.js';

export type { CapabilityError, CapabilityErrorCategory, CapabilityErrorCode } from './error.js';

export {
  CAPABILITY_ERROR_CATEGORIES,
  CAPABILITY_ERROR_CODES,
  FORBIDDEN_FIELD_NAMES,
  isCapabilityErrorCategory,
  isCapabilityErrorCode,
  isForbiddenFieldName,
} from './error.js';

export type { ValidationFailure, ValidationResult } from './validation.js';

export {
  validateCapabilityContext,
  validateCapabilityDefinition,
  validateCapabilityRequest,
  validateCapabilityResult,
  validateGovernance,
  validatePolicy,
} from './validation.js';

export type { CapabilityRegistry } from './registry.js';

export {
  getCapabilityDefinition,
  listCapabilityDefinitions,
  assertCapabilitySupported,
  loadCapabilityRegistry,
  hasCapabilityDefinition,
  isLoaded,
} from './registry.js';

export type { DomainCapabilityBinding } from './bindings.js';

export { DOMAIN_CAPABILITY_BINDINGS, getDomainCapabilityBinding } from './bindings.js';

export {
  CAPABILITY_CONTRACT_MAJOR,
  CAPABILITY_CONTRACT_MINOR,
  CAPABILITY_CONTRACT_PATCH,
  CAPABILITY_CONTRACT_VERSION,
  CAPABILITY_ERROR_SCHEMA_VERSION,
  CAPABILITY_POLICY_SCHEMA_VERSION,
  CAPABILITY_REQUEST_SCHEMA_VERSION,
  CAPABILITY_RESULT_SCHEMA_VERSION,
  CAPABILITY_ID_PATTERN,
  SEMVER_PATTERN,
  SUPPORTED_CAPABILITY_CONTRACT_MAJORS,
} from './version.js';
