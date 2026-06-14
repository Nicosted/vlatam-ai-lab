import { readFileSync } from 'fs';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import dotenv from 'dotenv';
import { validateExtractionResult } from '../utils/schema-validator.js';

dotenv.config();

const SYSTEM_PROMPT = `You are the Normative Evidence Agent for vLatamGlobal AI Lab.

You are not the source of truth. You may only answer using the retrieved official documents provided in context.

## Rules
1. Never invent legal, customs, tariff, sanitary, technical, or classification requirements.
2. Every normative statement must cite a source from the evidence packet.
3. Distinguish international HS evidence, MERCOSUR NCM/AEC evidence, and Argentina domestic evidence.
4. If evidence is missing, outdated, ambiguous, or not official, return extraction_status="validation_failed" with empty extracted_claims.
5. Do not issue final customs classification, final legal advice, or binding rulings.
6. ALWAYS set human_review_required=true and downstream_allowed=false.
7. Return valid JSON ONLY, following the exact schema below.
8. Prefer exact article, note, heading, subheading, annex, and effective-date references.
9. If a source conflicts with another source, report the conflict in unsupported_claims.
10. Never use external knowledge. Only use the evidence packet provided.

## Required JSON Structure
You MUST return a JSON object with EXACTLY these fields (no more, no less):

{
  "extraction_result_id": "ai-extraction-result-{packet_id}-{timestamp}",
  "extraction_job_id": "extraction-job-{packet_id}-{timestamp}",
  "evidence_packet_id": "{packet_id from input}",
  "review_manifest_id": "review-manifest-{packet_id}-{timestamp}",
  "snapshot_id": "{snapshot_id from first evidence_ref or 'unknown'}",
  "source_id": "{source_id from first evidence_ref or 'unknown'}",
  "provider_id": "deepseek-chat",
  "model_id": "deepseek-chat",
  "extraction_status": "draft_unreviewed" | "critique_flagged" | "validation_failed" | "provider_failed",
  "extracted_claims": [
    {
      "claim_id": "claim-{number}",
      "claim_text": "Description of what the evidence supports",
      "evidence_reference": "{source_id}:{snapshot_id}:{section_label}",
      "support_status": "supported_by_packet" | "unsupported" | "needs_human_review",
      "confidence": 0.0 to 1.0
    }
  ],
  "unsupported_claims": [
    {
      "claim_id": "unsupported-{number}",
      "claim_text": "What cannot be concluded",
      "reason": "Why this cannot be concluded from the evidence",
      "evidence_reference": "{source_id}:{snapshot_id} or omit if not applicable"
    }
  ],
  "warnings": [
    "Warning message 1",
    "Warning message 2"
  ],
  "confidence": 0.0 to 1.0,
  "critic_summary": "Brief summary of extraction quality and limitations",
  "human_review_required": true,
  "downstream_allowed": false,
  "created_at": "2026-06-14T16:37:27.032Z",
  "contract_version": "1.0.0",
  "schema_version": "1.0.0"
}

## Field Descriptions
- extraction_result_id: Unique ID for this extraction result
- extraction_job_id: ID of the extraction job
- evidence_packet_id: ID from the input evidence packet
- review_manifest_id: ID for the review manifest (generate if not provided)
- snapshot_id: ID from the first evidence_ref in the packet
- source_id: ID from the first evidence_ref in the packet
- provider_id: "deepseek-chat" (fixed)
- model_id: "deepseek-chat" (fixed)
- extraction_status: One of the enum values
- extracted_claims: Array of claims supported by evidence (can be empty if insufficient evidence)
- unsupported_claims: Array of claims that cannot be made (can be empty)
- warnings: Array of warning strings
- confidence: Overall confidence score 0-1
- critic_summary: Brief text summary
- human_review_required: ALWAYS true
- downstream_allowed: ALWAYS false
- created_at: ISO 8601 timestamp
- contract_version: "1.0.0" (fixed)
- schema_version: "1.0.0" (fixed)

## Important
- Do NOT add any fields not listed above
- Do NOT rename any fields
- Use EXACTLY the field names shown
- If evidence is insufficient, set extraction_status="validation_failed" and return empty extracted_claims array
- ALWAYS include all required fields, even if empty arrays or default values`;

