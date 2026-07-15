import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  handleOperatorConsoleRequest,
  type OperatorConsoleOptions,
} from "../../src/operator/operator-console-handler.js";
import {
  OPERATOR_CONSOLE_PATHS,
  renderOperatorConsole,
} from "../../src/operator/operator-console.js";
import type { OperatorReadModel } from "../../src/operator/operator-read-model.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = () =>
  loadRepositoryOperatorReadModel({
    repository_root: root,
    evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
  });

function response(): {
  res: ServerResponse;
  result: () => {
    status: number;
    body: string;
    headers: Record<string, string>;
  };
} {
  let status = 0;
  let body = "";
  let headers: Record<string, string> = {};
  const res = {
    writeHead: (nextStatus: number, nextHeaders?: Record<string, string>) => {
      status = nextStatus;
      headers = nextHeaders ?? {};
    },
    end: (chunk?: string) => {
      body += chunk ?? "";
    },
  } as unknown as ServerResponse;
  return { res, result: () => ({ status, body, headers }) };
}

async function request(
  path: string,
  method = "GET",
  options?: Partial<OperatorConsoleOptions>,
) {
  const capture = response();
  const handled = await handleOperatorConsoleRequest(
    { method, url: path } as IncomingMessage,
    capture.res,
    { repository_root: root, ...options },
  );
  return { handled, ...capture.result() };
}

describe("read-only AI LAB Operator Console", () => {
  it("renders every console route from the valid blocked read model", async () => {
    for (const path of OPERATOR_CONSOLE_PATHS) {
      const result = await request(path);
      assert.equal(result.handled, true);
      assert.equal(result.status, 200, path);
      assert.match(result.headers["Cache-Control"] ?? "", /no-store/);
      assert.match(result.body, /<main id="main">/);
      assert.match(result.body, /aria-label="Operator console"/);
      assert.match(result.body, /focus-visible/);
      assert.doesNotMatch(result.body, /<form\b/i);
    }
  });

  it("renders the exact repository OpenRouter blocked state", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/providers/openrouter");
    assert.equal(model.blockers.length, 23);
    assert.equal(model.required_human_actions.length, 6);
    for (const expected of [
      "minimax/minimax-m2.7",
      "Execution allowed: false",
      "blocked",
      "disabled",
      "active",
      "not configured",
      "absent",
      "not attempted",
      model.models[0]!.hash,
      model.routes[0]!.hash,
      model.execution_profiles[0]!.hash!,
    ])
      assert.match(html, new RegExp(expected.replaceAll("/", "\\/"), "i"));
  });

  it("preserves blocker and action order without recalculation", async () => {
    const model = await load();
    const blockerHtml = renderOperatorConsole(
      model,
      "/operator/blockers",
    ).split("<tbody>")[1]!;
    const actionHtml = renderOperatorConsole(model, "/operator/actions");
    let position = -1;
    for (const blocker of model.blockers) {
      const next = blockerHtml.indexOf(blocker.blocker_code);
      assert.ok(next > position);
      position = next;
    }
    const renderedActions = [
      ...actionHtml.matchAll(/<dt>Action code<\/dt><dd><code>([^<]+)<\/code>/g),
    ].map((match) => match[1]);
    assert.deepEqual(
      renderedActions,
      model.required_human_actions.map((action) => action.action_code),
    );
  });

  it("renders only audit-safe metadata and no mutation or execution controls", async () => {
    const model = await load();
    const all = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    for (const forbidden of [
      /<form\b/i,
      /type=["'](?:submit|password)["']/i,
      /authorization_token/i,
      /raw_document/i,
      /raw_model_output/i,
      /prompt_payload/i,
      /Bearer\s/i,
      /sk-or-/i,
      />\s*(?:Run|Execute|Enable|Approve|Retry)\s*</i,
    ])
      assert.doesNotMatch(all, forbidden);
  });

  it("fails closed with a safe page for invalid state or loader failure", async () => {
    const valid = await load();
    const invalid = structuredClone(valid) as OperatorReadModel;
    (invalid.system_summary as { overall_status: string }).overall_status =
      "invalid_state";
    for (const loader of [
      async () => invalid,
      async () => {
        throw new Error(root);
      },
    ]) {
      const result = await request("/operator", "GET", {
        load_read_model: loader,
      });
      assert.equal(result.status, 500);
      assert.match(result.body, /Invalid repository state/);
      assert.doesNotMatch(result.body, new RegExp(root));
      assert.doesNotMatch(result.body, /Error:/);
    }
  });

  it("exposes GET-only routes and leaves no provider execution endpoint", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await request("/operator", method)).status, 405);
    }
    assert.equal((await request("/operator/execute")).status, 404);
  });

  it("keeps the presentation dependency limited to the read-model contract", () => {
    const presentation = readFileSync(
      resolve(root, "src/operator/operator-console.ts"),
      "utf8",
    );
    assert.match(presentation, /operator-read-model\.js/);
    const imports = presentation
      .split("\n")
      .filter((line) => line.startsWith("import "))
      .join("\n");
    assert.doesNotMatch(
      imports,
      /providers\/|gateway|harness|authorization-store|process\.env/,
    );
    const domainFiles = [
      "src/providers/openrouter-adapter.ts",
      "src/execution/multi-provider-gateway.ts",
    ];
    for (const file of domainFiles)
      assert.doesNotMatch(
        readFileSync(resolve(root, file), "utf8"),
        /operator-console/,
      );
  });
});
