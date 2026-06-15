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
      // H-01 fix: Add 30s timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      
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
        signal: controller.signal,
      });
      
      clearTimeout(timeout);

      if (!response.ok) {
        return {
          agent_name: 'arca',
          status: 'failed',
          claims: [],
          unsupported_claims: [],
          warnings: ['Provider API error'], // H-02: Redacted message
          confidence: 0,
          evidence_used: [],
        };
      }

      const data = await response.json() as any;
      let content: any;
      
      try {
        content = JSON.parse(data.choices[0].message.content);
      } catch (e) {
        return {
          agent_name: 'arca',
          status: 'failed',
          claims: [],
          unsupported_claims: [],
          warnings: ['Invalid JSON response from provider'],
          confidence: 0,
          evidence_used: [],
        };
      }

      // C-03 fix: Validate and clamp output
      const validatedClaims = (content.claims || [])
        .filter((c: any) => c && typeof c === 'object')
        .map((c: any) => ({
          claim_id: String(c.claim_id || `arca-${Math.random().toString(36).substring(7)}`),
          claim_type: ['tariff', 'intervention', 'legal', 'classification'].includes(c.claim_type) ? c.claim_type : 'tariff',
          claim_text: String(c.claim_text || '').substring(0, 500),
          evidence_reference: String(c.evidence_reference || '').substring(0, 200),
          confidence: Math.max(0, Math.min(1, Number(c.confidence) || 0.5)), // Clamp 0-1
          source: 'arca' as const,
        }))
        .slice(0, 20); // Limit claims count
      
      const validatedUnsupported = (content.unsupported_claims || [])
        .filter((c: any) => c && typeof c === 'object')
        .map((c: any) => ({
          claim_text: String(c.claim_text || '').substring(0, 500),
          reason: String(c.reason || '').substring(0, 500),
        }))
        .slice(0, 10);
      
      const warnings = (content.warnings || [])
        .filter((w: any) => typeof w === 'string')
        .map((w: string) => w.substring(0, 500))
        .slice(0, 10);
      
      // Clamp confidence
      const confidence = Math.max(0, Math.min(1, Number(content.confidence) || 0.5));

      return {
        agent_name: 'arca',
        status: ['success', 'partial', 'no_data', 'failed'].includes(content.status) ? content.status : 'partial',
        claims: validatedClaims,
        unsupported_claims: validatedUnsupported,
        warnings,
        confidence,
        evidence_used: ['ARCA Arancel Integrado'],
        raw_context: sanitizedEvidence,
      };
    } catch (error: any) {
      // H-01 & H-02 fixes: Handle timeout and redact error
      const isTimeout = error.name === 'AbortError';
      return {
        agent_name: 'arca',
        status: 'failed',
        claims: [],
        unsupported_claims: [],
        warnings: [isTimeout ? 'Provider timeout' : 'Provider error'],
        confidence: 0,
        evidence_used: [],
      };
    }
  }
}
