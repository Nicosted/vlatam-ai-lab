export type JsonObject = Record<string, unknown>;

export type ArgentinaBackpackReadinessInputs = {
  evidencePacket: JsonObject;
  extractionDraft: JsonObject;
  reviewManifest: JsonObject;
  classifierDraft: JsonObject;
  sourceSnapshots: JsonObject[];
};

export type ArgentinaBackpackReadinessResult = {
  approvalReady: boolean;
  blockers: string[];
};

const requiredFindingKeys = [
  "exact_material_composition_percentages",
  "polyester_construction_status",
  "intended_school_backpack_use",
  "dimensions_and_capacity",
  "accessories_components_and_relevance",
  "country_of_origin_import_context",
  "invoice_catalog_spec_sheet_consistency",
  "adequate_source_references_for_narrow_support",
  "no_final_customs_or_legal_determination_language",
  "no_downstream_scope_beyond_reviewed_evidence",
] as const;

const sourceReviewKeys = [
  "argentina_customs_tariff_authority",
  "mercosur_ncm",
  "wco_hs",
] as const;

const forbiddenCouplingPatterns: Array<[RegExp, string]> = [
  [/\bsupabase\b/i, "Supabase reference"],
  [/\bprocess\.env\b/i, "process.env reference"],
  [/\$\{[^}]*\}/, "template environment interpolation"],
  [/\$[A-Z][A-Z0-9_]+/, "shell-style environment reference"],
  [/\b[A-Z][A-Z0-9_]*(?:API|PROJECT|SERVICE|ANON)?_KEY\b/, "env key reference"],
  [/\b\.env(?:\b|[._-])/i, ".env reference"],
  [/\bproject[_-]?ref\b/i, "project ref reference"],
  [/\bservice[_-]?role\b/i, "service role reference"],
  [/\banon[_-]?key\b/i, "anon key reference"],
  [/\bapi[_-]?key\b/i, "API key reference"],
  [/\bauthorization\b/i, "authorization reference"],
  [/\bbearer\s+[a-z0-9._-]+/i, "bearer token reference"],
  [/\bcredential/i, "credential reference"],
  [/\bprovider[_-]?metadata\b/i, "provider metadata reference"],
  [/\braw\s+(?:llm|provider)\s+output\b/i, "raw LLM/provider output"],
  [/\braw_llm_output\b/i, "raw LLM output field"],
  [/\bmodel[_-]?provider\b/i, "model provider reference"],
  [/\/Users\//, "local absolute path"],
  [/\/private\//, "local absolute path"],
  [/[A-Z]:\\Users\\/i, "local absolute path"],
  [/\bgraphify-out\b/i, "Graphify output reference"],
  [/\blive[_-]?integration\b/i, "live runtime coupling"],
  [/\bruntime[_-]?writeback\b/i, "runtime writeback coupling"],
  [/\bshared[_-]?database[_-]?coupling\b/i, "database coupling"],
];

const finalDeterminationPatterns: Array<[RegExp, string]> = [
  [
    /\bis\s+(?:finally\s+)?classified\s+as\b/i,
    "final classification assertion",
  ],
  [/\bfinal\s+(?:NCM|HS)\s+code\s+(?:is|:)\b/i, "final NCM/HS code assertion"],
  [/\bbinding\s+classification\b/i, "binding classification assertion"],
  [
    /\btariff\s+treatment\s+(?:is|applies|approved)\b/i,
    "tariff treatment assertion",
  ],
  [
    /\bimport\s+clearance\s+(?:is\s+)?(?:approved|cleared|authorized)\b/i,
    "import clearance assertion",
  ],
  [
    /\bcustoms\s+determination\s+(?:is|:)\b/i,
    "customs determination assertion",
  ],
  [/\blegal\s+determination\s+(?:is|:)\b/i, "legal determination assertion"],
  [/\blegal\s+advice\s+(?:is|:)\b/i, "legal advice assertion"],
];

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordAt(
  value: JsonObject,
  key: string,
  label: string,
  blockers: string[],
): JsonObject | null {
  const child = value[key];
  if (!isRecord(child)) {
    blockers.push(`${label}.${key} must be an object.`);
    return null;
  }

  return child;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function allEvidenceRefsExist(
  refs: string[],
  allowedRefs: Set<string>,
): boolean {
  return refs.length > 0 && refs.every((ref) => allowedRefs.has(ref));
}

function pushForbiddenCouplingBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  blockers: string[],
): void {
  const serialized = JSON.stringify(inputs);

  for (const [pattern, description] of forbiddenCouplingPatterns) {
    if (pattern.test(serialized)) {
      blockers.push(`Readiness inputs must not contain ${description}.`);
    }
  }
}

function pushFinalDeterminationBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  blockers: string[],
): void {
  const serialized = JSON.stringify(inputs);

  for (const [pattern, description] of finalDeterminationPatterns) {
    if (pattern.test(serialized)) {
      blockers.push(`Readiness inputs must not contain ${description}.`);
    }
  }
}

function pushDownstreamBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  approvedReview: boolean,
  blockers: string[],
): void {
  const downstreamRecords: Array<[string, JsonObject]> = [
    ["evidencePacket", inputs.evidencePacket],
    ["extractionDraft", inputs.extractionDraft],
    ["reviewManifest", inputs.reviewManifest],
    [
      "classifierDraft.review",
      isRecord(inputs.classifierDraft["review"])
        ? inputs.classifierDraft["review"]
        : {},
    ],
    ...inputs.sourceSnapshots.map((snapshot, index): [string, JsonObject] => [
      `sourceSnapshots[${index}]`,
      snapshot,
    ]),
  ];

  for (const [label, record] of downstreamRecords) {
    if (record["downstream_allowed"] === true && !approvedReview) {
      blockers.push(
        `${label}.downstream_allowed cannot be true without approved review evidence.`,
      );
    }
  }
}

function pushCurrentCaseIdentityBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  blockers: string[],
): void {
  const productContext = isRecord(inputs.evidencePacket["metadata"])
    ? inputs.evidencePacket["metadata"]["product_context"]
    : null;
  const context = isRecord(productContext) ? productContext : {};

  if (
    context["product_name"] !== "school backpack made primarily of polyester" ||
    context["intended_use"] !== "school backpack"
  ) {
    blockers.push(
      "Evidence packet must remain scoped to the Argentina polyester school backpack case.",
    );
  }

  if (
    inputs.extractionDraft["evidence_packet_id"] !==
    inputs.evidencePacket["evidence_packet_id"]
  ) {
    blockers.push(
      "Extraction draft must reference the Argentina backpack evidence packet.",
    );
  }

  if (
    inputs.reviewManifest["artifact_id"] !==
    inputs.extractionDraft["extraction_result_id"]
  ) {
    blockers.push(
      "Review manifest must reference the Argentina backpack extraction draft.",
    );
  }
}

function pushSourceSnapshotBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  blockers: string[],
): void {
  if (inputs.sourceSnapshots.length < sourceReviewKeys.length) {
    blockers.push(
      "All Argentina, MERCOSUR/NCM, and WCO/HS source snapshots must be present.",
    );
  }

  for (const [index, snapshot] of inputs.sourceSnapshots.entries()) {
    const label = `sourceSnapshots[${index}]`;
    if (snapshot["review_status"] !== "approved") {
      blockers.push(`${label}.review_status must be approved for readiness.`);
    }

    if (snapshot["freshness_status"] !== "current") {
      blockers.push(`${label}.freshness_status must be current for readiness.`);
    }

    if (snapshot["human_review_required"] !== false) {
      blockers.push(
        `${label}.human_review_required must be false after review.`,
      );
    }
  }
}

function pushReviewEvidenceBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  blockers: string[],
): boolean {
  const reviewEvidence = isRecord(inputs.reviewManifest["metadata"])
    ? inputs.reviewManifest["metadata"]["approval_readiness_review"]
    : null;

  if (!isRecord(reviewEvidence)) {
    blockers.push(
      "reviewManifest.metadata.approval_readiness_review is required.",
    );
    return false;
  }

  const approvedReview =
    inputs.reviewManifest["review_status"] === "approved" &&
    reviewEvidence["status"] === "reviewed_approved" &&
    reviewEvidence["approved_for_approved_artifact"] === true;

  if (!approvedReview) {
    blockers.push(
      "Review manifest must be explicitly approved for creating a bounded approved artifact.",
    );
  }

  const allowedRefs = new Set([
    ...stringArray(inputs.reviewManifest["evidence_refs"]),
    ...stringArray(reviewEvidence["evidence_refs"]),
  ]);

  const findings = recordAt(
    reviewEvidence,
    "findings",
    "reviewManifest.metadata.approval_readiness_review",
    blockers,
  );

  if (findings) {
    for (const key of requiredFindingKeys) {
      const finding = findings[key];
      if (!isRecord(finding)) {
        blockers.push(`Readiness finding ${key} is required.`);
        continue;
      }

      if (finding["status"] !== "verified") {
        blockers.push(`Readiness finding ${key} must be verified.`);
      }

      if (
        !allEvidenceRefsExist(
          stringArray(finding["evidence_refs"]),
          allowedRefs,
        )
      ) {
        blockers.push(
          `Readiness finding ${key} must cite reviewed evidence refs.`,
        );
      }
    }
  }

  const sourceReview = recordAt(
    reviewEvidence,
    "source_reference_review",
    "reviewManifest.metadata.approval_readiness_review",
    blockers,
  );

  if (sourceReview) {
    for (const key of sourceReviewKeys) {
      const finding = sourceReview[key];
      if (!isRecord(finding)) {
        blockers.push(`Source review finding ${key} is required.`);
        continue;
      }

      if (finding["status"] !== "reviewed_current") {
        blockers.push(`Source review finding ${key} must be reviewed_current.`);
      }

      if (
        !allEvidenceRefsExist(
          stringArray(finding["evidence_refs"]),
          allowedRefs,
        )
      ) {
        blockers.push(
          `Source review finding ${key} must cite reviewed evidence refs.`,
        );
      }
    }
  }

  return approvedReview;
}

function pushCompositionDependencyBlockers(
  inputs: ArgentinaBackpackReadinessInputs,
  blockers: string[],
): void {
  const metadata = isRecord(inputs.reviewManifest["metadata"])
    ? inputs.reviewManifest["metadata"]
    : {};
  const missingFacts = stringArray(
    metadata["missing_product_facts_to_confirm"],
  );

  for (const missing of missingFacts) {
    if (/exact material percentages/i.test(missing)) {
      blockers.push("Exact material composition percentages remain missing.");
    }

    if (/coating|plastic layers/i.test(missing)) {
      blockers.push("Coated textile/plastic layer status remains unknown.");
    }
  }
}

export function evaluateArgentinaBackpackApprovalReadiness(
  inputs: ArgentinaBackpackReadinessInputs,
): ArgentinaBackpackReadinessResult {
  const blockers: string[] = [];

  pushCurrentCaseIdentityBlockers(inputs, blockers);
  pushForbiddenCouplingBlockers(inputs, blockers);
  pushFinalDeterminationBlockers(inputs, blockers);
  pushSourceSnapshotBlockers(inputs, blockers);
  pushCompositionDependencyBlockers(inputs, blockers);

  const approvedReview = pushReviewEvidenceBlockers(inputs, blockers);
  pushDownstreamBlockers(inputs, approvedReview, blockers);

  return {
    approvalReady: blockers.length === 0,
    blockers,
  };
}
