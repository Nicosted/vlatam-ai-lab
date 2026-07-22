import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";

import {
  APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
  prepareApprovedArcaArtifact,
} from "../../src/artifacts/approved-arca-artifact-builder.js";
import type { GovernedArcaCandidateArtifact } from "../../src/ingestion/governed-arca-acquired-source.js";
import {
  ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
  createArcaCandidateBinding,
  evaluateGovernedArcaCandidateReview,
  sealGovernedArcaCandidateReview,
  type GovernedArcaCandidateReview,
} from "../../src/review/governed-arca-candidate-review.js";
import { REVIEW_CANONICALIZATION_VERSION } from "../../src/review/review-artifact-binding.js";
import {
  DURABLE_ARCA_STORE_COMMAND_SCHEMA,
  DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
  DURABLE_ARCA_STORE_EVENT_SCHEMA,
  DURABLE_ARCA_STORE_PROJECTION_SCHEMA,
  DURABLE_ARCA_STORE_RESULT_SCHEMA,
  assertNoDurableStoreStagingFiles,
  executeDurableArcaStoreCommand,
  verifyDurableArcaStore,
  type DurableArcaStoreCommand,
  type DurableArcaStoreOperation,
} from "../../src/store/durable-arca-review-store.js";

const EVENT_AT = "2026-07-22T15:00:00.000Z";
const EVALUATED_AT = "2026-07-22T14:00:00.000Z";
const EXPIRES_AT = "2026-08-22T15:00:00.000Z";

const FALSE_AUTHORITIES = {
  export_authorized: false,
  publication_authorized: false,
  production_authorized: false,
  network_authorized: false,
  database_authorized: false,
  scheduler_authorized: false,
  deployment_authorized: false,
  vlatam_global_access_authorized: false,
} as const;

async function fixture(): Promise<{
  candidate: GovernedArcaCandidateArtifact;
  review: GovernedArcaCandidateReview;
}> {
  const value = JSON.parse(
    await readFile("data/fixtures/arca/ai-127-pending-review.json", "utf8"),
  ) as {
    candidate: GovernedArcaCandidateArtifact;
    review: GovernedArcaCandidateReview;
  };
  return value;
}

function approvedReview(
  candidate: GovernedArcaCandidateArtifact,
): GovernedArcaCandidateReview {
  return sealGovernedArcaCandidateReview({
    schema_version: ARCA_CANDIDATE_REVIEW_CONTRACT_VERSION,
    artifact_type: "governed_arca_candidate_human_review",
    canonicalization_version: REVIEW_CANONICALIZATION_VERSION,
    candidate_binding: createArcaCandidateBinding(candidate),
    lifecycle: "approved",
    lifecycle_transition: { from: "pending", to: "approved" },
    scope: "approved_artifact_building_only",
    reviewer: {
      identity: "human:synthetic-reviewer",
      identity_type: "human",
      role: "evidence_reviewer",
    },
    decision_timestamp: "2026-07-22T13:00:00.000Z",
    expires_at: EXPIRES_AT,
    review_statement: "Synthetic reviewed evidence is internally consistent.",
    rejection_reason: null,
    reason_codes: [
      "identity_verified",
      "provenance_verified",
      "parser_output_verified",
      "completeness_verified",
      "regulatory_accuracy_verified",
    ],
    findings: [],
    separation_of_duties: {
      acquisition_operator_identity: "human:synthetic-acquisition",
      parser_runtime_identity: "runtime:arca-nomenclador-txt@1.0.0",
      candidate_producer_identity: "human:synthetic-producer",
      evidence_reviewer_identity: "human:synthetic-reviewer",
      future_artifact_builder_identity: null,
      future_publisher_export_approver_identity: null,
      reviewer_independence_asserted: true,
    },
    superseded_by: null,
  });
}

function command(
  operation: DurableArcaStoreOperation,
  governed_record: unknown | null,
  candidate_id: string | null = null,
  timestamp = EVENT_AT,
): DurableArcaStoreCommand {
  return {
    schema_version: "1.0.0",
    operation,
    actor_identity: "human:synthetic-store-operator",
    event_timestamp: timestamp,
    candidate_id,
    governed_record,
    ...FALSE_AUTHORITIES,
  };
}

async function freshRoot(): Promise<string> {
  return mkdtemp(join(await realpath(tmpdir()), "ai-130-store-"));
}

async function record(
  root: string,
  operation: DurableArcaStoreOperation,
  value: unknown,
  timestamp = EVENT_AT,
) {
  const result = await executeDurableArcaStoreCommand(
    root,
    command(operation, value, null, timestamp),
  );
  assert.equal(result.success, true, result.details.join(","));
  return result;
}

