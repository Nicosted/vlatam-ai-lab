import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";
import {
  evaluateGlmGovernanceArtifacts,
  projectGlmFirstRunReadiness,
} from "../../src/providers/openrouter-supervised-pilot-projection.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = () =>
  loadRepositoryOperatorReadModel({
    repository_root: root,
    evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
  });

// GLM metadata evidence is observed at 2026-07-17T12:00:00.000Z with a 30-day
// lifetime, so it is still valid at exactly the boundary and expired 1ms later.
const LAST_VALID_INSTANT = "2026-08-16T12:00:00.000Z";
const FIRST_EXPIRED_INSTANT = "2026-08-16T12:00:00.001Z";
const EXPIRED = "metadata_evidence_expired";

async function loadWithWallClock(now: string) {
  mock.timers.enable({ apis: ["Date"], now: new Date(now) });
  try {
    return await load();
  } finally {
    mock.timers.reset();
  }
}

describe("Operator read model evaluation clock", () => {
  it("keeps GLM metadata evidence valid at the explicit 30-day boundary", () => {
    const governance = evaluateGlmGovernanceArtifacts(
      new Date(LAST_VALID_INSTANT),
    );
    const readiness = projectGlmFirstRunReadiness(new Date(LAST_VALID_INSTANT));
    assert.equal(governance.outcome, "blocked");
    assert.ok(!governance.blockers.includes(EXPIRED));
    assert.ok(!readiness.reasons.includes(EXPIRED));
  });

  it("expires GLM metadata evidence only when evaluated after the boundary", () => {
    const before = evaluateGlmGovernanceArtifacts(new Date(LAST_VALID_INSTANT));
    const after = evaluateGlmGovernanceArtifacts(
      new Date(FIRST_EXPIRED_INSTANT),
    );
    assert.deepEqual(after.blockers, [...before.blockers, EXPIRED].sort());
    assert.ok(
      projectGlmFirstRunReadiness(
        new Date(FIRST_EXPIRED_INSTANT),
      ).reasons.includes(EXPIRED),
    );
  });

  it("produces the same read model for a fixed evaluated_at regardless of wall clock", async () => {
    const atEvaluation = await loadWithWallClock(
      REPOSITORY_OPERATOR_EVALUATED_AT,
    );
    const afterExpiry = await loadWithWallClock(FIRST_EXPIRED_INSTANT);
    const farFuture = await loadWithWallClock("2030-01-01T00:00:00.000Z");
    assert.deepEqual(afterExpiry, atEvaluation);
    assert.deepEqual(farFuture, atEvaluation);
    assert.equal(farFuture.blockers.length, 46);
    assert.ok(
      !farFuture.blockers.some(
        (blocker) => blocker.blocker_code === `glm_governance:${EXPIRED}`,
      ),
    );
  });
});
