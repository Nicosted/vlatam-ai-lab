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

export class RouterAgent {
  private arcaAgent: ArcaAgent;
  private vuceAgent: VuceAgent;
  private infolegAgent: InfolegAgent;
  private criticAgent: CriticAgent;
  private kv: KVNamespace;

  constructor(apiKey: string, kv: KVNamespace) {
    this.arcaAgent = new ArcaAgent(apiKey);
    this.vuceAgent = new VuceAgent(apiKey);
    this.infolegAgent = new InfolegAgent(apiKey);
    this.criticAgent = new CriticAgent(apiKey);
    this.kv = kv;
  }

  async route(context: AgentContext): Promise<FinalResponse> {
    // 1. Fetch data from KV (in parallel)
    const [arcaEvidence, vuceEvidence, infolegEvidence] = await Promise.all([
      this.fetchArcaEvidence(context.candidate_ncm8),
      this.fetchVuceEvidence(context.candidate_ncm8),
      this.fetchInfolegEvidence(context.candidate_ncm8),
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

  private async fetchArcaEvidence(ncm: string): Promise<string> {
    try {
      const ncmClean = ncm.replace(/\./g, '');
      const chapter = ncmClean.substring(0, 2);
      const chapterRaw = await this.kv.get(`arca:chapter:${chapter}`);
      
      if (!chapterRaw) return 'NO HAY DATOS ARCA PARA ESTA NCM';
      
      const chapterData = JSON.parse(chapterRaw);
      
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
  `- ${l.ncm_code}: ${l.description}\n  AEC: ${l.aec_rate ?? 'N/A'}% | EZ: ${l.derecho_extra_zona ?? 'N/A'}% | Estad: ${l.tasa_estadistica ?? 'N/A'}% | IVA: ${l.iva_rate ?? 'N/A'}%` 
).join('\n')}`;
      }
      
      return `[ARANCEL OFICIAL - ARCA]
NCM: ${line.ncm_code}
Descripción: ${line.description}
AEC: ${line.aec_rate ?? 'N/A'}%
Derecho Extra-zona: ${line.derecho_extra_zona ?? 'N/A'}%
Tasa Estadística: ${line.tasa_estadistica ?? 'N/A'}%
IVA: ${line.iva_rate ?? 'N/A'}%`;
    } catch (error) {
      return 'ERROR AL RECUPERAR DATOS ARCA';
    }
  }

  private async fetchVuceEvidence(ncm: string): Promise<string> {
    try {
      const indexRaw = await this.kv.get('vuce:index');
      if (!indexRaw) return '';
      
      const index = JSON.parse(indexRaw);
      const ncmClean = ncm.replace(/\./g, '');
      
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
      return '';
    }
  }

  private async fetchInfolegEvidence(ncm: string): Promise<string> {
    try {
      const indexRaw = await this.kv.get('infoleg:index');
      if (!indexRaw) return '';
      
      const index = JSON.parse(indexRaw);
      const norms: any[] = [];
      
      for (const type of index.types.slice(0, 3)) {
        const typeRaw = await this.kv.get(`infoleg:type:${type}`);
        if (typeRaw) {
          const typeData = JSON.parse(typeRaw);
          norms.push(...typeData.norms.slice(0, 2));
        }
      }
      
      if (norms.length === 0) return '';
      
      return norms.map((n: any) => 
        `[INFOLEG - ${n.tipo_norma} ${n.numero}]
Fecha: ${n.fecha}
Título: ${n.titulo}
Extracto: ${n.texto?.substring(0, 300) || 'N/A'}...`
      ).join('\n\n');
    } catch (error) {
      return '';
    }
  }
}
