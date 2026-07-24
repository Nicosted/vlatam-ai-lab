import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("operator read-model architecture boundary", () => {
  it("keeps the pure builder transport, UI, filesystem, environment, and execution free", () => {
    const builder = read("src/operator/operator-read-model.ts");
    assert.doesNotMatch(
      builder,
      /from\s+["'][^"']*(?:node:fs|openrouter-adapter|authorized-gateway|sandbox-harness|server\/|frontend|transport)[^"']*["']|process\.env|\bfetch\s*\(/,
    );
    assert.match(builder, /canonicalizeOpenRouterRegistryJson/);
  });

  it("limits repository loading to filesystem and evaluator dependencies", () => {
    const loader = read("src/operator/repository-operator-read-model.ts");
    assert.match(loader, /node:fs/);
    assert.doesNotMatch(
      loader,
      /from\s+["'][^"']*(?:openrouter-adapter|authorized-gateway|sandbox-harness|secret-provider|multi-provider-gateway)[^"']*["']|process\.env|\bfetch\s*\(/,
    );
    for (const evaluator of [
      "evaluateOpenRouterReadinessDossier",
      "evaluateOpenRouterExternalEvidencePack",
      "evaluateOpenRouterSandboxEnablementProposal",
      "projectOpenRouterSandboxPreflight",
      "validateOpenRouterRegistry",
    ])
      assert.match(loader, new RegExp(evaluator));
    assert.doesNotMatch(loader, /evaluateOpenRouterSandboxPreflight/);
  });

  it("keeps the ARCA console projection presentation-only", () => {
    const source = [
      read("src/operator/arca-review-console-view-model.ts"),
      read("src/operator/operator-console.ts"),
    ].join("\n");
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*(?:provider|transport|secret|scheduler|database|deployment|publisher|export|vlatam-global|approved-arca-artifact-builder)[^"']*["']/i,
    );
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|process\.env|buildApprovedArca|evaluateGovernedArcaCandidateReview/,
    );
  });

  it("introduces no reverse dependency or circular import", () => {
    for (const path of [
      "src/providers/openrouter-adapter.ts",
      "src/providers/openrouter-authorized-gateway.ts",
      "src/providers/openrouter-resolution-authorization.ts",
      "src/providers/openrouter-sandbox-preflight.ts",
      "src/execution/multi-provider-gateway.ts",
    ])
      assert.doesNotMatch(
        read(path),
        /operator-read-model|repository-operator-read-model/,
        path,
      );
  });
});
