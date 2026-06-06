// Conservative defaults for source registry entries.
//
// The JSON Schema cannot express "default to the safe value when a field is
// omitted", so this pure helper encodes the doctrine in code:
//  - human_review_required defaults to true,
//  - downstream_allowed defaults to false,
//  - freshness_status defaults to unknown (never "current"),
//  - verification_status defaults to unverified_sample.

import type { SourceRegistryEntry } from "./types.js";

export type SourceRegistryDraft = Partial<SourceRegistryEntry> &
  Pick<
    SourceRegistryEntry,
    | "source_id"
    | "source_name"
    | "source_type"
    | "jurisdiction_scope"
    | "topic_scope"
    | "language"
    | "source_locator"
    | "created_at"
    | "updated_at"
    | "schema_version"
  >;

/**
 * Apply conservative defaults to a partial registry entry. Any safety-relevant
 * field left undefined resolves to its most conservative value.
 */
export function withConservativeDefaults(
  draft: SourceRegistryDraft,
): SourceRegistryEntry {
  return {
    ...draft,
    authority_level: draft.authority_level ?? "unknown",
    reliability_level: draft.reliability_level ?? "unknown",
    verification_status: draft.verification_status ?? "unverified_sample",
    freshness_status: draft.freshness_status ?? "unknown",
    human_review_required: draft.human_review_required ?? true,
    downstream_allowed: draft.downstream_allowed ?? false,
  };
}
