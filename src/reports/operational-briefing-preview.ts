import path from "node:path";

import { readUtf8File, writeUtf8File } from "../lib/fs.js";

const briefingInputPaths = {
  registry: "schemas/schema-registry.json",
  approvedKbSnapshot: "snapshots/pcram/example-approved-kb-snapshot.json",
  relevanceAssessment: "snapshots/pcram/example-relevance-assessment.json",
  jurisdictionPack: "snapshots/pcram/example-jurisdiction-pack.json",
  approvedArtifact: "snapshots/pcram/example-approved-artifact.json",
  evidenceReportMetadata:
    "snapshots/pcram/example-evidence-report-metadata.json",
  brokerProfile: "snapshots/pcram/example-broker-profile.json",
} as const;

export interface OperationalBriefingInputs {
  registry: Record<string, unknown>;
  approvedKbSnapshot: Record<string, unknown>;
  relevanceAssessment: Record<string, unknown>;
  jurisdictionPack: Record<string, unknown>;
  approvedArtifact: Record<string, unknown>;
  evidenceReportMetadata: Record<string, unknown>;
  brokerProfile: Record<string, unknown>;
}

export interface OperationalBriefingModel {
  registryContractCount: number;
  snapshotName: string;
  snapshotStatus: string;
  snapshotVersion: string;
  countryScope: string[];
  jurisdictionScope: string[];
  nomenclatureScope: string;
  affectedCodes: string[];
  affectedTopics: string[];
  affectedCommodities: string[];
  affectedSpecializations: string[];
  brokerRole: string;
  brokerStyle: string;
  brokerRiskTolerance: string;
  relevanceLevel: string;
  riskLevel: string;
  urgency: string;
  reviewStatus: string;
  downstreamAllowed: boolean;
  requiresHumanReview: boolean;
  relevanceExplanation: string;
  sourceVersionRefs: string[];
  approvedArtifactRefs: string[];
  reviewManifestRefs: string[];
  evidenceRefs: string[];
  limitations: string[];
  uncertaintyNotes: string[];
  recommendedActions: string[];
}