test("AI-130 schemas compile and configuration is domain-bound", () => {
  const ajv = new Ajv({ strict: true });
  for (const schema of [
    DURABLE_ARCA_STORE_COMMAND_SCHEMA,
    DURABLE_ARCA_STORE_EVENT_SCHEMA,
    DURABLE_ARCA_STORE_PROJECTION_SCHEMA,
    DURABLE_ARCA_STORE_RESULT_SCHEMA,
  ])
    assert.doesNotThrow(() => ajv.compile(schema));
  assert.match(DURABLE_ARCA_STORE_CONFIGURATION_SHA256, /^[a-f0-9]{64}$/);
});

test("checked-in AI-130 schemas compile as closed Draft 2020-12 contracts", async () => {
  const ajv = new Ajv({ strict: true });
  for (const path of [
    "schemas/durable-arca-store-command.schema.json",
    "schemas/durable-arca-store-audit-event.schema.json",
    "schemas/durable-arca-workflow-projection.schema.json",
    "schemas/durable-arca-store-operation-result.schema.json",
  ]) {
    const schema = JSON.parse(await readFile(path, "utf8")) as object;
    assert.doesNotThrow(() => ajv.compile(schema), path);
    assert.equal(
      (schema as { additionalProperties?: boolean }).additionalProperties,
      false,
    );
  }
});

test("records a valid candidate, publishes an event/projection, and duplicate bytes are idempotent", async () => {
  const root = await freshRoot();
  const { candidate } = await fixture();
  const first = await record(root, "record_candidate", candidate);
  assert.equal(first.outcome, "recorded");
  assert.equal(first.record_created, true);
  const second = await executeDurableArcaStoreCommand(
    root,
    command("record_candidate", candidate),
  );
  assert.equal(second.outcome, "duplicate_unchanged");
  assert.equal(second.idempotent, true);
  assert.equal((await readdir(join(root, "events"))).length, 1);
  assert.equal((await verifyDurableArcaStore(root)).outcome, "store_verified");
  assert.equal(await assertNoDurableStoreStagingFiles(root), true);
});

test("same candidate identity with different stored bytes fails closed", async () => {
  const root = await freshRoot();
  const { candidate } = await fixture();
  await record(root, "record_candidate", candidate);
  const [path] = await readdir(join(root, "candidates"));
  assert.ok(path);
  await writeFile(join(root, "candidates", path), "{}\n");
  const result = await executeDurableArcaStoreCommand(
    root,
    command("record_candidate", candidate),
  );
  assert.equal(result.outcome, "identity_collision");
});

test("rejects orphan review and accepts exact review after candidate", async () => {
  const { candidate, review } = await fixture();
  const orphanRoot = await freshRoot();
  assert.equal(
    (
      await executeDurableArcaStoreCommand(
        orphanRoot,
        command("record_review", review),
      )
    ).outcome,
    "orphan_record",
  );
  const root = await freshRoot();
  await record(root, "record_candidate", candidate);
  assert.equal(
    (await record(root, "record_review", review)).outcome,
    "recorded",
  );
});

test("review candidate-binding mismatch is rejected", async () => {
  const root = await freshRoot();
  const { candidate, review } = await fixture();
  await record(root, "record_candidate", candidate);
  const mismatch = structuredClone(review) as unknown as Record<
    string,
    unknown
  >;
  (mismatch["candidate_binding"] as Record<string, unknown>)[
    "raw_byte_sha256"
  ] = "f".repeat(64);
  const result = await executeDurableArcaStoreCommand(
    root,
    command("record_review", mismatch),
  );
  assert.equal(result.success, false);
  assert.ok(
    ["binding_mismatch", "publication_failed"].includes(result.outcome),
  );
});

test("rejects orphan evaluation, then records exact evaluation", async () => {
  const { candidate, review } = await fixture();
  const evaluation = evaluateGovernedArcaCandidateReview(
    candidate,
    review,
    EVALUATED_AT,
  );
  const orphanRoot = await freshRoot();
  assert.equal(
    (
      await executeDurableArcaStoreCommand(
        orphanRoot,
        command("record_evaluation", evaluation),
      )
    ).outcome,
    "orphan_record",
  );
  const root = await freshRoot();
  await record(root, "record_candidate", candidate);
  await record(root, "record_review", review);
  assert.equal(
    (await record(root, "record_evaluation", evaluation)).outcome,
    "recorded",
  );
});

