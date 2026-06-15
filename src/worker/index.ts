import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { RouterAgent } from '../agents/router-agent.js';

const app = new Hono<{
  Bindings: {
    DEEPSEEK_API_KEY: string;
    NORMATIVE_KV: KVNamespace;
  };
}>();

app.use('/*', cors({
  origin: ['https://vlatam-global.com', 'http://localhost:3000', '*'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

app.get('/api/health', (c) => c.json({ 
  status: 'ok', 
  service: 'vlatam-ai-lab-api',
  version: '0.5.0',
  architecture: 'specialized-agents-v1',
  timestamp: new Date().toISOString()
}));

// Main query endpoint
app.post('/api/v1/norms/query', async (c) => {
  try {
    const body = await c.req.json();
    const { 
      product_description, 
      candidate_ncm8, 
      origin_country = 'CN', 
      destination_country = 'AR' 
    } = body;

    if (!product_description || !candidate_ncm8) {
      return c.json({ 
        error: 'Missing required fields: product_description, candidate_ncm8',
        human_review_required: true,
        downstream_allowed: false
      }, 400);
    }

    const context = {
      product_description,
      candidate_ncm8,
      origin_country,
      destination_country,
      query_id: `query-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };

    const router = new RouterAgent(c.env.DEEPSEEK_API_KEY, c.env.NORMATIVE_KV);
    const result = await router.route(context);

    return c.json(result, 200);
  } catch (error: any) {
    console.error('API Error:', error);
    return c.json({ 
      error: 'Internal server error', 
      details: error.message,
      human_review_required: true,
      downstream_allowed: false,
      extracted_claims: [],
      unsupported_claims: [],
      discrepancies: [],
      warnings: ['API error occurred - human review required'],
      confidence: 0,
      query_metadata: {
        timestamp: new Date().toISOString(),
        model: 'deepseek-chat',
        agents_invoked: [],
        architecture_version: 'specialized-agents-v1',
      }
    }, 500);
  }
});

export default app;
