/**
 * VUCE Agent - Specialized in interventions, requirements, and procedures
 * 
 * Responsibilities:
 * - Identify mandatory interventions (SENASA, ANMAT, ENACOM, etc.)
 * - List required certificates and permits
 * - Detect optional procedures
 * - Report legal basis for each intervention
 * 
 * CRITICAL RULE: If VUCE data is missing for a NCM, MUST report status="no_data"
 * with confidence 0.3 MAX. NEVER say "no interventions required" without data.
 */

import { AgentContext, AgentResult } from './types.js';

const VUCE_SYSTEM_PROMPT = `Eres el VUCE Agent de vLatam AI Lab. Eres un EXPERTO en intervenciones de comercio exterior argentino.

## Tu especialidad
- Organismos intervinientes (SENASA, ANMAT, ENACOM, Reglamentos Técnicos, etc.)
- Requisitos y certificados obligatorios
- Trámites optativos
- Normativa de intervenciones
- Regímenes especiales (Convenio Estocolmo, embalajes madera, etc.)

## Reglas CRÍTICAS (lee con atención)
1. Si NO tienes datos VUCE para la NCM consultada, DEBES reportar status="no_data"
2. NUNCA digas "no se requieren intervenciones" si no tienes datos VUCE específicos
3. Si dices "no se requieren intervenciones", confidence debe ser 1.0 Y debes tener evidencia explícita
4. Si tienes datos parciales, confidence máximo 0.7
5. Lista SIEMPRE los organismos mencionados en la evidencia
6. Distingue entre trámites obligatorios y optativos
7. Cita la normativa específica (Dec, Res, Disp) cuando esté disponible

## Formato de respuesta
{
  "status": "success" | "partial" | "no_data",
  "claims": [
    {
      "claim_id": "vuce-001",
      "claim_type": "intervention",
      "claim_text": "Requiere intervención de [organismo] para [motivo]",
      "evidence_reference": "...",
      "confidence": 0.0-1.0,
      "source": "vuce"
    }
  ],
  "unsupported_claims": [...],
  "warnings": [...]
}

## NUNCA hagas
- Inventar intervenciones
- Decir "no hay intervenciones" sin evidencia explícita
- Reportar confidence > 0.8 sin datos VUCE específicos para la NCM
- Mezclar datos de diferentes NCM`;

export class VuceAgent {
  private apiKey: string;
  private baseUrl: string = 'https://api.deepseek.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(context: AgentContext, vuceEvidence: string): Promise<AgentResult> {
    const userPrompt = `Analiza las intervenciones y requisitos para este producto.

PRODUCTO: ${context.product_description}
NCM CANDIDATO: ${context.candidate_ncm8}
ORIGEN: ${context.origin_country} → DESTINO: ${context.destination_country}

EVIDENCIA VUCE DISPONIBLE:
${vuceEvidence || 'NO HAY DATOS VUCE PARA ESTA NCM'}

INSTRUCCIONES CRÍTICAS:
1. Si la evidencia dice "NO HAY DATOS VUCE" o está vacía, responde status="no_data"
2. NUNCA digas "no se requieren intervenciones" si no tienes datos específicos
3. Lista todos los organismos, requisitos y trámites mencionados
4. Distingue entre obligatorios y optativos
5. Cita la normativa específica

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
            { role: 'system', content: VUCE_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        return {
          agent_name: 'vuce',
          status: 'failed',
          claims: [],
          unsupported_claims: [],
          warnings: [`VUCE API error: ${response.status}`],
          confidence: 0,
          evidence_used: [],
        };
      }

      const data = await response.json() as any;
      const content = JSON.parse(data.choices[0].message.content);

      // CRITICAL: Cap confidence if no VUCE data was provided
      const hasNoData = !vuceEvidence || vuceEvidence.includes('NO HAY DATOS VUCE') || vuceEvidence.trim() === '';
      if (hasNoData && content.confidence > 0.3) {
        content.confidence = 0.3;
        content.warnings = content.warnings || [];
        content.warnings.push('Confidence capped at 0.3 because no VUCE data was available for this NCM');
      }

      return {
        agent_name: 'vuce',
        status: content.status || (hasNoData ? 'no_data' : 'success'),
        claims: (content.claims || []).map((c: any) => ({ ...c, source: 'vuce' })),
        unsupported_claims: content.unsupported_claims || [],
        warnings: content.warnings || [],
        confidence: content.confidence || 0.5,
        evidence_used: hasNoData ? [] : ['VUCE/CIVUCE'],
        raw_context: vuceEvidence,
      };
    } catch (error: any) {
      return {
        agent_name: 'vuce',
        status: 'failed',
        claims: [],
        unsupported_claims: [],
        warnings: [`VUCE agent error: ${error.message}`],
        confidence: 0,
        evidence_used: [],
      };
    }
  }
}
