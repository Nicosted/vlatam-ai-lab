import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import {
  AUTHORIZATION_STORE_DDL_HASH,
  ReviewedRoutingDecisionHandoff,
  SqliteAuthorizationStateStore,
  handoffPolicyHash,
  type AuthorizationConsumptionBinding,
  type HandoffAuthorizationPolicy,
} from "../src/handoff/index.js";
import { normalizeAndHash } from "../src/evaluation/index.js";

const [command, databasePath, argument] = process.argv.slice(2);
const fixture = (
  patch: Partial<AuthorizationConsumptionBinding> = {},
): AuthorizationConsumptionBinding => ({
  authorization_id: "authorization.fixture",
  handoff_policy_id: "handoff.reviewed-routing",
  handoff_policy_version: "1.0.0",
  handoff_policy_hash: "a".repeat(64),
  decision_hash: "b".repeat(64),
  authorization_mode: "single_use",
  execution_correlation_id: "execution.fixture",
  audit_correlation_id: "audit.fixture",
  consumed_at: "2026-07-12T12:00:00.000Z",
  ...patch,
});
const handoffFixture = () => {
  const policy: HandoffAuthorizationPolicy = {
    schema_version: "1.0.0",
    policy_id: "handoff.reviewed-routing",
    policy_version: "1.0.0",
    allowed_authorizer_roles: ["ai-governance-authorizer"],
    allowed_routing_policies: [
      { id: "routing.best-profile", version: "1.0.0" },
    ],
    allowed_profile_lifecycle_states: ["candidate"],
    allowed_data_classifications: ["public"],
    allowed_budget_classes: ["development"],
    maximum_authorization_age_seconds: 3600,
    enforce_decision_ttl: true,
    authorization_mode: "single_use",
  };
  const base = {
    schema_version: "1.0.0",
    status: "selected",
    capability_id: "evidence.extraction.normative_claims",
    policy: {
      policy_id: "routing.best-profile",
      policy_version: "1.0.0",
      policy_hash: "a".repeat(64),
    },
    decision_reason: "REVIEWED_WINNER_ELIGIBLE",
    execution_correlation_id: "execution.fixture",
    audit_correlation_id: "audit.fixture",
    created_at: "2026-07-12T11:30:00.000Z",
    expiry_at: "2026-07-12T12:30:00.000Z",
    selected_profile_id: "profile.reviewed",
    selected_profile_version: "1.1.0",
    canonical_profile_key: "profile.reviewed@1.1.0",
    benchmark_evidence: {
      schema_version: "1.0.0",
      campaign_id: "campaign.reviewed",
      campaign_version: "1.0.0",
      campaign_execution_id: "campaign.execution",
      campaign_hash: "b".repeat(64),
      suite_id: "suite.reviewed",
      suite_version: "1.0.0",
      suite_hash: "c".repeat(64),
      ranking_policy_id: "ranking.default",
      ranking_policy_version: "1.0.0",
      selected_profile_id: "profile.reviewed",
      selected_profile_version: "1.1.0",
      profile_hash: "d".repeat(64),
      ranking_position: 1,
      evidence_created_at: "2026-07-12T11:00:00.000Z",
      supersession_status: "current",
    },
    review_attestation: {
      attestation_id: "review.attestation",
      reviewer_role: "ai-governance-reviewer",
      decision: "approved",
      reviewed_at: "2026-07-12T11:15:00.000Z",
    },
  };
  const decision = { ...base, decision_hash: normalizeAndHash(base).hash };
  return {
    policy,
    request: {
      schema_version: "1.0.0",
      handoff_id: "handoff.fixture",
      decision,
      capability_request: {
        schema_version: "1.0.0",
        request_id: "request.fixture",
        capability_id: "evidence.extraction.normative_claims",
        input: {},
        context: { data_classification: "public" },
      },
      budget_class: "development",
      execution_correlation_id: "execution.fixture",
      audit_correlation_id: "audit.fixture",
      authorization: {
        schema_version: "1.0.0",
        authorization_id: "authorization.fixture",
        authorizer_role: "ai-governance-authorizer",
        authorization_decision: "approved",
        authorized_at: "2026-07-12T11:45:00.000Z",
        review_attestation_reference: "review.attestation",
        handoff_policy_id: policy.policy_id,
        handoff_policy_version: policy.policy_version,
        handoff_policy_hash: handoffPolicyHash(policy),
        decision_hash: decision.decision_hash,
        routing_policy_id: "routing.best-profile",
        routing_policy_version: "1.0.0",
        capability_id: "evidence.extraction.normative_claims",
        selected_profile_id: "profile.reviewed",
        selected_profile_version: "1.1.0",
        canonical_profile_key: "profile.reviewed@1.1.0",
        benchmark_evidence_reference: "campaign.execution",
        decision_created_at: decision.created_at,
        decision_expiry_at: decision.expiry_at,
        execution_correlation_id: "execution.fixture",
        audit_correlation_id: "audit.fixture",
      },
    },
  };
};
const output = (value: unknown, expected = true) => {
  console.log(JSON.stringify(value));
  if (!expected) process.exitCode = 1;
};
const waitFor = async (predicate: () => boolean, timeoutMs = 5000) => {
  const end = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= end) throw new Error("fixture barrier timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

if (command === "internal-worker") {
  const id = argument ?? "missing";
  const ready = `${databasePath}.${id}.ready`,
    barrier = `${databasePath}.barrier`,
    result = `${databasePath}.${id}.result`;
  writeFileSync(ready, "ready", { flag: "wx" });
  await waitFor(() => existsSync(barrier));
  const workerStore = new SqliteAuthorizationStateStore({
    databasePath: databasePath!,
    busyTimeoutMs: 1000,
  });
  let consumed: string;
  if (process.env.AI80_HANDOFF_FIXTURE === "1") {
    const { policy, request } = handoffFixture();
    const handoff = new ReviewedRoutingDecisionHandoff({
      policy,
      clock: () => new Date("2026-07-12T12:00:00.000Z"),
      authorizationStore: workerStore,
      profileResolver: () =>
        ({
          profile_id: "profile.reviewed",
          capability_id: "evidence.extraction.normative_claims",
          provider_id: "replay",
          model_id: "fixture",
          mode: "replay",
          lifecycle_status: "candidate",
          enabled: true,
          contract_version: "1.1.0",
          configuration: { timeout_ms: 10, response_format: "json" },
          eligibility: {
            privacy_compatibility: "declared_not_enforced",
            budget_class: "development",
            evaluation_status: "fixture_verified",
          },
          privacy: {
            max_data_classification: "public",
            external_processing: false,
            retention: "none",
            training_use: "forbidden",
            zdr_status: "not_applicable",
          },
          fixture_id: "safe",
        }) as never,
      gateway: {
        execute: async () => {
          appendFileSync(
            `${databasePath}.gateway-invocations`,
            "gateway-invoked\n",
          );
          return {
            result: { status: "succeeded" },
            audit: { execution_id: "gateway.fixture" },
          } as never;
        },
      },
    });
    const result = await handoff.execute(request as never);
    consumed =
      result.execution_status === "succeeded"
        ? "consumed"
        : result.rejection_reason === "AUTHORIZATION_ALREADY_CONSUMED"
          ? "already_consumed"
          : "store_error";
  } else consumed = workerStore.consume(fixture());
  writeFileSync(result, JSON.stringify({ id, consumed }), { flag: "wx" });
  workerStore.close();
} else {
  if (!databasePath)
    throw new Error("an explicit fresh database path is required");
  const store = new SqliteAuthorizationStateStore({
    databasePath,
    createParentDirectory: command === "init",
  });
  try {
    if (command === "init") {
      store.initialize();
      const result = store.validateSchema();
      output(result, result.valid);
    } else if (command === "validate") {
      const result = store.validateSchema();
      output(result, result.valid);
    } else if (command === "inspect") {
      const result = store.inspect(argument ?? "");
      output(result, result.status === "ok");
    } else if (command === "list") {
      const result = store.listRecent(Number(argument ?? 20));
      output(result, result.status === "ok");
    } else if (
      command === "sequential-replay-fixture" ||
      command === "multi-instance-fixture" ||
      command === "multi-instance-sequential-fixture" ||
      command === "restart-fixture" ||
      command === "binding-conflict-fixture"
    ) {
      store.initialize();
      const first = store.consume(fixture());
      store.close();
      const second = new SqliteAuthorizationStateStore({ databasePath });
      const subsequent = second.consume(
        fixture(
          command === "binding-conflict-fixture"
            ? { decision_hash: "c".repeat(64) }
            : {},
        ),
      );
      const listed = second.listRecent();
      second.close();
      const expected =
        command === "binding-conflict-fixture"
          ? "binding_conflict"
          : "already_consumed";
      output(
        { fixture: command, first, subsequent, listed },
        first === "consumed" &&
          subsequent === expected &&
          listed.status === "ok" &&
          listed.records.length === 1,
      );
    } else if (
      command === "concurrency-fixture" ||
      command === "handoff-concurrency-fixture"
    ) {
      store.initialize();
      store.close();
      const ids = ["worker-1", "worker-2"];
      const children = ids.map((id) =>
        spawn(
          process.execPath,
          [
            "--import",
            "tsx",
            process.argv[1]!,
            "internal-worker",
            databasePath,
            id,
          ],
          {
            env: {
              ...process.env,
              ...(command === "handoff-concurrency-fixture"
                ? { AI80_HANDOFF_FIXTURE: "1" }
                : {}),
            },
            stdio: "ignore",
          },
        ),
      );
      await waitFor(() =>
        ids.every((id) => existsSync(`${databasePath}.${id}.ready`)),
      );
      writeFileSync(`${databasePath}.barrier`, "go", { flag: "wx" });
      await Promise.all(
        children.map(
          (child) =>
            new Promise<void>((resolve, reject) =>
              child.once("exit", (code) =>
                code === 0
                  ? resolve()
                  : reject(new Error(`worker exited ${code}`)),
              ),
            ),
        ),
      );
      const results = ids.map(
        (id) =>
          JSON.parse(readFileSync(`${databasePath}.${id}.result`, "utf8")) as {
            id: string;
            consumed: string;
          },
      );
      const verify = new SqliteAuthorizationStateStore({ databasePath });
      const listed = verify.listRecent();
      verify.close();
      const invocations = existsSync(`${databasePath}.gateway-invocations`)
        ? readFileSync(`${databasePath}.gateway-invocations`, "utf8")
            .trim()
            .split("\n").length
        : 0;
      const valid =
        results.filter(({ consumed }) => consumed === "consumed").length ===
          1 &&
        results.filter(({ consumed }) => consumed === "already_consumed")
          .length === 1 &&
        listed.status === "ok" &&
        listed.records.length === 1 &&
        (command !== "handoff-concurrency-fixture" || invocations === 1);
      output(
        { fixture: command, results, listed, gateway_invocations: invocations },
        valid,
      );
    } else if (command === "invalid-binding-fixture") {
      const result = store.consume(fixture({ decision_hash: "invalid" }));
      output(
        {
          fixture: command,
          result,
          database_created: existsSync(databasePath),
        },
        result === "invalid_binding" && !existsSync(databasePath),
      );
    } else if (command === "schema-corruption-fixture") {
      store.initialize();
      store.close();
      const db = new DatabaseSync(databasePath);
      db.prepare("UPDATE authorization_store_schema SET ddl_hash = ?").run(
        "0".repeat(64),
      );
      db.close();
      const corrupt = new SqliteAuthorizationStateStore({ databasePath });
      const result = corrupt.consume(fixture());
      corrupt.close();
      output(
        {
          fixture: command,
          result,
          expected_ddl_hash: AUTHORIZATION_STORE_DDL_HASH,
        },
        result === "store_error",
      );
    } else if (command === "locked-store-fixture") {
      store.initialize();
      const lock = new DatabaseSync(databasePath);
      lock.exec("BEGIN EXCLUSIVE");
      const result = store.consume(fixture());
      lock.exec("ROLLBACK");
      lock.close();
      store.close();
      output({ fixture: command, result }, result === "store_unavailable");
    } else if (command === "unavailable-fixture") {
      const result = store.consume(fixture());
      output({ fixture: command, result }, result === "store_unavailable");
    } else if (command === "metadata-inspection-fixture") {
      store.initialize();
      const consumed = store.consume(fixture());
      const inspected = store.inspect("authorization.fixture");
      const listed = store.listRecent();
      output(
        { fixture: command, consumed, inspected, listed },
        consumed === "consumed" &&
          inspected.status === "ok" &&
          listed.status === "ok",
      );
    } else {
      throw new Error("unknown authorization-store command");
    }
  } finally {
    store.close();
  }
}
