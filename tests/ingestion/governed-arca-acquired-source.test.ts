import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import test from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { acquireSource } from "../../src/acquisition/governed-source-acquisition.js";
import { parseArguments } from "../../src/cli/arca-acquired-source-ingestion.js";
import {
  GOVERNED_ARCA_ACQUIRED_SOURCE_INPUT_SCHEMA,
  GOVERNED_ARCA_CANDIDATE_SCHEMA,
  GovernedArcaIngestionError,
  ingestGovernedArcaAcquiredSource,
  type GovernedArcaAcquiredSourceInput,
} from "../../src/ingestion/governed-arca-acquired-source.js";
import {
  ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
  ARCA_NOMENCLADOR_PARSER_ID,
  ARCA_NOMENCLADOR_PARSER_VERSION,
} from "../../src/parsers/arca-nomenclador.js";

const CAPTURED_AT = "2026-07-22T12:00:00.000Z";
const PARSING_TIMESTAMP = "2026-07-22T12:05:00.000Z";
const SOURCE_URL =
  "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt";
const VALID_CONTENT = "2@4202.92.00@10.00@20.00@3.00@@@@UN@@BOLSOS DE VIAJE\n";

interface PreparedFixture {
  root: string;
  acquisitionRoot: string;
  candidateRoot: string;
  metadataPath: string;
  rawPath: string;
  input: GovernedArcaAcquiredSourceInput;
}

function hash(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function prepareFixture(
  content = VALID_CONTENT,
): Promise<PreparedFixture> {
  const root = await mkdtemp(join(await realpath(tmpdir()), "vlatam-ai-126-"));
  const replayPath = join(root, "fixture.txt");
  const acquisitionRoot = join(root, "acquisitions");
  const candidateRoot = join(root, "candidates");
  await writeFile(replayPath, content, "latin1");
  const record = await acquireSource({
    sourceId: "ar-arca-arancel-integrado",
    sourceUrl: SOURCE_URL,
    outputDirectory: acquisitionRoot,
    mode: "replay",
    replayPath,
    capturedAt: new Date(CAPTURED_AT),
  });
  const metadataBytes = new Uint8Array(await readFile(record.metadata_path));
  return {
    root,
    acquisitionRoot,
    candidateRoot,
    metadataPath: record.metadata_path,
    rawPath: record.raw_path,
    input: {
      schema_version: "1.0.0",
      acquisition: {
        acquisition_id: record.acquisition_id,
        acquisition_record_sha256: hash(metadataBytes),
        source_id: record.source_id,
        requested_url: record.requested_url,
        effective_url: record.effective_url,
        captured_at: record.captured_at,
        media_type: record.content_type,
        raw_sha256: record.sha256,
      },
      parser: {
        parser_id: ARCA_NOMENCLADOR_PARSER_ID,
        parser_version: ARCA_NOMENCLADOR_PARSER_VERSION,
        configuration_sha256: ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
      },
      parsing_timestamp: PARSING_TIMESTAMP,
    },
  };
}

async function cleanup(fixture: PreparedFixture): Promise<void> {
  await rm(fixture.root, { recursive: true, force: true });
}

async function candidateFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true });
    return entries.filter(
      (entry) =>
        entry.endsWith(".json") ||
        entry.split(sep).some((part) => part.startsWith(".staging-")),
    );
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return [];
    }
    throw error;
  }
}

async function expectFailure(
  fixture: PreparedFixture,
  code: GovernedArcaIngestionError["code"],
  input: unknown = fixture.input,
  options: Partial<{
    acquisitionRoot: string;
    candidateRoot: string;
  }> = {},
): Promise<void> {
  const candidateRoot = options.candidateRoot ?? fixture.candidateRoot;
  await assert.rejects(
    ingestGovernedArcaAcquiredSource(input, {
      acquisitionRoot: options.acquisitionRoot ?? fixture.acquisitionRoot,
      candidateRoot,
    }),
    (error: unknown) =>
      error instanceof GovernedArcaIngestionError && error.code === code,
  );
  assert.deepEqual(await candidateFiles(candidateRoot), []);
}

