// Deterministic, network-free demo provider for the AI extraction workflow.
//
// Scope: this provider exists ONLY to exercise the schema-valid extraction path
// in tests and the local demo dry-run. It performs no network calls, contacts no
// model API, and requires no credentials. It reads short synthetic excerpts that
// are embedded in an evidence packet's `metadata.embedded_evidence.excerpts` and
// maps each excerpt to a bounded, schema-compliant draft claim.
//
// Doctrine preserved here:
//  - Output is draft-only. The workflow still sets human_review_required=true and
//    downstream_allowed=false; this provider never approves anything.
//  - If a packet carries no embedded evidence (e.g. a locator-only packet), the
//    provider returns an empty claim set so the workflow stays conservative.
//  - Claims describe what an embedded synthetic excerpt says; they make no real
//    regulatory conclusion.

import type {
  AiExtractionProvider,
  CritiqueInput,
  ExtractionDraftInput,
} from "./ai-extraction-provider.js";
import type { ExtractableEvidencePacket } from "./types.js";

interface EmbeddedEvidenceExcerpt {
  excerpt_id: string;
  anchor?: string | undefined;
  text: string;
  summary?: string | undefined;
  content_hash?: string | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the bounded synthetic excerpts embedded in a demo evidence packet.
 * Returns an empty array when the packet has no embedded evidence (for example a
 * locator-only packet), which keeps the demo provider conservative by default.
 */
export function readEmbeddedEvidenceExcerpts(
  packet: ExtractableEvidencePacket,
): EmbeddedEvidenceExcerpt[] {
  const metadata = packet.metadata;
  if (!isRecord(metadata)) {
    return [];
  }

  const embedded = metadata["embedded_evidence"];
  if (!isRecord(embedded)) {
    return [];
  }

  const excerpts = embedded["excerpts"];
  if (!Array.isArray(excerpts)) {
    return [];
  }

  const parsed: EmbeddedEvidenceExcerpt[] = [];
  for (const raw of excerpts) {
    if (!isRecord(raw)) {
      continue;
    }
    const excerptId = raw["excerpt_id"];
    const text = raw["text"];
    if (typeof excerptId !== "string" || typeof text !== "string") {
      continue;
    }
    parsed.push({
      excerpt_id: excerptId,
      anchor: typeof raw["anchor"] === "string" ? raw["anchor"] : undefined,
      text,
      summary: typeof raw["summary"] === "string" ? raw["summary"] : undefined,
      content_hash:
        typeof raw["content_hash"] === "string"
          ? raw["content_hash"]
          : undefined,
    });
  }

  return parsed;
}

/**
 * Deterministic demo provider. Narrowly scoped to demo/test usage; it is not a
 * real model adapter and must not be used for production extraction.
 */
export class EmbeddedEvidenceDemoProvider implements AiExtractionProvider {
  readonly provider_id = "demo_embedded_evidence";
  readonly model_id = "deterministic-demo-extractor";

  async generateExtractionDraft(input: ExtractionDraftInput): Promise<unknown> {
    const excerpts = readEmbeddedEvidenceExcerpts(input.evidence_packet);

    if (excerpts.length === 0) {
      return {
        extracted_claims: [],
        warnings: [
          "Demo provider found no embedded evidence; returning an empty claim set (conservative).",
        ],
        confidence: 0,
      };
    }

    const extracted_claims = excerpts.map((excerpt) => {
      const evidenceReference = excerpt.anchor
        ? `${excerpt.excerpt_id} (${excerpt.anchor})`
        : excerpt.excerpt_id;
      const detail = excerpt.summary ?? excerpt.text;
      return {
        claim_id: `demo-claim-${excerpt.excerpt_id}`,
        claim_text: `According to embedded demo excerpt ${excerpt.excerpt_id}, ${detail}.`,
        evidence_reference: evidenceReference,
        support_status: "supported_by_packet",
        confidence: 0.55,
      };
    });

    return {
      extracted_claims,
      warnings: [
        "Demo deterministic extraction over synthetic embedded evidence; claims are non-authoritative and require human review.",
      ],
      confidence: 0.55,
    };
  }

  async generateCritique(input: CritiqueInput): Promise<unknown> {
    const claimCount = input.extraction_draft.extracted_claims.length;
    return {
      critic_summary:
        claimCount > 0
          ? `Reviewed ${claimCount} demo claim(s); each maps to an embedded synthetic excerpt and stays within the bounded demo packet. Synthetic demo only — not approved intelligence.`
          : "No demo claims were produced; keep the extraction behind human review.",
      unsupported_claims: [],
      warnings: [
        "Synthetic demo critique only; human review is still required before any use.",
      ],
    };
  }
}
