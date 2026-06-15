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
1. Detectar discrepancias REALES entre fuentes (valores numéricos diferentes para el mismo concepto)
2. Validar que los confidence scores sean justificados
3. Asegurar que no haya contradicciones
4. Generar warnings claros para el revisor humano
5. Calcular confidence final considerando la consistencia

## Reglas CRÍTICAS
1. SOLO reporta discrepancia si dos fuentes dan VALORES NUMÉRICOS DIFERENTES para el mismo concepto
   - Ejemplo CORRECTO: ARCA dice AEC 0% pero VUCE dice AEC 10.8% → DISCREPANCIA
   - Ejemplo INCORRECTO: ARCA dice AEC 0% pero InfoLEG menciona que existe el AEC → NO es discrepancia
   - Ejemplo INCORRECTO: ARCA dice AEC 0% y InfoLEG no menciona AEC → NO es discrepancia
2. Si un agente reporta status="no_data", la confidence final NO puede ser > 0.7
3. Si hay discrepancias HIGH, confidence final NO puede ser > 0.6
4. human_review_required SIEMPRE es true
5. downstream_allowed SIEMPRE es false

## Qué NO es discrepancia
- Un agente menciona un concepto y otro no lo menciona
- Un agente da un valor numérico y otro solo dice que "existe" sin valor
- Un agente tiene más detalles que otro

## Qué SÍ es discrepancia
- Dos agentes dan valores numéricos diferentes (ej: AEC 0% vs AEC 10.8%)
- Dos agentes contradicen explícitamente (ej: "no requiere SENASA" vs "requiere SENASA")

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
    // Simple rule-based fallback if Critic API fails
    const warnings: string[] = [];
    const discrepancies: Discrepancy[] = [];
    let finalConfidence = 1.0;

    const hasNoData = agentResults.some(r => r.status === 'no_data');
    if (hasNoData) {
      finalConfidence = Math.min(finalConfidence, 0.7);
      warnings.push('Al menos un agente no tiene datos para esta NCM');
    }

    const failedAgents = agentResults.filter(r => r.status === 'failed');
    if (failedAgents.length > 0) {
      finalConfidence = Math.min(finalConfidence, 0.5);
      warnings.push(`${failedAgents.length} agente(s) fallaron`);
    }

    const avgConfidence = agentResults.reduce((sum, r) => sum + r.confidence, 0) / agentResults.length;
    finalConfidence = Math.min(finalConfidence, avgConfidence);

    return { discrepancies, final_confidence: finalConfidence, warnings };
  }
}