test("ingests only the integrity-bound replay acquisition into a deterministic review candidate", async () => {
  const fixture = await prepareFixture();
  try {
    const first = await ingestGovernedArcaAcquiredSource(fixture.input, {
      acquisitionRoot: fixture.acquisitionRoot,
      candidateRoot: fixture.candidateRoot,
    });
    const stored = JSON.parse(await readFile(first.candidatePath, "utf8")) as {
      parsed_output_sha256: string;
    };

    assert.deepEqual(stored, first.candidate);
    assert.equal(
      first.candidate.artifact_type,
      "arca_acquired_source_parse_candidate",
    );
    assert.equal(first.candidate.validation_status, "valid");
    assert.equal(first.candidate.review_state, "human_review_required");
    assert.equal(first.candidate.approval_status, "not_approved");
    assert.equal(first.candidate.publication_status, "not_publishable");
    assert.equal(first.candidate.parsing_timestamp, PARSING_TIMESTAMP);
    assert.equal(first.candidate.parsed_output.tariff_lines_count, 1);
    assert.equal(
      first.candidate.parsed_output.tariff_lines[0]?.source_url,
      SOURCE_URL,
    );
    assert.equal(
      stored.parsed_output_sha256,
      hash(JSON.stringify(first.candidate.parsed_output)),
    );
  } finally {
    await cleanup(fixture);
  }
});

test("rejects invalid closed contracts and traversal identities before file access", async () => {
  const fixture = await prepareFixture();
  try {
    await expectFailure(fixture, "INVALID_CONTRACT", {
      ...fixture.input,
      arbitrary_path: fixture.rawPath,
    });
    const traversal = structuredClone(fixture.input);
    traversal.acquisition.acquisition_id = "../../raw.txt";
    await expectFailure(fixture, "INVALID_CONTRACT", traversal);
  } finally {
    await cleanup(fixture);
  }
});

test("rejects unsupported parser identity and configuration", async () => {
  const fixture = await prepareFixture();
  try {
    const input = structuredClone(fixture.input);
    input.parser.parser_id = "competing-parser";
    await expectFailure(fixture, "UNSUPPORTED_PARSER", input);
  } finally {
    await cleanup(fixture);
  }
});

