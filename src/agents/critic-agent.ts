/**
 * Critic Agent - Validates consistency across specialized agents
 * 
 * Responsibilities:
 * - Detect discrepancies between agents (e.g., ARCA AEC 0% vs VUCE AEC 10.8%)
 * - Validate that confidence scores are justified
 * - Ensure governance rules are enforced
 * - Generate final warnings and recommendations
 */

import { AgentResult, Discrepancy, AgentContext } from './types.js';

const CRITIC_SYSTEM_PROMPT = `Eres el Critic Agent de vLatam AI Lab. Tu rol es VALIDAR la consistencia de los resultados de múltiples agentes especializados.

## Tu misión
1. Detectar discrepancias REALES (valores numéricos diferentes para el mismo concepto)
2. Calcular confidence final basada en la CALIDAD de las fuentes, no en su cantidad
3. Generar warnings claros para el revisor humano

## Reglas CRÍTICAS para discrepancias
1. SOLO reporta discrepancia si dos fuentes dan VALORES NUMÉRICOS DIFERENTES
   - ✅ CORRECTO: ARCA dice AEC 0% pero VUCE dice AEC 10.8% → DISCREPANCIA HIGH
   - ❌ INCORRECTO: ARCA dice AEC 0% pero InfoLEG menciona "AEC" sin valor → NO es discrepancia
   - ❌ INCORRECTO: ARCA dice AEC 0% pero InfoLEG dice "sujeto al AEC" → NO es discrepancia
2. Una MENCION de un concepto NO es lo mismo que un VALOR de ese concepto
3. Si InfoLEG solo menciona que existe el AEC pero no da valor, NO hay discrepancia con ARCA

## Reglas CRÍTICAS para confidence
1. Si ARCA tiene datos sólidos (3+ claims con valores numéricos), confidence base = 0.8+
2. Si VUCE tiene datos de intervenciones, suma +0.1 a confidence
3. Si InfoLEG tiene normas relevantes, suma +0.05 a confidence
4. Si algún agente tiene status="no_data", NO penalices fuertemente - solo agrega warning
5. Confidence final NUNCA debe ser < 0.5 si ARCA tiene datos sólidos
6. Confidence final NUNCA debe ser > 0.95 (siempre requiere revisión humana)

## Formato de respuesta
{
  "discrepancies": [
    {
      "type": "tariff_conflict",
      "description": "ARCA reporta AEC 0% pero VUCE reporta AEC 10.8% para la misma NCM",
      "sources": ["arca", "vuce"],
      "severity": "high"
    }
  ],
  "final_confidence": 0.0-1.0,
  "warnings": [...],
  "recommendations": [...]
}`;

export class CriticAgent {
  private apiKey: string;
  private baseUrl: string = 'https://api.deepseek.com';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async validate(
    context: AgentContext,
    agentResults: AgentResult[]
  ): Promise<{ discrepancies: Discrepancy[]; final_confidence: number; warnings: string[] }> {
    const summary = agentResults.map(r => ({
      agent: r.agent_name,
      status: r.status,
      claims_count: r.claims.length,
      confidence: r.confidence,
      claims: r.claims.map(c => ({
        type: c.claim_type,
        text: c.claim_text,
        confidence: c.confidence,
      })),
      warnings: r.warnings,
    }));

    const userPrompt = `Valida la consistencia de estos resultados de agentes especializados.

CONTEXTO:
- Producto: ${context.product_description}
- NCM: ${context.candidate_ncm8}

RESULTADOS DE AGENTES:
${JSON.stringify(summary, null, 2)}

INSTRUCCIONES:
1. Identifica discrepancias entre agentes (mismo concepto, valores diferentes)
2. Valida que confidence scores sean justificados
3. Si algún agente tiene status="no_data", ajusta confidence final
4. Genera warnings claros
5. Calcula confidence final considerando:
   - Confiances individuales
   - Discrepancias detectadas
   - Cobertura de fuentes

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
            { role: 'system', content: CRITIC_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        return this.fallbackValidation(agentResults);
      }

      const data = await response.json() as any;
      return JSON.parse(data.choices[0].message.content);
    } catch (error) {
      return this.fallbackValidation(agentResults);
    }
  }

  private fallbackValidation(agentResults: AgentResult[]): { discrepancies: Discrepancy[]; final_confidence: number; warnings: string[] } {
    const warnings: string[] = [];
    const discrepancies: Discrepancy[] = [];
    
    // Find individual agent results
    const arcaResult = agentResults.find(r => r.agent_name === 'arca');
    const vuceResult = agentResults.find(r => r.agent_name === 'vuce');
    const infolegResult = agentResults.find(r => r.agent_name === 'infoleg');
    
    // Calculate weighted confidence based on source quality
    let finalConfidence = 0.0;
    let totalWeight = 0.0;
    
    // ARCA contributes 60% to confidence (tariffs are most critical)
    if (arcaResult && arcaResult.status === 'success' && arcaResult.claims.length >= 3) {
      // ARCA has solid tariff data
      finalConfidence += arcaResult.confidence * 0.6;
      totalWeight += 0.6;
    } else if (arcaResult?.status === 'no_data') {
      warnings.push('ARCA: No hay datos de tarifas para esta NCM');
      totalWeight += 0.6; // Still count the weight but with 0 contribution
    } else {
      warnings.push('ARCA: Datos de tarifas incompletos');
      totalWeight += 0.3; // Partial weight
    }
    
    // VUCE contributes 25% to confidence
    if (vuceResult && vuceResult.status === 'success' && vuceResult.claims.length > 0) {
      finalConfidence += vuceResult.confidence * 0.25;
      totalWeight += 0.25;
    } else if (vuceResult?.status === 'no_data') {
      warnings.push('VUCE: No hay datos de intervenciones para esta NCM');
      totalWeight += 0.25;
    }
    
    // InfoLEG contributes 15% to confidence
    if (infolegResult && infolegResult.status === 'success' && infolegResult.claims.length > 0) {
      finalConfidence += infolegResult.confidence * 0.15;
      totalWeight += 0.15;
    } else if (infolegResult?.status === 'no_data') {
      warnings.push('InfoLEG: No hay normas relevantes para esta NCM');
      totalWeight += 0.15;
    }
    
    // Normalize confidence based on available weights
    if (totalWeight > 0) {
      finalConfidence = finalConfidence / totalWeight;
    }
    
    // Ensure minimum confidence if ARCA has solid data
    const arcaHasSolidData = arcaResult && arcaResult.status === 'success' && arcaResult.claims.length >= 3;
    if (arcaHasSolidData && finalConfidence < 0.5) {
      finalConfidence = 0.5; // Floor at 0.5 if ARCA has solid data
    }
    
    // Cap at 0.95 max (never claim 100% certainty)
    finalConfidence = Math.min(finalConfidence, 0.95);
    
    return { discrepancies, final_confidence: finalConfidence, warnings };
  }
}
