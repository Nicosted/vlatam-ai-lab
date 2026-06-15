/**
 * Router Agent - Orchestrates specialized agents
 * 
 * Responsibilities:
 * - Receive client query
 * - Fetch relevant data from KV for each source
 * - Invoke specialized agents in parallel
 * - Combine results
 * - Invoke Critic Agent for validation
 * - Return final response
 */

import { ArcaAgent } from './arca-agent.js';
import { VuceAgent } from './vuce-agent.js';
import { InfolegAgent } from './infoleg-agent.js';
import { CriticAgent } from './critic-agent.js';
import { AgentContext, AgentResult, FinalResponse } from './types.js';
import { EmbeddingService } from '../utils/embedding-service.js';

const NCM_PATTERN = /^(\d{4}\.?\d{2}\.?\d{2}(\.\d{3}[A-Z]?)?|\d{8}(\d{3}[A-Z]?)?)$/i;

function normalizeNcm(ncm: string): string | null {
  const trimmed = ncm.trim().toUpperCase();
  if (!NCM_PATTERN.test(trimmed)) return null;
  return trimmed.replace(/\./g, '');
}

function formatArcaLine(line: any): string {
  const ivaAssumption = line.iva_is_inferred ? ' (inferido, tasa general por defecto)' : '';
  return `[ARANCEL OFICIAL - ARCA]
NCM: ${line.ncm_code}
Descripción: ${line.description}
AEC: ${line.aec_rate ?? 'N/A'}%
Derecho Extra-zona: ${line.derecho_extra_zona ?? 'N/A'}%
Tasa Estadística: ${line.tasa_estadistica ?? 'N/A'}%
IVA: ${line.iva_rate ?? 'N/A'}%${ivaAssumption}`;
}

function normContainsNcm(norm: any, ncmClean: string): boolean {
  const ncm8 = ncmClean.substring(0, 8);
  const hs6 = ncmClean.substring(0, 6);
  const hs4 = ncmClean.substring(0, 4);
  const ncmDotted = `${ncm8.substring(0, 4)}.${ncm8.substring(4, 6)}.${ncm8.substring(6, 8)}`;
  const hs6Dotted = `${hs6.substring(0, 4)}.${hs6.substring(4, 6)}`;
  const searchable = [
    norm.numero,
    norm.titulo,
    norm.texto,
    norm.relevance_reason,
  ].filter(Boolean).join(' ').toUpperCase();

  return [
    ncmClean,
    ncm8,
    ncmDotted,
    hs6,
    hs6Dotted,
    `NCM ${hs4}`,
    `POSICION ${hs4}`,
    `POSICIÓN ${hs4}`,
  ].some(term => searchable.includes(term.toUpperCase()));
}

export class RouterAgent {
  private arcaAgent: ArcaAgent;
  private vuceAgent: VuceAgent;
  private infolegAgent: InfolegAgent;
  private criticAgent: CriticAgent;
  private kv: KVNamespace;
  private embeddingService: EmbeddingService;
  private vectorize: { arca?: VectorizeIndex; infoleg?: VectorizeIndex; vuce?: VectorizeIndex } | undefined;

  constructor(
    apiKey: string,
    kv: KVNamespace,
    vectorize?: { arca?: VectorizeIndex; infoleg?: VectorizeIndex; vuce?: VectorizeIndex },
    aiBinding?: Ai
  ) {
    this.arcaAgent = new ArcaAgent(apiKey);
    this.vuceAgent = new VuceAgent(apiKey);
    this.infolegAgent = new InfolegAgent(apiKey);
    this.criticAgent = new CriticAgent(apiKey);
    this.kv = kv;
    this.vectorize = vectorize;
    this.embeddingService = new EmbeddingService({
      accountId: '',
      apiToken: '',
      aiBinding,
    });
  }

  async route(context: AgentContext): Promise<FinalResponse> {
    // 1. Fetch data from KV with optional RAG fallback
    const [arcaEvidence, vuceEvidence, infolegEvidence] = await Promise.all([
      this.fetchArcaEvidenceWithRAG(context.candidate_ncm8, context.product_description),
      this.fetchVuceEvidenceWithRAG(context.candidate_ncm8, context.product_description),
      this.fetchInfolegEvidenceWithRAG(context.candidate_ncm8, context.product_description),
    ]);

    // 2. Invoke specialized agents in parallel
    const [arcaResult, vuceResult, infolegResult] = await Promise.all([
      this.arcaAgent.analyze(context, arcaEvidence),
      this.vuceAgent.analyze(context, vuceEvidence),
      this.infolegAgent.analyze(context, infolegEvidence),
    ]);

    const agentResults = [arcaResult, vuceResult, infolegResult];

    // 3. Critic validates consistency
    const criticism = await this.criticAgent.validate(context, agentResults);

    // 4. Combine results
    const allClaims = agentResults.flatMap(r => r.claims);
    const allUnsupported = agentResults.flatMap(r => r.unsupported_claims);
    const allWarnings = [
      ...agentResults.flatMap(r => r.warnings),
      ...criticism.warnings,
    ];

    const agentsInvoked = agentResults
      .filter(r => r.status !== 'failed')
      .map(r => r.agent_name);

    return {
      extracted_claims: allClaims,
      unsupported_claims: allUnsupported,
      discrepancies: criticism.discrepancies,
      warnings: allWarnings,
      confidence: criticism.final_confidence,
      human_review_required: true,
      downstream_allowed: false,
      query_metadata: {
        ncm: context.candidate_ncm8,
        product_description: context.product_description,
        origin_country: context.origin_country,
        destination_country: context.destination_country,
        timestamp: context.timestamp,
        model: 'deepseek-chat',
        agents_invoked: agentsInvoked,
        architecture_version: 'specialized-agents-v1',
      },
    };
  }