test("rejects acquisition-record mutation before reading raw bytes", async () => {
  const fixture = await prepareFixture();
  try {
    const rawBefore = await readFile(fixture.rawPath);
    const metadata = JSON.parse(
      await readFile(fixture.metadataPath, "utf8"),
    ) as {
      requested_url: string;
    };
    metadata.requested_url = "https://www.arca.gob.ar/mutated";
    await writeFile(
      fixture.metadataPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    await expectFailure(fixture, "ACQUISITION_HASH_MISMATCH");
    assert.deepEqual(await readFile(fixture.rawPath), rawBefore);
  } finally {
    await cleanup(fixture);
  }
});

test("rejects post-acquisition raw-byte replacement without a candidate side effect", async () => {
  const fixture = await prepareFixture();
  try {
    await writeFile(
      fixture.rawPath,
      `${VALID_CONTENT}2@8452.10.00@0@0@0@@@@UN@OTRA\n`,
    );
    await expectFailure(fixture, "RAW_HASH_MISMATCH");
  } finally {
    await cleanup(fixture);
  }
});

test("rejects missing raw bytes and raw symlink substitution", async () => {
  const missing = await prepareFixture();
  try {
    await unlink(missing.rawPath);
    await expectFailure(missing, "MISSING_ACQUISITION");
  } finally {
    await cleanup(missing);
  }

  const linked = await prepareFixture();
  try {
    const replacement = join(linked.root, "replacement.txt");
    await writeFile(replacement, VALID_CONTENT);
    await unlink(linked.rawPath);
    await symlink(replacement, linked.rawPath);
    await expectFailure(linked, "SYMLINK_REJECTED");
  } finally {
    await cleanup(linked);
  }
});

test("rejects acquisition roots with ancestor or final symlink components", async () => {
  const fixture = await prepareFixture();
  try {
    const linkedParent = join(fixture.root, "linked-acquisition-parent");
    await symlink(fixture.root, linkedParent, "dir");
    await expectFailure(fixture, "SYMLINK_REJECTED", fixture.input, {
      acquisitionRoot: join(linkedParent, "acquisitions"),
    });

    const linkedRoot = join(fixture.root, "linked-acquisition-root");
    await symlink(fixture.acquisitionRoot, linkedRoot, "dir");
    await expectFailure(fixture, "SYMLINK_REJECTED", fixture.input, {
      acquisitionRoot: linkedRoot,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("rejects a missing configured acquisition root", async () => {
  const fixture = await prepareFixture();
  try {
    await expectFailure(fixture, "MISSING_ACQUISITION", fixture.input, {
      acquisitionRoot: join(fixture.root, "missing-acquisition-root"),
    });
  } finally {
    await cleanup(fixture);
  }
});

test("rejects candidate roots with ancestor or final symlink components", async () => {
  const fixture = await prepareFixture();
  try {
    const realParent = join(fixture.root, "real-candidate-parent");
    await mkdir(realParent);
    const linkedParent = join(fixture.root, "linked-candidate-parent");
    await symlink(realParent, linkedParent, "dir");
    const candidateThroughAncestor = join(linkedParent, "candidates");
    await expectFailure(fixture, "SYMLINK_REJECTED", fixture.input, {
      candidateRoot: candidateThroughAncestor,
    });
    await assert.rejects(access(join(realParent, "candidates")), {
      code: "ENOENT",
    });

    const realRoot = join(fixture.root, "real-candidate-root");
    await mkdir(realRoot);
    const linkedRoot = join(fixture.root, "linked-candidate-root");
    await symlink(realRoot, linkedRoot, "dir");
    await expectFailure(fixture, "SYMLINK_REJECTED", fixture.input, {
      candidateRoot: linkedRoot,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("rejects configured acquisition and candidate roots that are regular files", async () => {
  const fixture = await prepareFixture();
  try {
    const acquisitionFile = join(fixture.root, "acquisition-root-file");
    await writeFile(acquisitionFile, "not a directory");
    await expectFailure(fixture, "PATH_NOT_GOVERNED", fixture.input, {
      acquisitionRoot: acquisitionFile,
    });

    const candidateFile = join(fixture.root, "candidate-root-file");
    await writeFile(candidateFile, "preserve me");
    await expectFailure(fixture, "PATH_NOT_GOVERNED", fixture.input, {
      candidateRoot: candidateFile,
    });
    assert.equal(await readFile(candidateFile, "utf8"), "preserve me");
  } finally {
    await cleanup(fixture);
  }
});

test("rejects inconsistent provenance bindings even when the record hash is updated", async () => {
  const fixture = await prepareFixture();
  try {
    const metadataBytes = await readFile(fixture.metadataPath);
    const input = structuredClone(fixture.input);
    input.acquisition.effective_url =
      "https://www.afip.gob.ar/aduana/arancelintegrado/nomenclador.txt";
    input.acquisition.acquisition_record_sha256 = hash(metadataBytes);
    await expectFailure(fixture, "INVALID_PROVENANCE", input);
  } finally {
    await cleanup(fixture);
  }
});

test("rejects acquisition-record path escape even with a matching record hash", async () => {
  const fixture = await prepareFixture();
  try {
    const metadata = JSON.parse(
      await readFile(fixture.metadataPath, "utf8"),
    ) as {
      raw_path: string;
    };
    metadata.raw_path = join(fixture.root, "outside.txt");
    await writeFile(
      fixture.metadataPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const input = structuredClone(fixture.input);
    input.acquisition.acquisition_record_sha256 = hash(
      await readFile(fixture.metadataPath),
    );
    await expectFailure(fixture, "PATH_NOT_GOVERNED", input);
  } finally {
    await cleanup(fixture);
  }
});

test("accepts controlled live acquisition provenance and rejects unsupported media classification", async () => {
  const fixture = await prepareFixture();
  try {
    const metadata = JSON.parse(
      await readFile(fixture.metadataPath, "utf8"),
    ) as {
      mode: string;
      content_type: string;
    };
    metadata.mode = "live";
    await writeFile(
      fixture.metadataPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const liveInput = structuredClone(fixture.input);
    liveInput.acquisition.acquisition_record_sha256 = hash(
      await readFile(fixture.metadataPath),
    );
    const live = await ingestGovernedArcaAcquiredSource(liveInput, {
      acquisitionRoot: fixture.acquisitionRoot,
      candidateRoot: fixture.candidateRoot,
    });
    assert.equal(live.candidate.review_state, "human_review_required");

    await rm(fixture.candidateRoot, { recursive: true, force: true });

    metadata.mode = "replay";
    metadata.content_type = "application/zip";
    await writeFile(
      fixture.metadataPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    const mediaInput = structuredClone(fixture.input);
    mediaInput.acquisition.media_type = "application/zip";
    mediaInput.acquisition.acquisition_record_sha256 = hash(
      await readFile(fixture.metadataPath),
    );
    await expectFailure(fixture, "UNSUPPORTED_CONTENT_TYPE", mediaInput);
  } finally {
    await cleanup(fixture);
  }
});

test("rejects unsupported byte shape and leaves no partial candidate", async () => {
  const fixture = await prepareFixture("not an ARCA nomenclador\n");
  try {
    await expectFailure(fixture, "UNSUPPORTED_CONTENT_TYPE");
  } finally {
    await cleanup(fixture);
  }
});

test("rejects parser output that does not satisfy the candidate schema", async () => {
  const fixture = await prepareFixture(
    "2@ABCDEF12@10.00@20.00@3.00@@@@UN@@INVALID CODE\n",
  );
  try {
    await expectFailure(fixture, "INVALID_OUTPUT");
  } finally {
    await cleanup(fixture);
  }
});

test("does not overwrite an immutable candidate or leave a staging artifact", async () => {
  const fixture = await prepareFixture();
  try {
    const first = await ingestGovernedArcaAcquiredSource(fixture.input, {
      acquisitionRoot: fixture.acquisitionRoot,
      candidateRoot: fixture.candidateRoot,
    });
    const before = await readFile(first.candidatePath, "utf8");
    await assert.rejects(
      ingestGovernedArcaAcquiredSource(fixture.input, {
        acquisitionRoot: fixture.acquisitionRoot,
        candidateRoot: fixture.candidateRoot,
      }),
      (error: unknown) =>
        error instanceof GovernedArcaIngestionError &&
        error.code === "CANDIDATE_EXISTS",
    );
    assert.equal(await readFile(first.candidatePath, "utf8"), before);
    assert.equal(
      (await readdir(dirname(first.candidatePath))).some((entry) =>
        entry.startsWith(".staging-"),
      ),
      false,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("CLI accepts governed identity contracts and rejects URL or raw-file inputs", () => {
  assert.deepEqual(
    parseArguments([
      "--contract",
      "input.json",
      "--acquisition-root",
      "acquisitions",
      "--candidate-root",
      "candidates",
    ]),
    {
      contractPath: "input.json",
      acquisitionRoot: "acquisitions",
      candidateRoot: "candidates",
    },
  );
  assert.throws(() =>
    parseArguments([
      "--url",
      SOURCE_URL,
      "--raw-file",
      "fixture.txt",
      "--candidate-root",
      "candidates",
    ]),
  );
});

test("published JSON Schemas validate the input and candidate contracts", async () => {
  const fixture = await prepareFixture();
  try {
    const result = await ingestGovernedArcaAcquiredSource(fixture.input, {
      acquisitionRoot: fixture.acquisitionRoot,
      candidateRoot: fixture.candidateRoot,
    });
    const ajv = new Ajv({ allErrors: true, strict: true });
    const inputSchema = JSON.parse(
      await readFile(
        "schemas/governed-arca-acquired-source-input.schema.json",
        "utf8",
      ),
    ) as object;
    const candidateSchema = JSON.parse(
      await readFile("schemas/governed-arca-candidate.schema.json", "utf8"),
    ) as object;
    assert.deepEqual(inputSchema, GOVERNED_ARCA_ACQUIRED_SOURCE_INPUT_SCHEMA);
    assert.deepEqual(candidateSchema, GOVERNED_ARCA_CANDIDATE_SCHEMA);
    assert.equal(ajv.compile(inputSchema)(fixture.input), true);
    assert.equal(ajv.compile(candidateSchema)(result.candidate), true);
  } finally {
    await cleanup(fixture);
  }
});

test("failure cases never produce a candidate JSON file", async () => {
  const fixture = await prepareFixture();
  try {
    const input = structuredClone(fixture.input);
    input.acquisition.acquisition_record_sha256 = "0".repeat(64);
    await expectFailure(fixture, "ACQUISITION_HASH_MISMATCH", input);
    await assert.rejects(access(fixture.candidateRoot), { code: "ENOENT" });
  } finally {
    await cleanup(fixture);
  }
});
