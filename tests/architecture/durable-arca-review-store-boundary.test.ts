import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI-130 durable store remains local and authority-free", async () => {
  const sources = await Promise.all([
    readFile("src/store/durable-arca-review-store.ts", "utf8"),
    readFile("src/cli/durable-arca-review-store.ts", "utf8"),
  ]);
  const source = sources.join("\n");
  const forbiddenImports = [
    /from ["'][^"']*providers\//,
    /from ["'][^"']*acquisition\//,
    /from ["'][^"']*crawlers\//,
    /from ["'][^"']*scheduler/,
    /from ["'][^"']*deployment/,
    /from ["'][^"']*export/,
    /from ["'][^"']*publisher/,
    /from ["'][^"']*vlatam-global/,
    /from ["'](?:openai|@supabase|pg|postgres|redis|sqlite)/,
  ];
  for (const pattern of forbiddenImports) assert.doesNotMatch(source, pattern);
  for (const authority of [
    "export_authorized",
    "publication_authorized",
    "production_authorized",
    "network_authorized",
    "database_authorized",
    "scheduler_authorized",
    "deployment_authorized",
    "vlatam_global_access_authorized",
  ]) {
    assert.match(source, new RegExp(`${authority}: false`));
  }
});
