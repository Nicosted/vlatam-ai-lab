# vLatam AI Lab — Data Catalog

Last updated: 2026-06-14

## Sources Overview

| Source | Status | Files | Size | Parser |
|--------|--------|-------|------|--------|
| ARCA Arancel Integrado | ✅ Parsed | 3 TXT files | ~9 MB | arca-real-crawler.ts |
| InfoLEG | 📋 Inspected | 3 CSV files | ~362 MB | TODO |
| VUCE/CIVUCE | 📦 Captured | 5 PDFs + notes | ~1 MB | TODO |
| MERCOSUR | ❌ Empty | 0 | 0 | TODO |
| Boletín Oficial | ❌ Empty | 0 | 0 | TODO |
| Organismos Sectoriales | ❌ Empty | 0 | 0 | TODO |

## Directory Structure

```
data/
├── sources/              # Raw official files (organized by source)
│   ├── arca/            # ARCA Arancel Integrado (TXT tracked, ZIP gitignored)
│   ├── infoleg/         # InfoLEG normative database (CSV gitignored)
│   ├── vuce/            # VUCE/CIVUCE captures (PDF gitignored, notes tracked)
│   ├── mercosur/        # MERCOSUR NCM/AEC (to populate)
│   ├── boletin_oficial/ # Boletín Oficial (to populate)
│   └── organismos_sectoriales/ # SENASA, ANMAT, etc. (to populate)
├── raw/                  # Crawler raw downloads (audit trail, gitignored)
├── parsed/               # Parsed JSON (structured data, tracked)
│   └── arca/            # arancel-2026-06-14.json (47,496 lines)
├── diffs/                # Change detection between snapshots (tracked)
│   └── arca/            # diff-2026-06-14.json
└── manifests/            # Audit trail manifests (tracked)
    ├── DATA_CATALOG.md (this file)
    ├── infoleg-inspection-report.md
    ├── vuce-inspection-report.md
    └── arca-sha256.txt
```

## Data Flow

```
Official Source (ARCA/InfoLEG/VUCE)
  ↓ download
vlatam_normativa_ar_2026_06_14/
  ↓ organize
data/sources/<source>/
  ↓ crawler
  ↓ parse
data/parsed/<source>/ (structured JSON)
  ↓ diff detector
data/diffs/<source>/ (changes)
  ↓ evidence packet generator
snapshots/pcram/extractable-evidence-packet-*.json
  ↓ DeepSeek agent
snapshots/pcram/ai-extraction-result-*.json
```

## ARCA Data Summary

- **File**: nomenclador_14062026.txt (5.3 MB)
- **Lines parsed**: 47,496 tariff positions
- **With AEC rate**: 33,223 (70%)
- **With EZ rate**: 33,223 (70%)
- **With estadística**: 33,223 (70%)
- **Format**: @-delimited, ISO-8859 encoding
- **Parsed to**: data/parsed/arca/arancel-2026-06-14.json

## File Size Policy

| Type | Size | Git Tracked? |
|------|------|--------------|
| TXT < 10 MB | Small | ✅ Yes |
| CSV (InfoLEG) | Large (242M+) | ❌ No (gitignored) |
| Excel/ZIP | Variable | ❌ No (gitignored) |
| PDFs | Variable | ❌ No (gitignored) |
| Parsed JSON | Small | ✅ Yes |
| Diffs | Small | ✅ Yes |
| Manifests | Small | ✅ Yes |

## Update Cadence

| Source | Recommended | Actual |
|--------|-------------|--------|
| ARCA | Weekly | 2026-06-14 |
| InfoLEG | Daily | 2026-06-14 |
| VUCE | On-demand | On client query |
| MERCOSUR | Monthly | TODO |
| Boletín Oficial | Daily | TODO |

## Next Steps

1. ✅ ARCA crawler working with real data (47,496 positions)
2. 🔄 InfoLEG crawler (next prompt - filter customs norms)
3. 🔄 VUCE PDF extraction pipeline
4. ⏳ MERCOSUR crawler
5. ⏳ Boletín Oficial crawler
6. ⏳ Organismos sectoriales (on-demand)

## Validation Commands

```bash
# ARCA data completeness
cat data/parsed/arca/arancel-*.json | jq '{
  total: .tariff_lines_count,
  with_aec: [.tariff_lines[] | select(.aec_rate != null)] | length,
  with_ez: [.tariff_lines[] | select(.derecho_extra_zona != null)] | length
}'

# Find specific NCM
cat data/parsed/arca/arancel-*.json | jq '.tariff_lines[] | select(.ncm_code_clean | startswith("420292")) | {ncm: .ncm_code, desc: .description, aec: .aec_rate, ez: .derecho_extra_zona}'

# Generate packet
pnpm crawler:packet 4202.92.00 "Mochila escolar"

# Validate and extract
pnpm ai:validate-packet snapshots/pcram/evidence-packet-ar-arancel-4202-92-00-*.json
pnpm ai:extract snapshots/pcram/evidence-packet-ar-arancel-4202-92-00-*.json
```

## Governance

- **human_review_required**: true (all extractions)
- **downstream_allowed**: false (until reviewed)
- **source**: Official ARCA/AFIP downloads
- **audit**: SHA-256 hashes in manifests/
- **repo-first**: No external DB, all in Git
