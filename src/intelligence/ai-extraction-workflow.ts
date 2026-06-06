import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type {
  AiExtractionCritique,
  AiExtractionDraft,
  AiExtractionDraftClaim,
  AiExtractionProvider,
  AiUnsupportedClaim,
} from "./ai-extraction-provider.js";
import { isEvidencePacketExtractionReady } from "./evidence-preparation.js";
import type { ExtractableEvidencePacket } from "./types.js";

export interface AiExtractionResult {
  extraction_result_id: string;
  extraction_job_id?: string;
  evidence_packet_id: string;
  review_manifest_id: string;
  snapshot_id: string;
  source_id: string;
  provider_id: string;
  model_id: string;
  extraction_status:
    | "draft_unreviewed"
    | "critique_flagged"
    | "validation_failed"
    | "provider_failed";
  extracted_claims: AiExtractionDraftClaim[];
  unsupported_claims: AiUnsupportedClaim[];
  warnings: string[];
  confidence: number;
  critic_summary: string;
  human_review_required: true;
  downstream_allowed: false;
  created_at: string;
  contract_version: string;
  schema_version: string;
}

export interface RunAiExtractionWorkflowInput {
  evidence_packet: ExtractableEvidencePacket;
  provider: AiExtractionProvider;
  extraction_job_id?: string;
  created_at?: string;
}

interface WorkflowState {
  evidence_packet: ExtractableEvidencePacket;
  extraction_job_id?: string;
  extraction_draft?: AiExtractionDraft;
  critique?: AiExtractionCritique;
  result?: AiExtractionResult;
  warnings: string[];
  created_at: string;
}

const GraphState = Annotation.Root({
  evidence_packet: Annotation<ExtractableEvidencePacket>(),
  extraction_job_id: Annotation<string | undefined>(),
  extraction_draft: Annotation<AiExtractionDraft | undefined>(),
  critique: Annotation<AiExtractionCritique | undefined>(),
  result: Annotation<AiExtractionResult | undefined>(),
  warnings: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
  created_at: Annotation<string>(),
});

export async function runAiExtractionWorkflow(
  input: RunAiExtractionWorkflowInput,
): Promise<AiExtractionResult> {
  const graph = buildAiExtractionGraph(input.provider);
  const finalState = (await graph.invoke({
    evidence_packet: input.evidence_packet,
    extraction_job_id: input.extraction_job_id,
    created_at: input.created_at ?? new Date().toISOString(),
    warnings: [],
  })) as WorkflowState;

  if (!finalState.result) {
    throw new Error("AI extraction workflow completed without a result.");
  }

  return finalState.result;
}

function buildAiExtractionGraph(provider: AiExtractionProvider) {
  return new StateGraph(GraphState)
    .addNode("extractor", async (state: WorkflowState) => {
      if (!isEvidencePacketExtractionReady(state.evidence_packet)) {
        return {
          extraction_draft: emptyDraft(),
          warnings: ["Evidence packet is not extraction-ready."],
        };
      }

      try {
        const rawDraft = await provider.generateExtractionDraft({
          evidence_packet: state.evidence_packet,
          ...optionalExtractionJobId(state.extraction_job_id),
        });
        const draft = parseExtractionDraft(rawDraft);

        if (!draft.ok) {
          return {
            extraction_draft: emptyDraft(),
            warnings: [
              "Extractor output failed validation; conservative fallback used.",
              ...draft.errors,
            ],
          };
        }

        return { extraction_draft: draft.value };
      } catch (error) {
        return {
          extraction_draft: emptyDraft(),
          warnings: [`Extractor provider failed: ${errorMessage(error)}`],
        };
      }
    })
    .addNode("critic", async (state: WorkflowState) => {
      const extractionDraft = state.extraction_draft ?? emptyDraft();

      try {
        const rawCritique = await provider.generateCritique({
          evidence_packet: state.evidence_packet,
          extraction_draft: extractionDraft,
          ...optionalExtractionJobId(state.extraction_job_id),
        });
        const critique = parseCritique(rawCritique);

        if (!critique.ok) {
          return {
            critique: conservativeCritique(),
            warnings: [
              "Critic output failed validation; conservative fallback used.",
              ...critique.errors,
            ],
          };
        }

        return { critique: critique.value };
      } catch (error) {
        return {
          critique: conservativeCritique(),
          warnings: [`Critic provider failed: ${errorMessage(error)}`],
        };
      }
    })
    .addNode("validator", async (state: WorkflowState) => {
      return {
        result: buildDraftResult({
          state,
          provider,
        }),
      };
    })
    .addEdge(START, "extractor")
    .addEdge("extractor", "critic")
    .addEdge("critic", "validator")
    .addEdge("validator", END)
    .compile();
}