  private async fetchArcaEvidenceWithRAG(ncm: string, productDescription: string): Promise<string> {
    const exactMatch = await this.fetchArcaEvidence(ncm);
    if (exactMatch && !exactMatch.startsWith('NO HAY') && !exactMatch.startsWith('ERROR')) {
      return exactMatch;
    }
    if (!this.vectorize?.arca || !this.embeddingService) return exactMatch;
    try {
      const { embedding } = await this.embeddingService.embed(`NCM ${ncm}. ${productDescription}`);
      const results = await this.vectorize.arca.query(embedding, { topK: 5, returnMetadata: 'all' });
      if (!results.matches?.length) return exactMatch;
      return results.matches.map((m: VectorizeMatch) => {
        const meta = m.metadata as any;
        return `[ARANCEL OFICIAL - ARCA] (Relevancia: ${((m.score ?? 0) * 100).toFixed(1)}%)
NCM: ${meta?.ncm_code ?? m.id}
AEC: ${meta?.aec_rate ?? 'N/A'}%
Derecho Extra-zona: ${meta?.derecho_extra_zona ?? 'N/A'}%
Tasa Estadística: ${meta?.tasa_estadistica ?? 'N/A'}%
IVA: ${meta?.iva_rate ?? 'N/A'}%`;
      }).join('\n\n');
    } catch {
      return exactMatch;
    }
  }

  private async fetchVuceEvidenceWithRAG(ncm: string, productDescription: string): Promise<string> {
    const exactMatch = await this.fetchVuceEvidence(ncm);
    if (exactMatch && exactMatch.trim() !== '' && !exactMatch.startsWith('ERROR')) return exactMatch;
    if (!this.vectorize?.vuce) return exactMatch;
    try {
      const { embedding } = await this.embeddingService.embed(`NCM ${ncm}. ${productDescription}`);
      const results = await this.vectorize.vuce.query(embedding, { topK: 5, returnMetadata: 'all' });
      if (!results.matches?.length) return exactMatch;
      return results.matches.map((m: VectorizeMatch) => {
        const meta = m.metadata as any;
        return `[VUCE - Posición ${meta?.position ?? m.id}] (Relevancia: ${((m.score ?? 0) * 100).toFixed(1)}%)
Intervenciones: ${meta?.interventions?.join(', ') || 'No listadas'}
Normas citadas: ${meta?.norms_cited?.join(', ') || 'Ninguna'}`;
      }).join('\n\n');
    } catch {
      return exactMatch;
    }
  }

  private async fetchInfolegEvidenceWithRAG(ncm: string, productDescription: string): Promise<string> {
    const exactMatch = await this.fetchInfolegEvidence(ncm);
    if (exactMatch && exactMatch.trim() !== '' && !exactMatch.startsWith('ERROR') && !exactMatch.startsWith('NO SE')) return exactMatch;
    if (!this.vectorize?.infoleg) return exactMatch;
    try {
      const { embedding } = await this.embeddingService.embed(`NCM ${ncm}. ${productDescription}`);
      const results = await this.vectorize.infoleg.query(embedding, { topK: 5, returnMetadata: 'all' });
      if (!results.matches?.length) return exactMatch;
      return results.matches.map((m: VectorizeMatch) => {
        const meta = m.metadata as any;
        return `[INFOLEG - ${meta?.tipo_norma ?? ''} ${meta?.numero ?? m.id}] (Relevancia: ${((m.score ?? 0) * 100).toFixed(1)}%)
Fecha: ${meta?.fecha ?? 'N/A'}
Título: ${meta?.titulo ?? 'N/A'}`;
      }).join('\n\n');
    } catch {
      return exactMatch;
    }
  }

