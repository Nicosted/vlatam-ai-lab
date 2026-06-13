import path from "node:path";
import { fileURLToPath } from "node:url";

import { readUtf8File, writeUtf8File } from "../lib/fs.js";

type JsonObject = Record<string, unknown>;

export const argentinaBackpackMissingDataHandoffDefaultPath =
  "exports/review-outcomes/argentina-backpack-request-more-data.json";

const outcomePath =
  "snapshots/pcram/review-outcome-ar-demo-polyester-school-backpack-request-more-data.json";
const actionPlanPath = "reports/argentina-backpack-request-more-data.md";
const reviewChecklistPath = "docs/argentina-backpack-human-review-checklist.md";
const sourcePackPlanPath = "docs/argentina-curated-source-pack-plan.md";

const expectedQuestionGroups = [
  {
    group_id: "materials_and_construction",
    label: "Materials and construction",
    question_ids: [
      "exact-material-composition-percentages",
      "polyester-construction-status",
      "coating-layer-plastic-shell-status",
    ],
  },
  {
    group_id: "product_configuration",
    label: "Product configuration",
    question_ids: [
      "dimensions-and-capacity",
      "included-accessories-components",
    ],
  },
  {
    group_id: "commercial_and_import_context",
    label: "Commercial and import context",
    question_ids: [
      "country-of-origin",
      "commercial-description-consistency",
      "supporting-documents",
    ],
  },
] as const;

export type ArgentinaBackpackMissingDataHandoffOptions = {
  outputPath?: string;
  repoRoot?: string;
};

