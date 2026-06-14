# InfoLEG Data Inspection Report

Date: 2026-06-14
Source: data/sources/infoleg/

## Files

| File | Lines | Size |
|------|-------|------|
| infoleg_normativa_nacional_full_2026-06-14.csv | 425,190 | 242 MB |
| infoleg_normas_modificadas_full_2026-06-14.csv | 378,725 | 63 MB |
| infoleg_normas_modificatorias_full_2026-06-14.csv | 374,183 | 57 MB |

**Total: 1,178,098 lines | 362 MB**

## Column Structure

### normativa_nacional_full.csv
Columns: `id_norma`,`tipo_norma`,`nro_norma`,`clase_norma`,`organismo_origen`,`fecha_boletin`,`titulo_sumario`,`titulo_resumido`

### normas_modificadas_full.csv  
Columns: `id_norma_modificada`,`id_norma_modificatoria`,`tipo_norma`,`nro_norma`,`clase_norma`,`organismo_origen`,`fecha_boletin`,`titulo_sumario`,`titulo_resumido`

### normas_modificatorias_full.csv
Columns: `id_norma_modificatoria`,`id_norma_modificada`,`tipo_norma`,`nro_norma`,`clase_norma`,`organismo_origen`,`fecha_boletin`,`titulo_sumario`,`titulo_resumido`

## Customs-relevant norms

Estimated matches (case-insensitive search):
- "arancel": TBD
- "aduana": TBD
- "importaci": TBD
- "AEC": TBD
- "NCM": TBD

## Key norms to locate

- Decreto 557/2023: AEC rates
- Decreto 274/2019: Import duties
- Resolución General 237/2024: Customs procedures
- Ley 22.415: Customs Code (Código Aduanero)
- Resoluciones SCT relevant to NCM 4202.92.00

## Encoding

UTF-8 with quoted fields (CSV standard)

## Delimiter

Comma (`,`) with quoted string fields

## Next Steps

- [ ] Build InfoLEG crawler (filter for customs-relevant norms)
- [ ] Cross-reference with VUCE-cited norms
- [ ] Link norms to NCM positions
- [ ] Generate evidence packets with normative references

## Status

📋 Inspected - Ready for crawler implementation
