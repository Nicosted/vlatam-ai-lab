# VUCE Data Inspection Report

Date: 2026-06-14
Source: data/sources/vuce/

## Structure

```
data/sources/vuce/
├── 00_manifest/
│   └── posiciones_iniciales.txt
├── 01_consultas_por_posicion/
│   ├── 4202.92.00.110V_importacion_china/
│   │   ├── detalle_civuce_importacion_4202.92.00.110V_china_2026-06-14.pdf
│   │   └── notas_manual.txt
│   ├── 4202.92.00.120Y_importacion_china/
│   │   ├── detalle_civuce_importacion_4202.92.00.120Y_china_2026-06-14.pdf
│   │   └── notas_manual.txt
│   └── 4202.92.00.900_importacion_china/
│       ├── consulta_civuce_importacion_4202.92.00.900_china_2026-06-14.pdf
│       └── notas_manual.txt
├── 02_capturas_generales/
├── 03_normativa_citada/
├── detalle_expandido_intervenciones_4202.92.00.110V_china_2026-06-14.pdf
└── detalle_expandido_intervenciones_4202.92.00.120Y_china_2026-06-14.pdf
```

## Positions covered

- 4202.92.00.900 (general search - all positions in NCM 4202.92.00)
- 4202.92.00.110V (mochila de campamento)
- 4202.92.00.120Y (Res. 163/2005 SCT)

## PDFs (gitignored, kept locally)

| File | Size | Description |
|------|------|-------------|
| detalle_civuce_importacion_4202.92.00.110V_china_2026-06-14.pdf | ~100 KB | CIVUCE detail for position 110V |
| detalle_civuce_importacion_4202.92.00.120Y_china_2026-06-14.pdf | ~100 KB | CIVUCE detail for position 120Y |
| consulta_civuce_importacion_4202.92.00.900_china_2026-06-14.pdf | ~100 KB | General query for NCM 4202.92.00 |
| detalle_expandido_intervenciones_4202.92.00.110V_china_2026-06-14.pdf | ~350 KB | Expanded interventions detail |
| detalle_expandido_intervenciones_4202.92.00.120Y_china_2026-06-14.pdf | ~350 KB | Expanded interventions detail |

**Total: ~1 MB**

## Manual notes

### 4202.92.00.110V (Mochila de campamento)
See: `data/sources/vuce/01_consultas_por_posicion/4202.92.00.110V_importacion_china/notas_manual.txt`

### 4202.92.00.120Y (Res. 163/2005 SCT)
See: `data/sources/vuce/01_consultas_por_posicion/4202.92.00.120Y_importacion_china/notas_manual.txt`

### 4202.92.00.900 (General)
See: `data/sources/vuce/01_consultas_por_posicion/4202.92.00.900_importacion_china/notas_manual.txt`

## Status

- raw_official_snapshot: ✅
- human_review_required: true
- downstream_allowed: false

## Pending

- [ ] Extract text from PDFs (Phase 2)
- [ ] Cross-reference cited norms with InfoLEG
- [ ] Generate evidence packets from VUCE data
- [ ] Expand to more positions (on-demand)

## Governance

VUCE data requires human review before use in production:
- PDFs captured from official source
- Manual review notes from team
- Not yet processed by automated pipeline
