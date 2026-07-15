/**
 * Architecture boundary for the sandbox activation human-review workflow.
 *
 * Pins the invariants of this layer:
 *  1. the review and gold-case modules are pure metadata evaluators — no
 *     transport, gateway, harness, authorization store, secret, environment,
 *     filesystem, or network access;
 *  2. no execution-path module imports the review workflow (the dependency
 *     direction is review → governed artifacts, never adapter → review);
 *  3. the governed artifacts contain no secrets, endpoints, or credentials;
 *  4. repository state keeps every execution component disabled: the review
 *     workflow cannot issue or consume authorization or enable runtime.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string): string =>
  readFileSync(resolve(root, path), "utf8");

const REVIEW_MODULES = [
  "src/providers/openrouter-sandbox-activation-review.ts",
  "src/providers/openrouter-sandbox-gold-case.ts",
] as const;

const EXECUTION_MODULES = [
  "src/providers/openrouter-adapter.ts",
  "src/providers/openrouter-authorized-gateway.ts",
  "src/providers/openrouter-sandbox-harness.ts",
  "src/providers/adapter-registry.ts",
  "src/execution/multi-provider-gateway.ts",
  "src/routing/policy-router.ts",
  "src/handoff/authorization-store.ts",
  "scripts/openrouter-sandbox-harness.ts",
] as const;

describe("sandbox activation review architecture boundary", () => {
  it("keeps the review modules pure: no transport, secret, env, fs, or store access", () => {
    for (const file of REVIEW_MODULES) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /openrouter-adapter|openrouter-authorized-gateway|openrouter-sandbox-harness|openrouter-sandbox-preflight|multi-provider-gateway|authorization-store|openrouter-secret-provider|budget-ledger/,
        file,
      );
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|process\.env|node:fs|node:http|node:net|createOpenRouterFetchTransport/,
        file,
      );
    }
  });

  it("keeps the dependency direction one-way: execution modules never import the review", () => {
    for (const file of EXECUTION_MODULES) {
      assert.doesNotMatch(
        read(file),
        /openrouter-sandbox-activation-review|openrouter-sandbox-gold-case/,
        file,
      );
    }
  });

  it("keeps the governed review artifacts free of secrets and endpoints", () => {
    for (const file of [
      "config/ai-openrouter-sandbox-activation-review.json",
      "config/ai-openrouter-sandbox-gold-case.json",
      "schemas/ai-openrouter-sandbox-activation-review.schema.json",
      "schemas/ai-openrouter-sandbox-gold-case.schema.json",
    ]) {
      const content = read(file);
      assert.doesNotMatch(content, /sk-or-|Bearer\s/, file);
      assert.doesNotMatch(content, /openrouter\.ai/, file);
    }
    // The governed config artifacts carry no URL at all; schema files may
    // reference only the JSON Schema meta-schema and local $id.
    for (const file of [
      "config/ai-openrouter-sandbox-activation-review.json",
      "config/ai-openrouter-sandbox-gold-case.json",
    ])
      assert.doesNotMatch(read(file), /https?:\/\//, file);
  });

  it("keeps repository state pending: no reviewer, approval, or ownership is invented", () => {
    const review = JSON.parse(
      read("config/ai-openrouter-sandbox-activation-review.json"),
    ) as {
      lifecycle: string;
      scope: string;
      decisions: Record<string, { status: string; reviewer_id: string | null }>;
      operational_ownership: Record<
        string,
        { status: string; identity: string | null }
      >;
      execution_authorized: boolean;
      secret_access_allowed: boolean;
      runtime_enabled: boolean;
      provider_call_performed: boolean;
    };
    assert.equal(review.lifecycle, "pending");
    assert.equal(review.scope, "one_synthetic_gold_case_sandbox_activation");
    for (const decision of Object.values(review.decisions)) {
      assert.equal(decision.status, "pending");
      assert.equal(decision.reviewer_id, null);
    }
    for (const owner of Object.values(review.operational_ownership)) {
      assert.equal(owner.status, "unassigned");
      assert.equal(owner.identity, null);
    }
    assert.equal(review.execution_authorized, false);
    assert.equal(review.secret_access_allowed, false);
    assert.equal(review.runtime_enabled, false);
    assert.equal(review.provider_call_performed, false);

    const goldCase = JSON.parse(
      read("config/ai-openrouter-sandbox-gold-case.json"),
    ) as {
      campaign_status: string;
      execution_results: unknown[];
      human_acceptance: { status: string; reviewer_id: string | null };
    };
    assert.equal(goldCase.campaign_status, "prepared_not_executed");
    assert.deepEqual(goldCase.execution_results, []);
    assert.equal(goldCase.human_acceptance.status, "pending");
    assert.equal(goldCase.human_acceptance.reviewer_id, null);
  });

  it("keeps every execution component disabled after adding the review workflow", () => {
    const adapter = JSON.parse(read("config/ai-openrouter-adapter.json")) as {
      enabled: boolean;
      retry_policy: { max_retries: number };
    };
    assert.equal(adapter.enabled, false);
    assert.equal(adapter.retry_policy.max_retries, 0);
    const runtime = JSON.parse(
      read("config/ai-openrouter-sandbox-runtime.json"),
    ) as {
      adapter: { enabled: boolean };
      budget_enabled: boolean;
      model_enabled: boolean;
      route_enabled: boolean;
      profile_enabled: boolean;
      kill_switch: { active: boolean };
    };
    assert.equal(runtime.adapter.enabled, false);
    assert.equal(runtime.budget_enabled, false);
    assert.equal(runtime.model_enabled, false);
    assert.equal(runtime.route_enabled, false);
    assert.equal(runtime.profile_enabled, false);
    assert.equal(runtime.kill_switch.active, true);
  });
});
