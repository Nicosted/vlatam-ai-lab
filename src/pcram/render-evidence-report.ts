import { nowIso } from "../lib/date.js";

interface SnapshotContext {
  snapshot_id: string;
  source_id: string;
  source_name: string;
  source_type: string;
}

interface DeltaContext {
  delta_id: string;
  source_id: string;
  previous_snapshot_id: string;
  current_snapshot_id: string;
  change_type: string;
  affected_codes: string[];
  summary: string;
  operational_impact: string;
  risk_level: string;
  requires_human_review: boolean;
  evidence_paths: string[];
}

export interface RenderPcramEvidenceReportInput {
  previousSnapshot: unknown;
  currentSnapshot: unknown;
  delta: unknown;
  generatedAt?: string;
  title?: string;
  assumptions?: string[];
  limitations?: string[];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }

  return value;
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean.`);
  }

  return value;
}

function readStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label}.${key} must be an array of strings.`);
  }

  return [...value];
}

function toSnapshotContext(value: unknown, label: string): SnapshotContext {
  const record = asRecord(value, label);

  return {
    snapshot_id: readRequiredString(record, "snapshot_id", label),
    source_id: readRequiredString(record, "source_id", label),
    source_name: readRequiredString(record, "source_name", label),
    source_type: readRequiredString(record, "source_type", label),
  };
}

function toDeltaContext(value: unknown): DeltaContext {
  const label = "delta";
  const record = asRecord(value, label);

  return {
    delta_id: readRequiredString(record, "delta_id", label),
    source_id: readRequiredString(record, "source_id", label),
    previous_snapshot_id: readRequiredString(
      record,
      "previous_snapshot_id",
      label,
    ),
    current_snapshot_id: readRequiredString(
      record,
      "current_snapshot_id",
      label,
    ),
    change_type: readRequiredString(record, "change_type", label),
    affected_codes: readStringArray(record, "affected_codes", label),
    summary: readRequiredString(record, "summary", label),
    operational_impact: readRequiredString(record, "operational_impact", label),
    risk_level: readRequiredString(record, "risk_level", label),
    requires_human_review: readRequiredBoolean(
      record,
      "requires_human_review",
      label,
    ),
    evidence_paths: readStringArray(record, "evidence_paths", label),
  };
}

function addBulletList(lines: string[], items: string[]): void {
  if (items.length === 0) {
    lines.push("- (none)");
    return;
  }

  for (const item of items) {
    lines.push(`- ${item}`);
  }
}

export function renderPcramEvidenceReport(
  input: RenderPcramEvidenceReportInput,
): string {
  const previousSnapshot = toSnapshotContext(
    input.previousSnapshot,
    "previous snapshot",
  );
  const currentSnapshot = toSnapshotContext(
    input.currentSnapshot,
    "current snapshot",
  );
  const delta = toDeltaContext(input.delta);

  if (previousSnapshot.source_id !== currentSnapshot.source_id) {
    throw new Error(
      "previous snapshot source_id must match current snapshot source_id.",
    );
  }

  if (delta.source_id !== currentSnapshot.source_id) {
    throw new Error("delta.source_id must match current snapshot source_id.");
  }

  if (delta.previous_snapshot_id !== previousSnapshot.snapshot_id) {
    throw new Error(
      "delta.previous_snapshot_id must match previous snapshot snapshot_id.",
    );
  }

  if (delta.current_snapshot_id !== currentSnapshot.snapshot_id) {
    throw new Error(
      "delta.current_snapshot_id must match current snapshot snapshot_id.",
    );
  }

  const generatedAt = input.generatedAt ?? nowIso();
  const title = input.title ?? "PCRAM Evidence Report";

  const defaultAssumptions = [
    "This report was generated from local artifacts only.",
    "Delta semantics are interpreted from the provided deterministic delta artifact.",
  ];
  const defaultLimitations = [
    "No external source fetch or network verification was executed.",
    "This report remains advisory until human review is completed.",
  ];

  const assumptions =
    input.assumptions && input.assumptions.length > 0
      ? [...input.assumptions]
      : defaultAssumptions;
  const limitations =
    input.limitations && input.limitations.length > 0
      ? [...input.limitations]
      : defaultLimitations;

  const lines: string[] = [`# ${title}`, "", "## Metadata", ""];

  lines.push(`- Generated At: \`${generatedAt}\``);
  lines.push(`- Delta ID: \`${delta.delta_id}\``);
  lines.push("");

  lines.push("## Snapshot Context");
  lines.push("");
  lines.push(`- Source ID: \`${currentSnapshot.source_id}\``);
  lines.push(`- Previous Snapshot ID: \`${previousSnapshot.snapshot_id}\``);
  lines.push(`- Current Snapshot ID: \`${currentSnapshot.snapshot_id}\``);
  lines.push(`- Source Name: \`${currentSnapshot.source_name}\``);
  lines.push(`- Source Type: \`${currentSnapshot.source_type}\``);
  lines.push("");

  lines.push("## Delta Summary");
  lines.push("");
  lines.push(`- Change Type: \`${delta.change_type}\``);
  lines.push(
    `- Affected Codes: ${
      delta.affected_codes.length > 0
        ? `\`${delta.affected_codes.join(", ")}\``
        : "`none`"
    }`,
  );
  lines.push(`- Summary: ${delta.summary}`);
  lines.push(`- Operational Impact: ${delta.operational_impact}`);
  lines.push(`- Risk Level: \`${delta.risk_level}\``);
  lines.push(
    `- Requires Human Review: \`${String(delta.requires_human_review)}\``,
  );
  lines.push("");

  lines.push("## Evidence Paths");
  lines.push("");
  addBulletList(
    lines,
    delta.evidence_paths.map((evidencePath) => `\`${evidencePath}\``),
  );
  lines.push("");

  lines.push("## Assumptions / Limitations");
  lines.push("");
  lines.push("### Assumptions");
  lines.push("");
  addBulletList(lines, assumptions);
  lines.push("");
  lines.push("### Limitations");
  lines.push("");
  addBulletList(lines, limitations);
  lines.push("");

  return lines.join("\n");
}
