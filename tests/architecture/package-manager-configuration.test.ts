import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

interface PackageConfiguration {
  readonly packageManager?: string;
}

const packageConfiguration = JSON.parse(
  readFileSync("package.json", "utf8"),
) as PackageConfiguration;
const workspaceConfiguration = readFileSync("pnpm-workspace.yaml", "utf8");

const ignoredDirectories = new Set([
  ".git",
  "dist",
  "graphify-out",
  "node_modules",
]);

function findPackageManifests(directory = "."): readonly string[] {
  const manifests: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      manifests.push(...findPackageManifests(join(directory, entry.name)));
    } else if (entry.isFile() && entry.name === "package.json") {
      manifests.push(relative(".", join(directory, entry.name)));
    }
  }
  return manifests.sort();
}

describe("repository package-manager configuration", () => {
  it("pins the validated pnpm version", () => {
    assert.equal(packageConfiguration.packageManager, "pnpm@10.28.0");
  });

  it("declares the repository root as the sole workspace package", () => {
    assert.deepEqual(findPackageManifests(), ["package.json"]);
    assert.match(workspaceConfiguration, /^packages:\n {2}- ["']\.["']$/m);
  });
});