test("evaluation mismatch and artifact without upstream records fail closed", async () => {
  const { candidate } = await fixture();
  const review = approvedReview(candidate);
  const evaluation = evaluateGovernedArcaCandidateReview(
    candidate,
    review,
    EVALUATED_AT,
  );
  const mismatch = structuredClone(evaluation) as unknown as Record<
    string,
    unknown
  >;
  mismatch["review_sha256"] = "f".repeat(64);
  const root = await freshRoot();
  await record(root, "record_candidate", candidate);
  await record(root, "record_review", review);
  assert.equal(
    (
      await executeDurableArcaStoreCommand(
        root,
        command("record_evaluation", mismatch),
      )
    ).outcome,
    "invalid_record",
  );
  const prepared = prepareApprovedArcaArtifact({
    candidate,
    review,
    evaluation,
    builderIdentity: APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
    buildTimestamp: EVENT_AT,
  });
  assert.ok("artifact" in prepared);
  const orphanRoot = await freshRoot();
  assert.equal(
    (
      await executeDurableArcaStoreCommand(
        orphanRoot,
        command("record_approved_artifact", prepared.artifact),
      )
    ).outcome,
    "orphan_record",
  );
});

test("persists the complete valid Approved Artifact workflow", async () => {
  const root = await freshRoot();
  const { candidate } = await fixture();
  const review = approvedReview(candidate);
  const evaluation = evaluateGovernedArcaCandidateReview(
    candidate,
    review,
    EVALUATED_AT,
  );
  const prepared = prepareApprovedArcaArtifact({
    candidate,
    review,
    evaluation,
    builderIdentity: APPROVED_ARCA_SERVICE_BUILDER_IDENTITY,
    buildTimestamp: EVENT_AT,
  });
  assert.ok("artifact" in prepared);
  await record(root, "record_candidate", candidate);
  await record(root, "record_review", review);
  await record(root, "record_evaluation", evaluation);
  await record(root, "record_approved_artifact", prepared.artifact);
  assert.equal((await readdir(join(root, "events"))).length, 4);
  assert.equal((await verifyDurableArcaStore(root)).outcome, "store_verified");
});

test("detects modified prior hash, missing event, reordered event, and duplicate sequence", async () => {
  const makeTwo = async () => {
    const root = await freshRoot();
    const { candidate, review } = await fixture();
    await record(root, "record_candidate", candidate);
    await record(root, "record_review", review);
    return root;
  };
  const tampered = await makeTwo();
  const names = (await readdir(join(tampered, "events"))).sort();
  const secondPath = join(tampered, "events", names[1]!);
  const second = JSON.parse(await readFile(secondPath, "utf8")) as Record<
    string,
    unknown
  >;
  second["previous_event_sha256"] = "f".repeat(64);
  await writeFile(secondPath, `${JSON.stringify(second)}\n`);
  assert.equal(
    (await verifyDurableArcaStore(tampered)).outcome,
    "integrity_invalid",
  );

  const missing = await makeTwo();
  const missingNames = (await readdir(join(missing, "events"))).sort();
  await rm(join(missing, "events", missingNames[0]!));
  assert.equal(
    (await verifyDurableArcaStore(missing)).outcome,
    "integrity_invalid",
  );

  const reordered = await makeTwo();
  const reorderNames = (await readdir(join(reordered, "events"))).sort();
  await rename(
    join(reordered, "events", reorderNames[0]!),
    join(
      reordered,
      "events",
      `000000000002--${reorderNames[0]!.split("--").slice(1).join("--")}`,
    ),
  );
  assert.equal(
    (await verifyDurableArcaStore(reordered)).outcome,
    "integrity_invalid",
  );

  const duplicate = await makeTwo();
  const duplicateNames = (await readdir(join(duplicate, "events"))).sort();
  await writeFile(
    join(
      duplicate,
      "events",
      `000000000001--arca-store-event--${"f".repeat(64)}.json`,
    ),
    await readFile(join(duplicate, "events", duplicateNames[0]!)),
  );
  assert.equal(
    (await verifyDurableArcaStore(duplicate)).outcome,
    "integrity_invalid",
  );
});

test("rejects malformed actor, timestamp, and command unknown fields without wall-clock fallback", async () => {
  const root = await freshRoot();
  const { candidate } = await fixture();
  const badActor = {
    ...command("record_candidate", candidate),
    actor_identity: "reviewer",
  };
  assert.equal(
    (await executeDurableArcaStoreCommand(root, badActor)).outcome,
    "invalid_command",
  );
  assert.equal(
    (
      await executeDurableArcaStoreCommand(
        root,
        command("record_candidate", candidate, null, "2026-07-22"),
      )
    ).outcome,
    "invalid_command",
  );
  assert.equal(
    (
      await executeDurableArcaStoreCommand(root, {
        ...command("record_candidate", candidate),
        unknown: true,
      })
    ).outcome,
    "invalid_command",
  );
});

