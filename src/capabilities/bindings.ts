/**
 * AI-71 capability contracts — domain bindings.
 *
 * This module is the explicit, minimal mapping between selected
 * existing domain capabilities and their current input/output JSON
 * Schemas. The binding is descriptive: it does NOT execute the
 * capability, does NOT import any provider SDK, and does NOT modify
 * the existing domain implementations. Its purpose is to give the
 * contract layer a single, auditable view of which existing schemas
 * each bound capability accepts and produces, so that:
 *
 *  - the request envelope can be statically checked against the
 *    bound input schema;
 *  - the result envelope can be statically checked against the
 *    bound output schema;
 *  - the migration path for AI-72 (multi-provider gateway) is
 *    unambiguous;
 *  - the registry can refuse to load a capability that is bound to a
 *    missing schema.
 *
 * Adding a binding is an explicit act: each row is a typed
 * `DomainCapabilityBinding` and is exhaustively tested by
 * `tests/capabilities/bindings.test.ts`. Removing a binding or
 * changing a schema reference requires updating the test as well.
 *
 * The list below covers at minimum the six capabilities required by
 * the AI-71 specification:
 *
 *  - `evidence.extraction.normative_claims`     — extraction step.
 *  - `evidence.classifier_candidate.generate`   — classification step.
 *  - `source.regulatory_advisory.readiness_check`
 *  - `review.human.gate`
 *  - `artifact.approved.serve_http`
 *  - `artifact.export_contract.generate`
 *
 * The `human_review_required` and `downstream_allowed` flags here
 * mirror the catalog and the per-capability contract. They are
 * duplicated on purpose: the binding is the source of truth for
 * "what schema does this capability speak?" and the catalog is the
 * source of truth for "what does the catalog say about this
 * capability?" The registry validates that the two agree.
 */

import type { CapabilityId } from './contracts.js';
import type { CapabilityPolicy, DownstreamPolicy } from './contracts.js';

/**
 * `DomainCapabilityBinding` is a thin description of a single
 * capability's input and output contract surface. It is
 * intentionally separate from `CapabilityDefinition` so that the
 * binding can be added, removed, or updated without rewriting the
 * catalog. The registry is responsible for joining the two views.
 */
export interface DomainCapabilityBinding {
  readonly capability_id: CapabilityId;
  /** JSON Schema that validates `CapabilityRequest.input`. */
  readonly input_schema_ref: string;
  /** JSON Schema that validates `CapabilityResult.output`. */
  readonly output_schema_ref: string;
  /** True when the capability itself requires explicit human judgment. */
  readonly human_review_required: boolean;
  /** True when the capability may produce a downstream-eligible result. */
  readonly downstream_allowed: DownstreamPolicy['downstream_allowed'];
  /** Risk tier, mirrored from the catalog. */
  readonly risk_tier: 'low' | 'medium' | 'high';
  /** Whether the capability requires an external provider to be useful. */
  readonly provider_execution: 'required' | 'optional' | 'none';
  /** Per-binding rationale for the binding (one short paragraph). */
  readonly notes: string;
}

/**
 * The exhaustive list of capability bindings covered by AI-71.
 *
 * The order is "domain input flow then domain output flow", matching
 * the PCRAM sequence: an evidence packet is processed by an
 * extraction capability, whose result feeds a candidate-generation
 * capability, whose result feeds the human review gate, whose
 * approved output feeds the export contract generator, which is
 * served by the read-only HTTP API.
 */
