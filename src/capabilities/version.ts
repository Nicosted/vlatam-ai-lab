/**
 * AI-71 capability contract — version constants.
 *
 * These constants are the source of truth for the request, result, error,
 * and policy envelope schema versions. They are referenced by the JSON
 * Schemas in `schemas/capability-*.schema.json` (via description only) and
 * by the validators in `src/capabilities/validation.ts`.
 *
 * Versioning rules (see `docs/architecture/ai-capability-contracts.md`):
 *
 *  - The `MAJOR` component is the contract surface version. Removing or
 *    changing the meaning of a required field, or tightening a previously
 *    optional field, requires a major bump.
 *  - The `MINOR` component is incremented when a strictly additive
 *    optional field is introduced.
 *  - The `PATCH` component is for documentation or internal refactors
 *    that do not change the wire shape.
 *
 * Unknown MAJOR versions fail closed. See `validation.ts` and ADR-003.
 */

export const CAPABILITY_CONTRACT_MAJOR = 1 as const;
export const CAPABILITY_CONTRACT_MINOR = 0 as const;
export const CAPABILITY_CONTRACT_PATCH = 0 as const;

export const CAPABILITY_CONTRACT_VERSION = `${CAPABILITY_CONTRACT_MAJOR}.${CAPABILITY_CONTRACT_MINOR}.${CAPABILITY_CONTRACT_PATCH}` as const;

export const CAPABILITY_REQUEST_SCHEMA_VERSION = CAPABILITY_CONTRACT_VERSION;
export const CAPABILITY_RESULT_SCHEMA_VERSION = CAPABILITY_CONTRACT_VERSION;
export const CAPABILITY_POLICY_SCHEMA_VERSION = CAPABILITY_CONTRACT_VERSION;
export const CAPABILITY_ERROR_SCHEMA_VERSION = CAPABILITY_CONTRACT_VERSION;

export const SUPPORTED_CAPABILITY_CONTRACT_MAJORS = [CAPABILITY_CONTRACT_MAJOR] as const;

/**
 * Pattern that every capability identifier MUST match.
 *
 * Capability IDs are stable, version-independent, and free of vendor
 * references. A capability ID describes what work the capability does
 * (e.g. `evidence.extraction.normative_claims`), not which provider or
 * model performs it.
 *
 * Mirrors the pattern enforced by `schemas/ai-capabilities.schema.json`.
 */
export const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
