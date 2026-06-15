/**
 * ARCA Agent - Specialized in tariffs, rates, and fiscal data
 * 
 * Responsibilities:
 * - Extract AEC, Extra-zona, DIE, Estadística, IVA
 * - Identify tariff regimes (general, special, suspensive)
 * - Detect fiscal benefits (Ley de Promoción, etc.)
 * - Report exact numerical values with sources
 */

import { AgentContext, AgentResult, Claim, UnsupportedClaim } from './types.js';

const ARCA_SYSTEM_PROMPT = `Eres el ARCA Agent de vLatam AI Lab. Eres un EXPERTO en aranceles aduaneros argentinos.

## Tu especialidad
- Arancel Externo Común (AEC)
- Derecho Extra-Zona (EZ)
- Derecho de Importación Específico (DIE)
- Tasa de Estadística
- IVA y otros impuestos internos
- Regímenes arancelarios especiales
- Sufijos de valor

## Reglas estrictas
1. SOLO reporta valores numéricos que aparezcan EXPLÍCITAMENTE en la evidencia
2. Si un valor dice "N/A" o está vacío, NO inventes un número
3. Si no tienes datos arancelarios para la NCM, reporta status="no_data"
4. Distingue claramente entre AEC, Extra-zona, DIE, Estadística, IVA
5. Cita SIEMPRE el NCM exacto y la fuente
6. Si hay múltiples NCM relacionados (ej: 8443.32 vs 8443.32.31), aclara cuál estás usando

## Formato de respuesta
Devuelve JSON con:
{
  "status": "success" | "partial" | "no_data",
  "claims": [
    {
      "claim_id": "arca-001",
      "claim_type": "tariff",
      "claim_text": "...",
      "evidence_reference": "NCM exacto + valor",
      "confidence": 0.0-1.0,
      "source": "arca"
    }
  ],
  "unsupported_claims": [...],
  "warnings": [...]
}

## NUNCA hagas
- Inventar valores arancelarios
- Confundir AEC con Extra-zona
- Reportar confidence > 0.95 si algún valor es N/A
- Mezclar datos de diferentes NCM sin aclarar`;

export class ArcaAgent {
  private apiKey: string;
  private baseUrl: string = 'https://api.deepseek.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(context: AgentContext, arcaEvidence: string): Promise<AgentResult> {
    const userPrompt = `Analiza los siguientes datos arancelarios para el producto descrito.

PRODUCTO: ${context.product_description}
NCM CANDIDATO: ${context.candidate_ncm8}
ORIGEN: ${context.origin_country} → DESTINO: ${context.destination_country}

EVIDENCIA ARCA DISPONIBLE:
${arcaEvidence}

INSTRUCCIONES:
1. Identifica el NCM exacto que corresponde al producto
2. Extrae TODOS los valores arancelarios disponibles (AEC, EZ, DIE, Estadística, IVA)
3. Si algún valor es N/A o no está, indícalo claramente
4. Si la NCM candidata no existe en la evidencia, reporta status="no_data"
5. Asigna confidence apropiada (0.9+ solo si TODOS los valores están confirmados)

Responde SOLO con JSON válido.`;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: ARCA_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        return {
          agent_name: 'arca',
          status: 'failed',
          claims: [],
          unsupported_claims: [],
          warnings: [`ARCA API error: ${response.status}`],
          confidence: 0,
          evidence_used: [],
        };
      }

      const data = await response.json() as any;
      const content = JSON.parse(data.choices[0].message.content);

      return {
        agent_name: 'arca',
        status: content.status || 'success',
        claims: (content.claims || []).map((c: any) => ({ ...c, source: 'arca' })),
        unsupported_claims: content.unsupported_claims || [],
        warnings: content.warnings || [],
        confidence: content.confidence || 0.5,
        evidence_used: ['ARCA Arancel Integrado'],
        raw_context: arcaEvidence,
      };
    } catch (error: any) {
      return {
        agent_name: 'arca',
        status: 'failed',
        claims: [],
        unsupported_claims: [],
        warnings: [`ARCA agent error: ${error.message}`],
        confidence: 0,
        evidence_used: [],
      };
    }
  }
}
