/**
 * InfoLEG Agent - Specialized in Argentine legal norms
 * 
 * Responsibilities:
 * - Identify applicable laws, decrees, resolutions
 * - Determine norm hierarchy and validity
 * - Extract legal basis for tariffs and interventions
 * - Detect norm modifications and derogations
 */

import { AgentContext, AgentResult } from './types.js';

const INFOLEG_SYSTEM_PROMPT = `Eres el InfoLEG Agent de vLatam AI Lab. Eres un EXPERTO en normativa legal argentina.

## Tu especialidad
- Leyes, decretos, resoluciones, disposiciones
- Jerarquía normativa
- Vigencia y modificaciones
- Base legal de regímenes arancelarios
- Normativa sectorial (SENASA, ANMAT, etc.)

## Reglas estrictas
1. Cita SIEMPRE el número exacto de la norma (ej: "Decreto 557/2023")
2. Distingue entre normas vigentes, modificadas y derogadas
3. Si no tienes el texto legal específico, reporta status="partial"
4. No inventes números de normas
5. Relaciona las normas con los aranceles e intervenciones cuando sea posible
6. Indica la fecha de vigencia cuando esté disponible

## Formato de respuesta
{
  "status": "success" | "partial" | "no_data",
  "claims": [
    {
      "claim_id": "infoleg-001",
      "claim_type": "legal",
      "claim_text": "La NCM X está regulada por [norma] que establece...",
      "evidence_reference": "[tipo] [número] - [fecha]",
      "confidence": 0.0-1.0,
      "source": "infoleg"
    }
  ],
  "unsupported_claims": [...],
  "warnings": [...]
}`;

export class InfolegAgent {
  private apiKey: string;
  private baseUrl: string = 'https://api.deepseek.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(context: AgentContext, infolegEvidence: string): Promise<AgentResult> {
    const userPrompt = `Analiza la base legal aplicable a este producto.

PRODUCTO: ${context.product_description}
NCM CANDIDATO: ${context.candidate_ncm8}
ORIGEN: ${context.origin_country} → DESTINO: ${context.destination_country}

EVIDENCIA INFOLEG DISPONIBLE:
${infolegEvidence || 'NO HAY DATOS INFOLEG ESPECÍFICOS PARA ESTA NCM'}

INSTRUCCIONES:
1. Identifica las normas aplicables (leyes, decretos, resoluciones)
2. Cita el número exacto de cada norma
3. Indica vigencia y jerarquía
4. Relaciona con aranceles e intervenciones si es posible

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
            { role: 'system', content: INFOLEG_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        return {
          agent_name: 'infoleg',
          status: 'failed',
          claims: [],
          unsupported_claims: [],
          warnings: [`InfoLEG API error: ${response.status}`],
          confidence: 0,
          evidence_used: [],
        };
      }

      const data = await response.json() as any;
      const content = JSON.parse(data.choices[0].message.content);

      return {
        agent_name: 'infoleg',
        status: content.status || 'success',
        claims: (content.claims || []).map((c: any) => ({ ...c, source: 'infoleg' })),
        unsupported_claims: content.unsupported_claims || [],
        warnings: content.warnings || [],
        confidence: content.confidence || 0.5,
        evidence_used: ['InfoLEG'],
        raw_context: infolegEvidence,
      };
    } catch (error: any) {
      return {
        agent_name: 'infoleg',
        status: 'failed',
        claims: [],
        unsupported_claims: [],
        warnings: [`InfoLEG agent error: ${error.message}`],
        confidence: 0,
        evidence_used: [],
      };
    }
  }
}