function buildDraftResult(input: {
  state: WorkflowState;
  provider: AiExtractionProvider;
}): AiExtractionResult {
  const { state, provider } = input;
  const draft = state.extraction_draft ?? emptyDraft();
  const critique = state.critique ?? conservativeCritique();
  const warnings = [
    ...state.warnings,
    ...(draft.warnings ?? []),
    ...(critique.warnings ?? []),
    "Draft AI extraction only; confidence is not approval.",
    "Extraction-ready evidence is not classifier-approved intelligence.",
  ];
  const unsupportedClaims = [
    ...draft.extracted_claims
      .filter((claim) => claim.support_status === "unsupported")
      .map((claim) => ({
        claim_id: claim.claim_id,
        claim_text: claim.claim_text,
        evidence_reference: claim.evidence_reference,
        reason: "Extractor marked this claim unsupported.",
      })),
    ...critique.unsupported_claims,
  ];
  const status =
    state.warnings.length > 0
      ? "validation_failed"
      : unsupportedClaims.length > 0
        ? "critique_flagged"
        : "draft_unreviewed";

  return {
    extraction_result_id: `ai-extraction-result-${state.evidence_packet.evidence_packet_id}`,
    ...optionalExtractionJobId(state.extraction_job_id),
    evidence_packet_id: state.evidence_packet.evidence_packet_id,
    review_manifest_id: state.evidence_packet.review_manifest_id,
    snapshot_id: state.evidence_packet.snapshot_id,
    source_id: state.evidence_packet.source_id,
    provider_id: provider.provider_id,
    model_id: provider.model_id,
    extraction_status: status,
    extracted_claims: draft.extracted_claims,
    unsupported_claims: unsupportedClaims,
    warnings: uniqueStrings(warnings),
    confidence: clampConfidence(draft.confidence ?? 0),
    critic_summary: critique.critic_summary,
    human_review_required: true,
    downstream_allowed: false,
    created_at: state.created_at,
    contract_version: "1.0.0",
    schema_version: "1.0.0",
  };
}

function parseExtractionDraft(
  value: unknown,
): { ok: true; value: AiExtractionDraft } | { ok: false; errors: string[] } {
  if (!isRecord(value)) {
    return { ok: false, errors: ["Extractor output must be an object."] };
  }

  const rawClaims = value["extracted_claims"];
  if (!Array.isArray(rawClaims)) {
    return {
      ok: false,
      errors: ["Extractor output must include extracted_claims array."],
    };
  }

  const claims: AiExtractionDraftClaim[] = [];
  const errors: string[] = [];
  for (const [index, rawClaim] of rawClaims.entries()) {
    const claim = parseDraftClaim(rawClaim);
    if (claim.ok) {
      claims.push(claim.value);
    } else {
      errors.push(`extracted_claims[${index}]: ${claim.error}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      extracted_claims: claims,
      warnings: stringArray(value["warnings"]),
      ...optionalConfidence(numberOrUndefined(value["confidence"])),
    },
  };
}

function parseCritique(
  value: unknown,
): { ok: true; value: AiExtractionCritique } | { ok: false; errors: string[] } {
  if (!isRecord(value)) {
    return { ok: false, errors: ["Critic output must be an object."] };
  }

  const criticSummary = value["critic_summary"];
  const rawUnsupported = value["unsupported_claims"];
  if (typeof criticSummary !== "string" || criticSummary.trim().length === 0) {
    return { ok: false, errors: ["Critique must include critic_summary."] };
  }
  if (!Array.isArray(rawUnsupported)) {
    return {
      ok: false,
      errors: ["Critique must include unsupported_claims array."],
    };
  }

  const unsupported: AiUnsupportedClaim[] = [];
  for (const rawClaim of rawUnsupported) {
    if (isUnsupportedClaim(rawClaim)) {
      unsupported.push(rawClaim);
    }
  }

  return {
    ok: true,
    value: {
      critic_summary: criticSummary,
      unsupported_claims: unsupported,
      warnings: stringArray(value["warnings"]),
    },
  };
}

function parseDraftClaim(
  value: unknown,
): { ok: true; value: AiExtractionDraftClaim } | { ok: false; error: string } {
  if (!isRecord(value)) {
    return { ok: false, error: "claim must be an object." };
  }

  const claimId = value["claim_id"];
  const claimText = value["claim_text"];
  const evidenceReference = value["evidence_reference"];
  const supportStatus = value["support_status"];
  const confidence = value["confidence"];

  if (
    typeof claimId !== "string" ||
    typeof claimText !== "string" ||
    typeof evidenceReference !== "string" ||
    !isSupportStatus(supportStatus) ||
    typeof confidence !== "number"
  ) {
    return { ok: false, error: "claim has invalid required fields." };
  }

  return {
    ok: true,
    value: {
      claim_id: claimId,
      claim_text: claimText,
      evidence_reference: evidenceReference,
      support_status: supportStatus,
      confidence: clampConfidence(confidence),
    },
  };
}

function emptyDraft(): AiExtractionDraft {
  return { extracted_claims: [], warnings: [], confidence: 0 };
}

function conservativeCritique(): AiExtractionCritique {
  return {
    critic_summary:
      "No trusted critique was produced; keep the extraction behind human review.",
    unsupported_claims: [],
    warnings: ["Critic fallback requires human review before any use."],
  };
}

function isSupportStatus(
  value: unknown,
): value is AiExtractionDraftClaim["support_status"] {
  return (
    value === "supported_by_packet" ||
    value === "unsupported" ||
    value === "needs_human_review"
  );
}

function isUnsupportedClaim(value: unknown): value is AiUnsupportedClaim {
  return (
    isRecord(value) &&
    typeof value["claim_text"] === "string" &&
    typeof value["reason"] === "string" &&
    (value["claim_id"] === undefined ||
      typeof value["claim_id"] === "string") &&
    (value["evidence_reference"] === undefined ||
      typeof value["evidence_reference"] === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? clampConfidence(value) : undefined;
}

function optionalExtractionJobId(
  extractionJobId: string | undefined,
): { extraction_job_id: string } | Record<string, never> {
  return extractionJobId ? { extraction_job_id: extractionJobId } : {};
}

function optionalConfidence(
  confidence: number | undefined,
): { confidence: number } | Record<string, never> {
  return confidence === undefined ? {} : { confidence };
}

function clampConfidence(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown provider error";
}
