import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { RouterAgent } from '../agents/router-agent.js';

const app = new Hono<{
  Bindings: {
    DEEPSEEK_API_KEY: string;
    NORMATIVE_KV: KVNamespace;
    API_AUTH_TOKEN?: string;
  };
}>();

// Strict CORS - no wildcard
const ALLOWED_ORIGINS = [
  'https://vlatam-global.com',
  'https://vlatam-global.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use('/*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.get('/api/health', (c) => c.json({ 
  status: 'ok', 
  service: 'vlatam-ai-lab-api',
  version: '0.5.3',
  architecture: 'specialized-agents-v1',
  timestamp: new Date().toISOString()
}));

// Simple rate limiter using KV (per IP, 60 requests per minute)
async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;
  const current = await kv.get(key);
  const count = current ? parseInt(current) : 0;
  
  if (count >= 60) return false;
  
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
}

// Auth middleware
async function authenticate(c: any): Promise<boolean> {
  const authHeader = c.req.header('Authorization');
  const expectedToken = c.env.API_AUTH_TOKEN;
  
  // In production, require auth token (fail-closed)
  const isProduction = c.env.ENVIRONMENT === 'production';
  
  if (isProduction && !expectedToken) {
    // Fail closed: if no token configured in production, reject all requests
    return false;
  }
  
  // If no token configured (development), allow (backward compatibility)
  if (!expectedToken) return true;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  
  const token = authHeader.substring(7);
  return token === expectedToken;
}

// Request body size limit (10KB)
async function parseRequestBody(c: any): Promise<any> {
  const contentLength = parseInt(c.req.header('Content-Length') || '0');
  if (contentLength > 10240) {
    throw new Error('Request body too large (max 10KB)');
  }
  
  try {
    return await c.req.json();
  } catch (e) {
    throw new Error('Invalid JSON body');
  }
}

/**
 * Validate query input (C-02 fix)
 */
function validateQueryInput(body: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Body must be a JSON object'] };
  }
  
  // product_description: required string, max 500 chars
  if (!body.product_description || typeof body.product_description !== 'string') {
    errors.push('product_description is required and must be a string');
  } else if (body.product_description.length > 500) {
    errors.push('product_description must be 500 characters or less');
  } else if (body.product_description.length < 3) {
    errors.push('product_description must be at least 3 characters');
  }
  
  // candidate_ncm8: required string, must match NCM format
  if (!body.candidate_ncm8 || typeof body.candidate_ncm8 !== 'string') {
    errors.push('candidate_ncm8 is required and must be a string');
  } else {
    // NCM format: 4202.92.00 or 4202.92.00.110V or 42029200110V
    const ncmPattern = /^(\d{4}\.?\d{2}\.?\d{2}(\.\d{3}[A-Z])?|\d{8,12}[A-Z]?)$/;
    if (!ncmPattern.test(body.candidate_ncm8)) {
      errors.push('candidate_ncm8 must be a valid NCM code (e.g., 4202.92.00.110V)');
    }
  }
  
  // origin_country: optional, ISO 3166-1 alpha-2
  if (body.origin_country !== undefined) {
    if (typeof body.origin_country !== 'string' || !/^[A-Z]{2}$/.test(body.origin_country)) {
      errors.push('origin_country must be a 2-letter ISO country code (e.g., CN, US)');
    }
  }
  
  // destination_country: optional, ISO 3166-1 alpha-2
  if (body.destination_country !== undefined) {
    if (typeof body.destination_country !== 'string' || !/^[A-Z]{2}$/.test(body.destination_country)) {
      errors.push('destination_country must be a 2-letter ISO country code (e.g., AR, BR)');
    }
  }
  
  return { valid: errors.length === 0, errors };
}

// Main query endpoint
app.post('/api/v1/norms/query', async (c) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  try {
    // 1. Authenticate
    if (!await authenticate(c)) {
      return c.json({ 
        error: 'Unauthorized',
        message: 'Valid API token required',
        human_review_required: true,
        downstream_allowed: false
      }, 401);
    }
    
    // 2. Rate limit
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    if (!await checkRateLimit(c.env.NORMATIVE_KV, ip)) {
      return c.json({ 
        error: 'Too Many Requests',
        message: 'Rate limit exceeded (60 requests/minute)',
        human_review_required: true,
        downstream_allowed: false
      }, 429);
    }
    
    // 3. Parse and validate body
    let body: any;
    try {
      body = await parseRequestBody(c);
    } catch (e: any) {
      return c.json({ 
        error: 'Bad Request',
        message: e.message,
        human_review_required: true,
        downstream_allowed: false
      }, 400);
    }
    
    // 4. Validate input schema (C-02 fix)
    const validation = validateQueryInput(body);
    if (!validation.valid) {
      return c.json({ 
        error: 'Validation Error',
        message: validation.errors.join(', '),
        human_review_required: true,
        downstream_allowed: false
      }, 400);
    }
    
    const { product_description, candidate_ncm8, origin_country, destination_country } = body;
    
    const context = {
      product_description,
      candidate_ncm8,
      origin_country: origin_country || 'CN',
      destination_country: destination_country || 'AR',
      query_id: requestId,
      timestamp: new Date().toISOString(),
    };
    
    const router = new RouterAgent(c.env.DEEPSEEK_API_KEY, c.env.NORMATIVE_KV);
    const result = await router.route(context);
    
    return c.json(result, 200);
  } catch (error: any) {
    // H-02 fix: Don't leak internal error details
    console.error(`[${requestId}] Error:`, error.message);
    
    return c.json({ 
      error: 'Internal Server Error',
      request_id: requestId,
      human_review_required: true,
      downstream_allowed: false,
      extracted_claims: [],
      unsupported_claims: [],
      discrepancies: [],
      warnings: ['An internal error occurred. Request logged for review.'],
      confidence: 0,
      query_metadata: {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        model: 'deepseek-chat',
        agents_invoked: [],
        architecture_version: 'specialized-agents-v1',
      }
    }, 500);
  }
});

export default app;
