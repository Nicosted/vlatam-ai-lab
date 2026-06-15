/**
 * vLatam AI Lab Normative Intelligence API
 * Exposes the DeepSeek agent as a REST endpoint for vlatam-global.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import OpenAI from 'openai';

// Hono is a lightweight web framework perfect for Cloudflare Workers
// pnpm add hono

const app = new Hono<{
  Bindings: {
    DEEPSEEK_API_KEY: string;
    NORMATIVE_KV: KVNamespace;
  };
}>();

// Enable CORS for vlatam-global frontend
app.use('/*', cors({
  origin: ['https://vlatam-global.com', 'http://localhost:3000', 'http://localhost:5173'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/api/health', (c) => c.json({ 
  status: 'ok', 
  service: 'vlatam-ai-lab-api',
  version: '0.3.0',
  timestamp: new Date().toISOString()
}));

// Main query endpoint
app.post('/api/v1/norms/query', async (c) => {
  try {
    const body = await c.req.json();
    const { product_description, candidate_ncm8, origin_country = 'CN', destination_country = 'AR' } = body;

    if (!product_description || !candidate_ncm8) {
      return c.json({ 
        error: 'Missing required fields', 
        required: ['product_description', 'candidate_ncm8'],
        human_review_required: true,
        downstream_allowed: false
      }, 400);
    }

    // 1. Fetch indexes first (small, fast)
    const [arcaIndexRaw, infolegIndexRaw, vuceIndexRaw] = await Promise.all([
      c.env.NORMATIVE_KV.get('arca:index'),
      c.env.NORMATIVE_KV.get('infoleg:index'),
      c.env.NORMATIVE_KV.get('vuce:index')
    ]);

    if (!arcaIndexRaw) {
      return c.json({ 
        error: 'ARCA not synced. Run: pnpm run sync:kv',
        human_review_required: true,
        downstream_allowed: false
      }, 500);
    }

    const arcaIndex = JSON.parse(arcaIndexRaw);
    const infolegIndex = infolegIndexRaw ? JSON.parse(infolegIndexRaw) : { types: [] };
    const vuceIndex = vuceIndexRaw ? JSON.parse(vuceIndexRaw) : { positions: [] };

    // 2. Fetch only the relevant ARCA chapter (fast!)
    const ncmClean = candidate_ncm8.replace(/\./g, '');
    const chapter = ncmClean.substring(0, 2);
    const chapterRaw = await c.env.NORMATIVE_KV.get(`arca:chapter:${chapter}`);

    let arcaLine: any = null;
    if (chapterRaw) {
      const chapterData = JSON.parse(chapterRaw);
      arcaLine = chapterData.lines.find((l: any) => 
        l.ncm_code_clean === ncmClean || 
        l.ncm_code_clean.startsWith(ncmClean.substring(0, 8))
      );
      
      // Fallback to HS6
      if (!arcaLine) {
        const hs6 = ncmClean.substring(0, 6);
        arcaLine = chapterData.lines.find((l: any) => l.ncm_code_clean.startsWith(hs6));
      }
    }

    if (!arcaLine) {
      return c.json({ 
        error: `NCM ${candidate_ncm8} not found`,
        suggestion: 'Verify NCM code or check ARCA database',
        human_review_required: true,
        downstream_allowed: false
      }, 404);
    }

    // 3. Fetch VUCE notes for this position
    const vuceNotes: any[] = [];
    for (const pos of vuceIndex.positions) {
      if (pos.replace(/\./g, '').includes(ncmClean) || pos.startsWith(ncmClean.substring(0, 8))) {
        const posKey = pos.replace(/\./g, '-');
        const noteRaw = await c.env.NORMATIVE_KV.get(`vuce:position:${posKey}`);
        if (noteRaw) vuceNotes.push(JSON.parse(noteRaw));
      }
    }

    // 4. Fetch relevant InfoLEG norms (limited per type)
    const infolegNorms: any[] = [];
    for (const type of infolegIndex.types.slice(0, 3)) {
      const typeRaw = await c.env.NORMATIVE_KV.get(`infoleg:type:${type}`);
      if (typeRaw) {
        const typeData = JSON.parse(typeRaw);
        infolegNorms.push(...typeData.norms.slice(0, 2));
      }
    }
    
    // Build evidence text for the prompt
    const evidenceContext = `
[ARANCEL OFICIAL - ARCA]
NCM: ${arcaLine.ncm_code}
Descripción: ${arcaLine.description}
AEC: ${arcaLine.aec_rate ?? 'N/A'}% | Extra-zona: ${arcaLine.derecho_extra_zona ?? 'N/A'}% | Estadística: ${arcaLine.tasa_estadistica ?? 'N/A'}% | IVA: ${arcaLine.iva_rate ?? 'N/A'}%

[VUCE INTERVENCIONES]
${vuceNotes.length > 0 ? vuceNotes.map((v: any) => `Posición: ${v.position}
Intervenciones: ${(v.interventions || []).join(', ')}
Normas: ${(v.norms_cited || []).join(', ')}`).join('\n---\n') : 'No se encontraron intervenciones VUCE específicas para esta NCM.'}

[BASE LEGAL - INFOLEG]
${infolegNorms.slice(0, 3).map((n: any) => `${n.tipo_norma} ${n.numero}: ${n.titulo}`).join('\n') || 'Decreto 557/2023 (Aprobación NCM VII Enmienda)'}
`;

    // 3. Call DeepSeek API
    const client = new OpenAI({
      apiKey: c.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com',
    });

    const systemPrompt = `You are the Normative Evidence Agent for vLatam Global. 
Rules: 
1. Answer ONLY using the provided evidence context. 
2. If evidence is insufficient, state it clearly in 'unsupported_claims'. 
3. NEVER invent tariffs, norms, or requirements. 
4. Always return valid JSON matching the requested schema.
5. human_review_required must ALWAYS be true.
6. downstream_allowed must ALWAYS be false.

Response format:
{
  "extracted_claims": [{"claim_type": "tariff|intervention|legal", "claim_text": "...", "evidence_reference": "...", "confidence": 0.8}],
  "unsupported_claims": [{"claim_text": "...", "reason": "..."}],
  "warnings": ["..."],
  "confidence": 0.0-1.0,
  "human_review_required": true,
  "downstream_allowed": false
}`;

    const userPrompt = `Producto: "${product_description}"
NCM Candidata: ${candidate_ncm8}
Origen: ${origin_country} -> Destino: ${destination_country}

Evidencia Oficial:
${evidenceContext}

Genera el JSON con claims extraídos, unsupported claims, warnings, y confidence.`;

    const response = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const firstChoice = response.choices[0];
    if (!firstChoice || !firstChoice.message.content) {
      return c.json({ 
        error: 'No response from DeepSeek API',
        human_review_required: true,
        downstream_allowed: false
      }, 500);
    }

    const result = JSON.parse(firstChoice.message.content);

    // 4. Enforce governance invariants (safety net)
    result.human_review_required = true;
    result.downstream_allowed = false;
    result.query_metadata = {
      ncm: candidate_ncm8,
      product_description,
      origin_country,
      destination_country,
      timestamp: new Date().toISOString(),
      model: 'deepseek-chat'
    };

    return c.json(result, 200);

  } catch (error: any) {
    console.error('API Error:', error);
    return c.json({ 
      error: 'Internal server error', 
      details: error.message,
      human_review_required: true,
      downstream_allowed: false 
    }, 500);
  }
});

export default app;
