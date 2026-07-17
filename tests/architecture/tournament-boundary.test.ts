import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string): string => readFileSync(path, "utf8");

describe("AI-120 tournament architecture boundary", () => {
  it("contains no transport, secret, environment, or write-action capability", () => {
    const files = [
      "src/tournament/contracts.ts",
      "src/tournament/lifecycle.ts",
      "src/tournament/validation.ts",
      "src/tournament/operator-read-model.ts",
    ];
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /\bfetch\s*\(|process\.env|authorization-store|secret-provider|openrouter-adapter|multi-provider-gateway|node:(?:http|net|fs)/,
        file,
      );
    }
  });

  it("keeps every registered runtime disabled and kill-switched", () => {
    for (const file of [
      "config/ai-tournament-runtime-native.json",
      "config/ai-tournament-runtime-eve.json",
      "config/ai-tournament-runtime-cloudflare.json",
    ]) {
      const candidate = JSON.parse(read(file)) as {
        enabled: boolean;
        kill_switch: { active: boolean };
        approval_state: string;
      };
      assert.equal(candidate.enabled, false, file);
      assert.equal(candidate.kill_switch.active, true, file);
      assert.notEqual(candidate.approval_state, "approved", file);
    }
  });
});