  private async fetchArcaEvidence(ncm: string): Promise<string> {
    try {
      const ncmClean = normalizeNcm(ncm);
      if (!ncmClean) return 'NO HAY DATOS ARCA PARA ESTA NCM';

      const chapter = ncmClean.substring(0, 2);
      const heading = ncmClean.substring(0, 4);
      const chapterRaw = await this.kv.get(`arca:chapter:${chapter}`);
      const arcaRaw = chapterRaw ?? await this.kv.get(`arca:heading:${heading}`);
      
      if (!arcaRaw) return 'NO HAY DATOS ARCA PARA ESTA NCM';
      
      const chapterData = JSON.parse(arcaRaw);
      
      // Try multiple matching strategies for NCMs with long suffixes
      let line = chapterData.lines.find((l: any) => 
        l.ncm_code_clean === ncmClean // Exact match
      );
      
      if (!line) {
        line = chapterData.lines.find((l: any) => 
          l.ncm_code_clean.startsWith(ncmClean.substring(0, 12)) // 12-char prefix (with suffix)
        );
      }
      
      if (!line) {
        line = chapterData.lines.find((l: any) => 
          l.ncm_code_clean.startsWith(ncmClean.substring(0, 10)) // 10-char prefix
        );
      }
      
      if (!line) {
        line = chapterData.lines.find((l: any) => 
          l.ncm_code_clean.startsWith(ncmClean.substring(0, 8)) // 8-char prefix (NCM base)
        );
      }
      
      if (!line) {
        // Fallback to HS6
        const hs6 = ncmClean.substring(0, 6);
        const matches = chapterData.lines.filter((l: any) => 
          l.ncm_code_clean.startsWith(hs6)
        );
        if (matches.length === 0) return 'NO HAY DATOS ARCA PARA ESTA NCM';
        
        return `[ARANCEL OFICIAL - ARCA - Capítulo ${chapter}]
NCMs relacionados encontrados:
${matches.slice(0, 5).map((l: any) => 
  `- ${l.ncm_code}: ${l.description}\n  AEC: ${l.aec_rate ?? 'N/A'}% | EZ: ${l.derecho_extra_zona ?? 'N/A'}% | Estad: ${l.tasa_estadistica ?? 'N/A'}% | IVA: ${l.iva_rate ?? 'N/A'}%${l.iva_is_inferred ? ' (inferido)' : ''}` 
).join('\n')}`;
      }
      
      return formatArcaLine(line);
    } catch (error) {
      console.error('RouterAgent: ARCA source retrieval failed', error);
      return 'ERROR: Source retrieval failed for ARCA';
    }
  }

  private async fetchVuceEvidence(ncm: string): Promise<string> {
    try {
      const ncmClean = normalizeNcm(ncm);
      if (!ncmClean) return '';

      const indexRaw = await this.kv.get('vuce:index');
      if (!indexRaw) return '';
      
      const index = JSON.parse(indexRaw);
      
      const matchingPositions = index.positions.filter((pos: string) => 
        pos.replace(/\./g, '').includes(ncmClean) || 
        pos.startsWith(ncmClean.substring(0, 8))
      );
      
      if (matchingPositions.length === 0) return '';
      
      const notes = await Promise.all(
        matchingPositions.map(async (pos: string) => {
          const posKey = pos.replace(/\./g, '-');
          const noteRaw = await this.kv.get(`vuce:position:${posKey}`);
          return noteRaw ? JSON.parse(noteRaw) : null;
        })
      );
      
      const validNotes = notes.filter(Boolean);
      if (validNotes.length === 0) return '';
      
      return validNotes.map((n: any) => 
        `[VUCE - Posición ${n.position}]
Intervenciones: ${n.interventions?.join(', ') || 'No listadas'}
Normas citadas: ${n.norms_cited?.join(', ') || 'Ninguna'}
Tarifas observadas: ${n.tariffs_noted?.join(', ') || 'N/A'}
Observaciones: ${n.observations || 'N/A'}`
      ).join('\n\n');
    } catch (error) {
      console.error('RouterAgent: VUCE source retrieval failed', error);
      return 'ERROR: Source retrieval failed for VUCE';
    }
  }

  private async fetchInfolegEvidence(ncm: string): Promise<string> {
    try {
      const ncmClean = normalizeNcm(ncm);
      if (!ncmClean) return 'NO HAY DATOS INFOLEG PARA ESTA NCM';

      const indexRaw = await this.kv.get('infoleg:index');
      if (!indexRaw) return '';
      
      const index = JSON.parse(indexRaw);
      const norms: any[] = [];
      
      for (const type of index.types) {
        const typeRaw = await this.kv.get(`infoleg:type:${type}`);
        if (typeRaw) {
          const typeData = JSON.parse(typeRaw);
          norms.push(...(typeData.norms || []));
        }
      }
      
      if (norms.length === 0) return 'NO HAY DATOS INFOLEG PARA ESTA NCM';

      const matchingNorms = norms
        .filter(norm => normContainsNcm(norm, ncmClean))
        .slice(0, 6);

      if (matchingNorms.length === 0) {
        return `NO SE ENCONTRARON NORMAS INFOLEG ESPECÍFICAS PARA LA NCM ${ncm}`;
      }
      
      return matchingNorms.map((n: any) => 
        `[INFOLEG - ${n.tipo_norma} ${n.numero}]
Fecha: ${n.fecha}
Título: ${n.titulo}
Extracto: ${n.texto?.substring(0, 300) || 'N/A'}...`
      ).join('\n\n');
    } catch (error) {
      console.error('RouterAgent: InfoLEG source retrieval failed', error);
      return 'ERROR: Source retrieval failed for InfoLEG';
    }
  }
}
