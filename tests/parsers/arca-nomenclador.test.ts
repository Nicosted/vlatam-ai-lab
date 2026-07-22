import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH,
  ARCA_NOMENCLADOR_PARSER_ID,
  ARCA_NOMENCLADOR_PARSER_VERSION,
  parseArcaNomencladorBytes,
} from "../../src/parsers/arca-nomenclador.js";

test("existing ARCA nomenclador parser remains deterministic", () => {
  const bytes = Buffer.from(
    "2@4202.92.00@10.00@20.00@3.00@@@@UN@@BOLSOS\n1@ignored\n",
    "latin1",
  );
  const context = {
    sourceUrl:
      "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt",
    snapshotDate: "2026-07-22",
  };

  const first = parseArcaNomencladorBytes(bytes, context);
  const second = parseArcaNomencladorBytes(bytes, context);

  assert.deepEqual(second, first);
  assert.equal(first.length, 1);
  assert.deepEqual(first[0], {
    ncm_code: "4202.92.00",
    ncm_code_clean: "42029200",
    hs6_code: "4202.92",
    description: "BOLSOS",
    aec_rate: 10,
    derecho_extra_zona: 20,
    tasa_estadistica: 3,
    iva_rate: 21,
    iva_is_inferred: true,
    unidad_estadistica: "UN",
    source: "ARCA Arancel Integrado",
    source_url: context.sourceUrl,
    snapshot_date: context.snapshotDate,
  });
  assert.equal(ARCA_NOMENCLADOR_PARSER_ID, "arca-nomenclador-txt");
  assert.equal(ARCA_NOMENCLADOR_PARSER_VERSION, "1.0.0");
  assert.match(ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH, /^[a-f0-9]{64}$/);
});
