import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const ARCA_NOMENCLADOR_PARSER_ID = "arca-nomenclador-txt" as const;
export const ARCA_NOMENCLADOR_PARSER_VERSION = "1.0.0" as const;

export const ARCA_NOMENCLADOR_PARSER_CONFIGURATION = Object.freeze({
  encoding: "latin1",
  delimiter: "@",
  tariff_record_type: "2",
  default_iva_rate: 21,
});

export const ARCA_NOMENCLADOR_PARSER_CONFIGURATION_HASH = createHash("sha256")
  .update(JSON.stringify(ARCA_NOMENCLADOR_PARSER_CONFIGURATION))
  .digest("hex");

export interface ArcaParserContext {
  sourceUrl: string;
  snapshotDate: string;
}

export interface TariffLine {
  ncm_code: string;
  ncm_code_clean: string;
  hs6_code: string;
  description: string;
  aec_rate: number | null;
  derecho_extra_zona: number | null;
  tasa_estadistica: number | null;
  iva_rate: number | null;
  iva_is_inferred: boolean;
  unidad_estadistica: string;
  source: string;
  source_url: string;
  snapshot_date: string;
}

const LEGACY_CONTEXT: ArcaParserContext = Object.freeze({
  sourceUrl: "https://www.afip.gob.ar/aduana/arancelintegrado/",
  snapshotDate: "2026-06-14",
});

function parseRate(field: string | undefined): number | null {
  if (!field) return null;
  const value = field.trim();
  if (value === "") return null;
  if (value === "000.00" || value === "000.00@") return 0;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseArcaNomencladorText(
  content: string,
  context: ArcaParserContext,
): TariffLine[] {
  const tariffLines: TariffLine[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = trimmed.split(
      ARCA_NOMENCLADOR_PARSER_CONFIGURATION.delimiter,
    );
    if (fields[0] !== ARCA_NOMENCLADOR_PARSER_CONFIGURATION.tariff_record_type)
      continue;

    const ncmFull = fields[1]?.trim() ?? "";
    if (!ncmFull) continue;

    const ncmParts = ncmFull.split(".");
    let ncmCode = ncmFull;
    let ncmClean = ncmFull.replace(/\./g, "");
    if (ncmParts.length > 4) {
      ncmCode = ncmParts.slice(0, 4).join(".");
      ncmClean = ncmCode.replace(/\./g, "");
    }

    const hs6Clean = ncmClean.substring(0, 6);
    const hs6Code = `${hs6Clean.substring(0, 4)}.${hs6Clean.substring(4, 6)}`;
    const aecRate = parseRate(fields[2]);
    const derechoExtraZona = parseRate(fields[3]);
    const tasaEstadistica = parseRate(fields[4]);
    const unidadEstadistica = fields[8]?.trim() ?? "";
    const description = fields[10]?.trim() ?? "";
    const hasTariffData = aecRate !== null || derechoExtraZona !== null;

    tariffLines.push({
      ncm_code: ncmFull,
      ncm_code_clean: ncmClean,
      hs6_code: hs6Code,
      description,
      aec_rate: aecRate,
      derecho_extra_zona: derechoExtraZona,
      tasa_estadistica: tasaEstadistica,
      iva_rate: hasTariffData
        ? ARCA_NOMENCLADOR_PARSER_CONFIGURATION.default_iva_rate
        : null,
      iva_is_inferred: hasTariffData,
      unidad_estadistica: unidadEstadistica,
      source: "ARCA Arancel Integrado",
      source_url: context.sourceUrl,
      snapshot_date: context.snapshotDate,
    });
  }

  return tariffLines;
}

export function parseArcaNomencladorBytes(
  bytes: Uint8Array,
  context: ArcaParserContext,
): TariffLine[] {
  return parseArcaNomencladorText(
    Buffer.from(bytes).toString("latin1"),
    context,
  );
}

export function parseNomencladorFile(filePath: string): TariffLine[] {
  return parseArcaNomencladorBytes(readFileSync(filePath), LEGACY_CONTEXT);
}