export class NormativeEvidenceAgent {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY not found in .env');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://api.deepseek.com',
    });
  }

  async extract(evidencePacketPath: string): Promise<any> {
    console.log(`🤖 Iniciando extracción normativa...`);
    console.log(`📦 Leyendo evidence packet: ${evidencePacketPath}`);

    // 1. Leer evidence packet
    const packet = JSON.parse(readFileSync(evidencePacketPath, 'utf-8'));
    console.log(`📋 Producto: ${packet.product_description}`);
    console.log(`📚 Evidencias: ${packet.evidence_refs?.length || 0} referencias`);

    // 2. Construir contexto
    const context = this.buildContext(packet);

    // 3. Llamar a DeepSeek
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `
Evidence Packet:
${JSON.stringify(packet, null, 2)}

Context from sources:
${context}

Generate an ai-extraction-result JSON with:
- human_review_required: true
- downstream_allowed: false
- insufficient_evidence: true if evidence is missing
- Do not invent norms, only use provided evidence
`
      }
    ];

    console.log(`🧠 Llamando a DeepSeek...`);

    const response = await this.client.chat.completions.create({
      model: 'deepseek-chat',
      messages: messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    // 4. Parsear respuesta con defensa
    let result: Record<string, unknown>;
    try {
      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response choice from DeepSeek');
      }
      const content = choice.message.content;
      if (!content) {
        throw new Error('Empty response from DeepSeek');
      }
      result = JSON.parse(content);
    } catch (parseError) {
      const error = parseError as Error;
      console.error('❌ Error parseando respuesta de DeepSeek:', error.message);
      return this.createErrorResult(packet.packet_id, error.message);
    }

    // 5. Forzar campos de salida según schema (override cualquier valor de DeepSeek)
    // Usar nombres de campo EXACTOS del schema ai-extraction-result
    result.human_review_required = true;
    result.downstream_allowed = false;
    result.provider_id = 'deepseek-chat';
    result.model_id = 'deepseek-chat';
    result.created_at = new Date().toISOString();

    // Mapear campos legacy si existen
    if (result.model && !result.model_id) {
      result.model_id = result.model as string;
      delete result.model;
    }

    // Asegurar extraction_result_id
    if (!result.extraction_result_id) {
      result.extraction_result_id = `ai-extraction-result-${packet.packet_id}-${Date.now()}`;
    }

    // Asegurar evidence_packet_id
    if (!result.evidence_packet_id) {
      result.evidence_packet_id = packet.packet_id;
    }

    // 6. Validar contra schema
    const validation = validateExtractionResult(result);
    if (!validation.valid) {
      console.error('❌ Validación fallida:', validation.errors);
      result.extraction_status = 'validation_failed';
      // Store validation errors in metadata (not in result to avoid additionalProperties violation)
      console.error('   Validation errors stored in console log only');
    }

    console.log(`✅ Extracción completada: ${result.extraction_result_id}`);

    return result;
  }

  private createErrorResult(packetId: string, errorMessage: string): Record<string, unknown> {
    const timestamp = Date.now();
    return {
      extraction_result_id: `ai-extraction-result-${packetId}-${timestamp}`,
      extraction_job_id: `extraction-job-${packetId}-${timestamp}`,
      evidence_packet_id: packetId,
      review_manifest_id: `review-manifest-${packetId}-${timestamp}`,
      snapshot_id: 'unknown',
      source_id: 'unknown',
      provider_id: 'deepseek-chat',
      model_id: 'deepseek-chat',
      extraction_status: 'provider_failed',
      extracted_claims: [],
      unsupported_claims: [
        {
          claim_id: 'unsupported-parsing-001',
          claim_text: 'Failed to parse DeepSeek JSON response',
          reason: errorMessage,
          evidence_reference: 'N/A'
        }
      ],
      warnings: ['JSON parsing failed', 'Re-run extraction or inspect raw LLM output'],
      confidence: 0,
      critic_summary: 'JSON parsing failed. No valid extraction possible.',
      human_review_required: true,
      downstream_allowed: false,
      created_at: new Date().toISOString(),
      contract_version: '1.0.0',
      schema_version: '1.0.0'
    };
  }

  private buildContext(packet: any): string {
    if (!packet.evidence_refs || packet.evidence_refs.length === 0) {
      return 'No evidence references provided.';
    }

    return packet.evidence_refs.map((ref: any, idx: number) => {
      return `
[EVIDENCE ${idx + 1}]
Source ID: ${ref.source_id || 'N/A'}
Snapshot ID: ${ref.snapshot_id || 'N/A'}
Section: ${ref.section_label || 'N/A'}
Article: ${ref.article_number || 'N/A'}
Excerpt: ${ref.excerpt || 'N/A'}
---`;
    }).join('\n');
  }
}