export { briefingInputPaths };

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = record[key];

  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readBoolean(
  record: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = record[key];

  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
): string[] {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "not specified in fixture";
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function addBullets(lines: string[], values: string[]): void {
  if (values.length === 0) {
    lines.push("- Not specified in the local fixtures.");
    return;
  }

  for (const value of values) {
    lines.push(`- ${value}`);
  }
}

async function readJsonFile(
  relativePath: string,
): Promise<Record<string, unknown>> {
  const raw = await readUtf8File(path.resolve(process.cwd(), relativePath));

  return asRecord(JSON.parse(raw) as unknown, relativePath);
}

export async function readOperationalBriefingInputs(): Promise<OperationalBriefingInputs> {
  const [
    registry,
    approvedKbSnapshot,
    relevanceAssessment,
    jurisdictionPack,
    approvedArtifact,
    evidenceReportMetadata,
    brokerProfile,
  ] = await Promise.all([
    readJsonFile(briefingInputPaths.registry),
    readJsonFile(briefingInputPaths.approvedKbSnapshot),
    readJsonFile(briefingInputPaths.relevanceAssessment),
    readJsonFile(briefingInputPaths.jurisdictionPack),
    readJsonFile(briefingInputPaths.approvedArtifact),
    readJsonFile(briefingInputPaths.evidenceReportMetadata),
    readJsonFile(briefingInputPaths.brokerProfile),
  ]);

  return {
    registry,
    approvedKbSnapshot,
    relevanceAssessment,
    jurisdictionPack,
    approvedArtifact,
    evidenceReportMetadata,
    brokerProfile,
  };
}

export function buildOperationalBriefingModel(
  inputs: OperationalBriefingInputs,
): OperationalBriefingModel {
  const contracts = inputs.registry["contracts"];
  const registryContractCount = Array.isArray(contracts) ? contracts.length : 0;
  const snapshot = inputs.approvedKbSnapshot;
  const relevance = inputs.relevanceAssessment;
  const jurisdiction = inputs.jurisdictionPack;
  const artifact = inputs.approvedArtifact;
  const evidence = inputs.evidenceReportMetadata;
  const profile = inputs.brokerProfile;
  const relevanceLimitations = readStringArray(relevance, "limitations");
  const jurisdictionLimitations = readStringArray(jurisdiction, "limitations");
  const snapshotLimitations = readStringArray(snapshot, "limitations");
  const evidenceLimitations = readStringArray(evidence, "limitations");
  const profileNotes = readStringArray(profile, "notes");

  return {
    registryContractCount,
    snapshotName: readString(snapshot, "snapshot_name", "Approved KB Snapshot"),
    snapshotStatus: readString(snapshot, "status", "status_not_specified"),
    snapshotVersion: readString(
      snapshot,
      "snapshot_version",
      "version_not_specified",
    ),
    countryScope: unique([
      ...readStringArray(snapshot, "country_scope"),
      ...readStringArray(relevance, "country_scope"),
    ]),
    jurisdictionScope: unique([
      ...readStringArray(snapshot, "jurisdiction_scope"),
      ...readStringArray(jurisdiction, "jurisdiction_scope"),
      ...readStringArray(relevance, "jurisdiction_scope"),
    ]),
    nomenclatureScope: readString(
      snapshot,
      "nomenclature_scope",
      readString(
        jurisdiction,
        "nomenclature_scope",
        "not specified in fixture",
      ),
    ),
    affectedCodes: unique([
      ...readStringArray(snapshot, "affected_codes"),
      ...readStringArray(relevance, "affected_codes"),
      ...readStringArray(evidence, "affected_codes"),
    ]),
    affectedTopics: unique([
      ...readStringArray(snapshot, "affected_topics"),
      ...readStringArray(relevance, "affected_topics"),
      ...readStringArray(jurisdiction, "affected_topics"),
    ]),
    affectedCommodities: readStringArray(relevance, "affected_commodities"),
    affectedSpecializations: unique([
      ...readStringArray(relevance, "affected_specializations"),
      ...readStringArray(profile, "regulatory_specializations"),
    ]),
    brokerRole: readString(profile, "role", "customs_broker_despachante"),
    brokerStyle: readString(
      profile,
      "preferred_information_style",
      "checklist",
    ),
    brokerRiskTolerance: readString(profile, "risk_tolerance", "conservative"),
    relevanceLevel: readString(relevance, "relevance_level", "not_specified"),
    riskLevel: readString(
      relevance,
      "risk_level",
      readString(artifact, "risk_level", "not_specified"),
    ),
    urgency: readString(relevance, "urgency", "not_specified"),
    reviewStatus: readString(
      relevance,
      "review_status",
      readString(snapshot, "status", "not_specified"),
    ),
    downstreamAllowed:
      readBoolean(snapshot, "downstream_allowed", false) &&
      readBoolean(relevance, "downstream_allowed", false) &&
      readBoolean(artifact, "downstream_allowed", false),
    requiresHumanReview: readBoolean(relevance, "requires_human_review", true),
    relevanceExplanation: readString(
      relevance,
      "explanation",
      "No relevance explanation was provided in the local fixture.",
    ),
    sourceVersionRefs: unique([
      ...readStringArray(snapshot, "source_version_refs"),
      ...readStringArray(relevance, "source_refs"),
      ...readStringArray(jurisdiction, "source_version_refs"),
      ...readStringArray(artifact, "source_version_refs"),
      ...readStringArray(evidence, "source_version_refs"),
    ]),
    approvedArtifactRefs: unique([
      ...readStringArray(snapshot, "approved_artifact_refs"),
      readString(evidence, "approved_artifact_ref", ""),
      readString(relevance, "artifact_ref", ""),
    ]),
    reviewManifestRefs: unique([
      readString(snapshot, "review_manifest_ref", ""),
      readString(relevance, "review_manifest_ref", ""),
      readString(jurisdiction, "review_manifest_ref", ""),
      readString(artifact, "review_manifest_ref", ""),
      readString(evidence, "review_manifest_ref", ""),
    ]),
    evidenceRefs: unique([
      ...readStringArray(snapshot, "evidence_refs"),
      ...readStringArray(relevance, "evidence_refs"),
      ...readStringArray(jurisdiction, "evidence_refs"),
      ...readStringArray(artifact, "evidence_refs"),
      ...readStringArray(evidence, "evidence_refs"),
      readString(evidence, "report_ref", ""),
    ]),
    limitations: unique([
      ...snapshotLimitations,
      ...relevanceLimitations,
      ...jurisdictionLimitations,
      ...evidenceLimitations,
      ...profileNotes,
    ]),
    uncertaintyNotes: unique([
      ...readStringArray(snapshot, "uncertainty_notes"),
      ...readStringArray(relevance, "uncertainty_notes"),
      ...readStringArray(jurisdiction, "uncertainty_notes"),
    ]),
    recommendedActions: readStringArray(relevance, "recommended_actions"),
  };
}

export function renderOperationalBriefingPreview(
  model: OperationalBriefingModel,
): string {
  const lines = [
    "# Operational Intelligence Briefing Preview",
    "",
    "Premium local preview for reviewed AI Lab intelligence inside a future vLatamGlobal operator workspace.",
    "",
    "## Executive Signal",
    "",
    `- **Signal:** ${model.relevanceLevel} relevance for ${formatList(model.affectedCommodities)} across ${formatList(model.jurisdictionScope)}.`,
    `- **Operator Impact:** Affected NCM/topic scope intersects a ${model.brokerRole} profile with ${model.brokerRiskTolerance} risk tolerance.`,
    `- **Risk:** ${model.riskLevel} risk with ${model.urgency} urgency; human review remains ${model.requiresHumanReview ? "required" : "not required by fixture"}.`,
    `- **Review Gate:** downstream use is ${model.downstreamAllowed ? "allowed by all sampled gates" : "not allowed until review gates clear"}.`,
    "",
    "## Decision Workspace Snapshot",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Country / jurisdiction scope | ${formatList(model.jurisdictionScope)} |`,
    `| Country codes | ${formatList(model.countryScope)} |`,
    `| Nomenclature scope | ${model.nomenclatureScope} |`,
    `| Affected codes | ${formatList(model.affectedCodes)} |`,
    `| Affected topics | ${formatList(model.affectedTopics)} |`,
    `| Review status | ${model.reviewStatus} |`,
    `| Downstream allowed | ${formatBoolean(model.downstreamAllowed)} |`,
    `| Confidence / risk / urgency | ${model.relevanceLevel} relevance / ${model.riskLevel} risk / ${model.urgency} |`,
    `| Registry coverage | ${model.registryContractCount} hardened local contracts indexed |`,
    "",
    "## Why This Matters Operationally",
    "",
    `- **Operator Impact:** ${model.relevanceExplanation}`,
    `- **Workflow Fit:** The fixture profile prefers a ${model.brokerStyle} style, so the preview leads with decision signals, review gates, and next actions before deeper traceability.`,
    `- **Scope Control:** The affected topics (${formatList(model.affectedTopics)}) and codes (${formatList(model.affectedCodes)}) give the broker a focused lane for documentation review.`,
    `- **AI-Inferred:** relevance, urgency, and workflow priority are derived from the local relevance assessment fixture.`,
    `- **Human-Reviewed Evidence:** artifact, evidence, review manifest, and snapshot references remain separated below as traceability inputs.`,
    "",
    "## Evidence & Traceability",
    "",
    "| Evidence | Local reference |",
    "| --- | --- |",
  ];

  for (const reference of model.sourceVersionRefs) {
    lines.push(`| Source version | ${reference} |`);
  }

  for (const reference of model.approvedArtifactRefs) {
    lines.push(`| Approved artifact | ${reference} |`);
  }

  for (const reference of model.reviewManifestRefs) {
    lines.push(`| Review manifest | ${reference} |`);
  }

  for (const reference of model.evidenceRefs) {
    lines.push(`| Evidence ref | ${reference} |`);
  }

  lines.push(
    "",
    "**Evidence boundary:** the table above lists reviewed local references and fixture-backed traceability. It is not an AI inference block.",
    "",
    "## Risk, Uncertainty & Limits",
    "",
    `- **Risk:** ${model.riskLevel}`,
    `- **Urgency:** ${model.urgency}`,
    `- **Review Priority:** ${model.requiresHumanReview ? "human review required before operational use" : "human review not required by the sampled fixture"}`,
    "- **Legal Boundary:** this preview is not a final legal or customs determination.",
    "- **Uncertainty Notes:**",
  );
  addBullets(lines, model.uncertaintyNotes);
  lines.push("- **Limitations:**");
  addBullets(lines, model.limitations);
  lines.push(
    "",
    "## Recommended Next Actions",
    "",
    "- **Next Action:** verify affected NCM codes against the broker's current import documentation controls.",
  );
  addBullets(lines, model.recommendedActions);
  lines.push(
    "- **Review Gate:** keep downstream action paused until the pending review state is resolved.",
    "- **Operator Control:** treat this as decision support, not an autonomous clearance instruction.",
    "",
    "## Human Review & Downstream Use",
    "",
    "| Gate | State |",
    "| --- | --- |",
    `| Review status | ${model.reviewStatus} |`,
    `| Human review required | ${formatBoolean(model.requiresHumanReview)} |`,
    `| Downstream allowed | ${formatBoolean(model.downstreamAllowed)} |`,
    "| Local-only note | Generated from repository fixtures only; no production systems, external services, or network access are required. |",
    "",
    "## Briefing Quality Bar",
    "",
    "- **concise-first:** executive signal appears before evidence depth.",
    "- **evidence-first:** traceability references are visible and separated from inference.",
    "- **uncertainty visible:** risk, urgency, limitations, and uncertainty notes are explicit.",
    "- **next action clear:** broker-facing checklist items are available without raw JSON review.",
    "- **AI inference separated from reviewed evidence:** relevance and priority are labeled apart from reviewed refs.",
    "- **not raw schema output:** the preview is operator-facing and does not dump source JSON.",
    "",
  );

  return lines.join("\n");
}

export async function generateOperationalBriefingPreview(
  outputPath = "reports/operational-briefing-preview-p1.md",
): Promise<string> {
  const inputs = await readOperationalBriefingInputs();
  const model = buildOperationalBriefingModel(inputs);
  const markdown = renderOperationalBriefingPreview(model);

  await writeUtf8File(path.resolve(process.cwd(), outputPath), markdown);

  return markdown;
}

async function run(): Promise<void> {
  const outputPath =
    process.argv[2] ?? "reports/operational-briefing-preview-p1.md";

  await generateOperationalBriefingPreview(outputPath);
  console.log(
    `Operational briefing preview generated successfully: ${outputPath}`,
  );
}

if (process.argv[1]?.endsWith("operational-briefing-preview.ts")) {
  run().catch((error) => {
    console.error("Operational briefing preview generation failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
