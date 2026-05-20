import { validatePcramSourceSnapshot } from "./validate-source-snapshot.js";

export interface PcramDeltaArtifact {
  delta_id: string;
  source_id: string;
  previous_snapshot_id: string;
  current_snapshot_id: string;
  change_type: "no_change" | "modified";
  affected_codes: string[];
  summary: string;
  operational_impact: string;
  risk_level: "low" | "medium";
  requires_human_review: boolean;
  evidence_paths: string[];
}

export type PcramChangeClassification =
  | "no_change"
  | "content_changed"
  | "metadata_changed";

export type PcramDeltaResult =
  | {
      ok: true;
      changeClassification: PcramChangeClassification;
      delta: PcramDeltaArtifact;
    }
  | {
      ok: false;
      errors: string[];
    };

interface SnapshotShape {
  snapshot_id: string;
  source_id: string;
  source_name: string;
  source_type: string;
  source_url: string;
  captured_at: string;
  captured_by: string;
  capture_method: string;
  content_hash: string;
  raw_text_path: string;
  normalized_payload: unknown;
  notes: string[];
}

const METADATA_KEYS: Array<keyof SnapshotShape> = [
  "source_name",
  "source_type",
  "source_url",
  "captured_at",
  "captured_by",
  "capture_method",
  "content_hash",
  "raw_text_path",
];

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  const serializedEntries = entries.map(
    ([key, entryValue]) =>
      `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
  );
  return `{${serializedEntries.join(",")}}`;
}

function sanitizeForId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSnapshotShape(value: unknown): SnapshotShape {
  return value as SnapshotShape;
}

function extractCodes(snapshot: SnapshotShape): string[] {
  const payload = snapshot.normalized_payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [];
  }

  const payloadRecord = payload as Record<string, unknown>;
  const candidateKeys = ["ncm_mentions", "affected_codes"];
  const codes = new Set<string>();

  for (const key of candidateKeys) {
    const value = payloadRecord[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const candidate of value) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        codes.add(candidate.trim());
      }
    }
  }

  return Array.from(codes).sort();
}

function classifyChange(
  previousSnapshot: SnapshotShape,
  currentSnapshot: SnapshotShape,
): PcramChangeClassification {
  const previousNormalized = stableStringify(
    previousSnapshot.normalized_payload,
  );
  const currentNormalized = stableStringify(currentSnapshot.normalized_payload);

  if (previousNormalized !== currentNormalized) {
    return "content_changed";
  }

  const metadataChanged = METADATA_KEYS.some(
    (key) =>
      stableStringify(previousSnapshot[key]) !==
      stableStringify(currentSnapshot[key]),
  );

  if (metadataChanged) {
    return "metadata_changed";
  }

  return "no_change";
}

function deriveAffectedCodes(
  previousSnapshot: SnapshotShape,
  currentSnapshot: SnapshotShape,
  changeClassification: PcramChangeClassification,
): string[] {
  if (changeClassification === "no_change") {
    return [];
  }

  const previousCodes = extractCodes(previousSnapshot);
  const currentCodes = extractCodes(currentSnapshot);

  if (changeClassification === "metadata_changed") {
    return currentCodes;
  }

  const previousSet = new Set(previousCodes);
  const currentSet = new Set(currentCodes);
  const symmetricDiff: string[] = [];

  for (const code of currentCodes) {
    if (!previousSet.has(code)) {
      symmetricDiff.push(code);
    }
  }

  for (const code of previousCodes) {
    if (!currentSet.has(code)) {
      symmetricDiff.push(code);
    }
  }

  const uniqueDiff = Array.from(new Set(symmetricDiff)).sort();
  if (uniqueDiff.length > 0) {
    return uniqueDiff;
  }

  return currentCodes;
}

function buildDelta(
  previousSnapshot: SnapshotShape,
  currentSnapshot: SnapshotShape,
  changeClassification: PcramChangeClassification,
): PcramDeltaArtifact {
  const sourceId = currentSnapshot.source_id;
  const previousSnapshotId = previousSnapshot.snapshot_id;
  const currentSnapshotId = currentSnapshot.snapshot_id;

  const deltaId = [
    "delta",
    sanitizeForId(sourceId),
    sanitizeForId(previousSnapshotId),
    "to",
    sanitizeForId(currentSnapshotId),
    sanitizeForId(changeClassification),
  ].join("-");

  const affectedCodes = deriveAffectedCodes(
    previousSnapshot,
    currentSnapshot,
    changeClassification,
  );

  if (changeClassification === "no_change") {
    return {
      delta_id: deltaId,
      source_id: sourceId,
      previous_snapshot_id: previousSnapshotId,
      current_snapshot_id: currentSnapshotId,
      change_type: "no_change",
      affected_codes: [],
      summary: "No normalized payload or metadata changes detected.",
      operational_impact: "No operational impact detected in local comparison.",
      risk_level: "low",
      requires_human_review: false,
      evidence_paths: ["snapshots/pcram"],
    };
  }

  if (changeClassification === "metadata_changed") {
    return {
      delta_id: deltaId,
      source_id: sourceId,
      previous_snapshot_id: previousSnapshotId,
      current_snapshot_id: currentSnapshotId,
      change_type: "modified",
      affected_codes: affectedCodes,
      summary:
        "Snapshot metadata changed while normalized payload remained stable.",
      operational_impact:
        "Potential traceability update only; human review recommended before downstream use.",
      risk_level: "low",
      requires_human_review: true,
      evidence_paths: ["snapshots/pcram"],
    };
  }

  return {
    delta_id: deltaId,
    source_id: sourceId,
    previous_snapshot_id: previousSnapshotId,
    current_snapshot_id: currentSnapshotId,
    change_type: "modified",
    affected_codes: affectedCodes,
    summary: "Normalized payload changed between snapshots.",
    operational_impact:
      "Possible regulatory interpretation impact; human review required before any action.",
    risk_level: "medium",
    requires_human_review: true,
    evidence_paths: ["snapshots/pcram"],
  };
}

export function generatePcramDelta(
  previousSnapshot: unknown,
  currentSnapshot: unknown,
): PcramDeltaResult {
  const previousValidation = validatePcramSourceSnapshot(previousSnapshot);
  const currentValidation = validatePcramSourceSnapshot(currentSnapshot);

  const errors: string[] = [];
  if (!previousValidation.ok) {
    errors.push(
      ...previousValidation.errors.map((error) => `previous snapshot ${error}`),
    );
  }
  if (!currentValidation.ok) {
    errors.push(
      ...currentValidation.errors.map((error) => `current snapshot ${error}`),
    );
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  const previous = toSnapshotShape(previousSnapshot);
  const current = toSnapshotShape(currentSnapshot);
  const changeClassification = classifyChange(previous, current);
  const delta = buildDelta(previous, current, changeClassification);

  return {
    ok: true,
    changeClassification,
    delta,
  };
}