export const DOMAIN_CAPABILITY_BINDINGS: readonly DomainCapabilityBinding[] = [
  {
    capability_id: 'evidence.extraction.normative_claims' as CapabilityId,
    input_schema_ref: 'schemas/extractable-evidence-packet.schema.json',
    output_schema_ref: 'schemas/ai-extraction-result.schema.json',
    human_review_required: true,
    downstream_allowed: false,
    risk_tier: 'high',
    provider_execution: 'required',
    notes:
      'Reads a reviewed extractable evidence packet and produces a draft AI extraction result. Output is always draft; the human review gate is the precondition of any downstream use.',
  },
  {
    capability_id: 'evidence.classifier_candidate.generate' as CapabilityId,
    input_schema_ref: 'schemas/ai-extraction-result.schema.json',
    output_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
    human_review_required: true,
    downstream_allowed: false,
    risk_tier: 'high',
    provider_execution: 'none',
    notes:
      'Deterministically turns a draft AI extraction result into a classifier intelligence artifact (candidate). The artifact is downstream-allowed only after the human review gate.',
  },
  {
    capability_id: 'source.regulatory_advisory.readiness_check' as CapabilityId,
    input_schema_ref: 'schemas/intelligence-source-snapshot.schema.json',
    output_schema_ref: 'schemas/extractable-evidence-packet.schema.json',
    human_review_required: true,
    downstream_allowed: false,
    risk_tier: 'medium',
    provider_execution: 'none',
    notes:
      'Reads a captured source snapshot and produces an evidence-packet-shaped readiness summary. The advisory answer is never emitted by this capability; the readiness summary is for human review only.',
  },
  {
    capability_id: 'review.human.gate' as CapabilityId,
    input_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
    output_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
    human_review_required: false,
    downstream_allowed: 'conditional',
    risk_tier: 'high',
    provider_execution: 'none',
    notes:
      'The review act is itself the human judgment step. The binding is conditional: downstream is allowed only when the review is `reviewed_approved`. The reviewer identity is not exported.',
  },
  {
    capability_id: 'artifact.approved.generate' as CapabilityId,
    input_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
    output_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
    human_review_required: true,
    downstream_allowed: 'conditional',
    risk_tier: 'high',
    provider_execution: 'none',
    notes:
      'Promotes a reviewed classifier intelligence artifact to an approved artifact. The review is the precondition of the approval; downstream is allowed only when the source review status is `reviewed_approved`.',
  },
  {
    capability_id: 'artifact.export_contract.generate' as CapabilityId,
    input_schema_ref: 'schemas/classifier-intelligence-artifact.schema.json',
    output_schema_ref: 'schemas/classifier-approved-artifact-export.schema.json',
    human_review_required: true,
    downstream_allowed: true,
    risk_tier: 'high',
    provider_execution: 'none',
    notes:
      'Generates a clean export from a reviewed classifier intelligence artifact. The export schema strips governance and reviewer metadata; the reviewer identity never crosses this boundary. The capability is the post-review boundary itself and is therefore allowed to be downstream-eligible: every input is reviewed, every output is not.',
  },
  {
    capability_id: 'artifact.approved.serve_http' as CapabilityId,
    input_schema_ref: 'schemas/classifier-approved-artifact-export-contract.schema.json',
    output_schema_ref: 'schemas/classifier-approved-artifact-export.schema.json',
    human_review_required: false,
    downstream_allowed: true,
    risk_tier: 'medium',
    provider_execution: 'none',
    notes:
      'Serves a previously generated export over the read-only HTTP API. The serving step is not itself review-gated; the approval is the precondition of the artifact being served.',
  },
] as const;

/**
 * Returns the binding for a given capability ID, or `undefined` if no
 * binding is registered. The function accepts a plain string for
 * ergonomic call sites: callers do not have to brand the input. The
 * function is `O(1)` because the list is small and stable; the
 * implementation walks the array for clarity and to keep the bindings
 * list easy to grep.
 */
export function getDomainCapabilityBinding(
  capabilityId: string
): DomainCapabilityBinding | undefined {
  return DOMAIN_CAPABILITY_BINDINGS.find(b => b.capability_id === capabilityId);
}

/**
 * Re-exports the bindings list under a stable name for tests and
 * future tooling.
 */
export const ALL_DOMAIN_CAPABILITY_BINDINGS = DOMAIN_CAPABILITY_BINDINGS;

/**
 * The internal `DomainCapabilityBinding` exposes the per-capability
 * flags. The registry is the only place that should join a binding
 * with a `CapabilityPolicy`. The two views are kept separate so that
 * the bindings list can be reviewed by humans without reading the
 * full policy block.
 *
 * This re-export exists so that tests and the registry can refer to
 * the binding types without importing `contracts.ts` twice.
 *
 * @internal
 */
export type { CapabilityPolicy };