test("rejects symlink ancestors, symlink final root, and non-directory roots", async () => {
  const base = await freshRoot();
  const real = join(base, "real");
  await mkdir(real);
  const link = join(base, "link");
  await symlink(real, link);
  assert.equal(
    (await verifyDurableArcaStore(join(link, "child"))).outcome,
    "unsafe_store_root",
  );
  assert.equal(
    (await verifyDurableArcaStore(link)).outcome,
    "unsafe_store_root",
  );
  const file = join(base, "file");
  await writeFile(file, "x");
  assert.equal(
    (await verifyDurableArcaStore(file)).outcome,
    "unsafe_store_root",
  );

  const recordRoot = await freshRoot();
  const { candidate } = await fixture();
  await record(recordRoot, "record_candidate", candidate);
  const [candidateName] = await readdir(join(recordRoot, "candidates"));
  assert.ok(candidateName);
  const candidateFile = join(recordRoot, "candidates", candidateName);
  const external = join(base, "external-candidate.json");
  await writeFile(external, await readFile(candidateFile));
  await rm(candidateFile);
  await symlink(external, candidateFile);
  assert.equal(
    (
      await executeDurableArcaStoreCommand(
        recordRoot,
        command("record_candidate", candidate),
      )
    ).outcome,
    "unsafe_store_root",
  );
});

test("exclusive competing operations do not lose an event", async () => {
  const root = await freshRoot();
  const { candidate } = await fixture();
  const [a, b] = await Promise.all([
    executeDurableArcaStoreCommand(
      root,
      command("record_candidate", candidate),
    ),
    executeDurableArcaStoreCommand(
      root,
      command("record_candidate", candidate),
    ),
  ]);
  assert.equal(a.success || b.success, true);
  assert.ok(
    [a.outcome, b.outcome].some(
      (value) => value === "store_busy" || value === "duplicate_unchanged",
    ),
  );
  assert.equal((await readdir(join(root, "events"))).length, 1);
});

test("projection rebuild is deterministic and projection tampering is detected", async () => {
  const root = await freshRoot();
  const { candidate } = await fixture();
  const first = await record(root, "record_candidate", candidate);
  const event = JSON.parse(
    await readFile(
      join(root, "events", (await readdir(join(root, "events")))[0]!),
      "utf8",
    ),
  ) as { candidate_id: string };
  const projectionFile = join(
    root,
    "projections",
    "arca-workflows",
    `${event.candidate_id}.json`,
  );
  await writeFile(projectionFile, "{}\n");
  assert.equal(
    (await verifyDurableArcaStore(root)).outcome,
    "integrity_invalid",
  );
  const rebuilt = await executeDurableArcaStoreCommand(
    root,
    command(
      "rebuild_projection",
      null,
      event.candidate_id,
      "2026-07-22T16:00:00.000Z",
    ),
  );
  assert.equal(rebuilt.outcome, "projection_rebuilt");
  assert.equal((await verifyDurableArcaStore(root)).outcome, "store_verified");
  assert.ok(first.event_id);
});

test("projection publication failure never exposes a partial projection and cleans staging", async () => {
  const root = await freshRoot();
  const { candidate, review } = await fixture();
  await record(root, "record_candidate", candidate);
  const event = JSON.parse(
    await readFile(
      join(root, "events", (await readdir(join(root, "events")))[0]!),
      "utf8",
    ),
  ) as { candidate_id: string };
  const projectionFile = join(
    root,
    "projections",
    "arca-workflows",
    `${event.candidate_id}.json`,
  );
  await rm(projectionFile);
  await mkdir(projectionFile);
  const failed = await executeDurableArcaStoreCommand(
    root,
    command("record_review", review),
  );
  assert.equal(failed.success, false);
  assert.equal((await readdir(projectionFile)).length, 0);
  assert.equal(await assertNoDurableStoreStagingFiles(root), true);
});

test("store boundary imports no external authority modules and leaves staging clean", async () => {
  const source = await readFile(
    "src/store/durable-arca-review-store.ts",
    "utf8",
  );
  for (const forbidden of [
    "providers/",
    "openai",
    "supabase",
    "scheduler",
    "deployment",
    "export-contract",
    "vlatam-global",
    "arca-source-acquisition",
  ])
    assert.equal(source.includes(`from "../${forbidden}`), false, forbidden);
  const root = await freshRoot();
  const { candidate } = await fixture();
  await record(root, "record_candidate", candidate);
  assert.equal(await assertNoDurableStoreStagingFiles(root), true);
});