export type ArgentinaBackpackMissingDataHandoffResult = {
  outputPath: string;
  summary: string;
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean`);
  }

  return value;
}

function asStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string")
  ) {
    throw new Error(`${label} must be an array of strings`);
  }

  return value;
}

function asQuestionArray(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`${label} must be an array of objects`);
  }

  return value;
}

function assertRepoRelativePath(value: string, label: string): void {
  if (path.isAbsolute(value) || path.posix.isAbsolute(value)) {
    throw new Error(`${label} must be repository-relative`);
  }

  if (value.startsWith("~")) {
    throw new Error(`${label} must not use home-directory references`);
  }

  if (value.includes("\\") || value.split("/").includes("..")) {
    throw new Error(`${label} must stay inside the repository`);
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error(`${label} must not use a protocol reference`);
  }

  if (value !== path.posix.normalize(value)) {
    throw new Error(`${label} must be normalized`);
  }
}

function assertReviewOutcomeIsBlocked(outcome: JsonObject): void {
  const requiredFalseFlags = [
    "approval_ready",
    "approved",
    "downstream_allowed",
    "export_eligible",
    "final_classification_made",
    "ncm_hs_code_approved",
  ];

  if (outcome["outcome"] !== "request_more_data") {
    throw new Error("review outcome must be request_more_data");
  }

  for (const flag of requiredFalseFlags) {
    if (outcome[flag] !== false) {
      throw new Error(`review outcome ${flag} must be false`);
    }
  }
}

function questionsById(questions: JsonObject[]): Map<string, JsonObject> {
  return new Map(
    questions.map((question) => [
      asString(question["question_id"], "question.question_id"),
      question,
    ]),
  );
}

function buildQuestionGroups(questions: JsonObject[]): JsonObject[] {
  const byId = questionsById(questions);

  return expectedQuestionGroups.map((group) => ({
    group_id: group.group_id,
    label: group.label,
    audience: "client_or_broker",
    questions: group.question_ids.map((questionId) => {
      const question = byId.get(questionId);
      if (!question) {
        throw new Error(`missing deterministic question: ${questionId}`);
      }

      return {
        question_id: questionId,
        question: asString(question["question"], `${questionId}.question`),
      };
    }),
  }));
}

async function readJson(
  repoRoot: string,
  relativePath: string,
): Promise<JsonObject> {
  assertRepoRelativePath(relativePath, relativePath);
  const content = await readUtf8File(path.resolve(repoRoot, relativePath));

  return JSON.parse(content) as JsonObject;
}

function buildHandoff(outcome: JsonObject): JsonObject {
  assertReviewOutcomeIsBlocked(outcome);

  const metadata = isRecord(outcome["metadata"]) ? outcome["metadata"] : {};
  const artifactRefs = asStringArray(outcome["artifact_refs"], "artifact_refs");
  const sourceSnapshotRefs = asStringArray(
    outcome["source_snapshot_refs"],
    "source_snapshot_refs",
  );
  const missingDataQuestions = asQuestionArray(
    outcome["missing_data_questions"],
    "missing_data_questions",
  );

  return {
    handoff_id: "argentina-backpack-request-more-data-handoff",
    schema_version: "1.0.0",
    case_id: asString(outcome["case_id"], "case_id"),
    case_label: "Argentina polyester school backpack missing-data handoff",
    product_label: {
      en: asString(metadata["product_label_en"], "metadata.product_label_en"),
      es: asString(metadata["product_label_es"], "metadata.product_label_es"),
    },
    outcome: "request_more_data",
    approval_readiness: "blocked_not_approval_ready",
    downstream_allowed: asBoolean(
      outcome["downstream_allowed"],
      "downstream_allowed",
    ),
    export_eligible: asBoolean(outcome["export_eligible"], "export_eligible"),
    final_classification_statement:
      "No final classification is made by this handoff.",
    regulatory_intelligence_statement:
      "This handoff is not approved regulatory intelligence.",
    boundary: {
      human_review_required: true,
      operational_use_only: true,
      approved_artifact: false,
      approved_export_catalog_member: false,
      approved_export_bundle_member: false,
      final_customs_or_legal_determination: false,
      provider_or_llm_raw_output_included: false,
    },
    source_refs: {
      review_outcome_ref: outcomePath,
      action_plan_ref: actionPlanPath,
      review_checklist_ref: reviewChecklistPath,
      source_pack_plan_ref: sourcePackPlanPath,
      evidence_refs: artifactRefs,
      source_snapshot_refs: sourceSnapshotRefs,
    },
    missing_data: {
      audience: "client_or_broker",
      grouped_questions: buildQuestionGroups(missingDataQuestions),
    },
    blocked_until: asString(outcome["blocked_until"], "blocked_until"),
    limitations: asStringArray(outcome["limitations"], "limitations"),
    generation_metadata: {
      generated_by:
        "src/pipelines/build-argentina-backpack-missing-data-handoff.ts",
      generation_strategy:
        "deterministic local build from committed request-more-data review outcome; no wall-clock timestamp",
      source_review_outcome_id: asString(
        outcome["review_outcome_id"],
        "review_outcome_id",
      ),
      source_recorded_at: asString(outcome["recorded_at"], "recorded_at"),
      command: "pnpm ai:review:handoff:argentina-backpack",
    },
  };
}

export async function buildArgentinaBackpackMissingDataHandoff(
  options: ArgentinaBackpackMissingDataHandoffOptions = {},
): Promise<ArgentinaBackpackMissingDataHandoffResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const outputPath =
    options.outputPath ?? argentinaBackpackMissingDataHandoffDefaultPath;
  assertRepoRelativePath(outputPath, "output path");

  if (outputPath.startsWith("exports/approved-catalog/")) {
    throw new Error("handoff output must not be written to approved catalog");
  }

  const outcome = await readJson(repoRoot, outcomePath);
  const handoff = buildHandoff(outcome);
  const absoluteOutputPath = path.resolve(repoRoot, outputPath);

  await writeUtf8File(
    absoluteOutputPath,
    `${JSON.stringify(handoff, null, 2)}\n`,
  );

  return {
    outputPath,
    summary: [
      "Argentina backpack missing-data handoff generation: PASS",
      `output: ${outputPath}`,
      "outcome: request_more_data",
      "downstream_allowed: false",
      "export_eligible: false",
    ].join("\n"),
  };
}

async function run(): Promise<void> {
  const outputPath = process.argv[2];
  const result = await buildArgentinaBackpackMissingDataHandoff(
    outputPath === undefined ? {} : { outputPath },
  );

  console.log(result.summary);
}

if (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1]?.endsWith("build-argentina-backpack-missing-data-handoff.ts")
) {
  await run();
}
