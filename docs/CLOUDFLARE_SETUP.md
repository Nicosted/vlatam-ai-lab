# Cloudflare Workers API Setup Guide

> **RETIRED (2026-07-13).** The Cloudflare Worker (`src/worker/index.ts`),
> `wrangler.toml`, the KV sync script, and the Workers AI embedding scripts
> were removed by the governed-execution-boundary PR. This guide is retained
> as historical documentation only; none of the commands below work in the
> current repository, and re-deploying a direct-provider Worker is forbidden
> by `tests/architecture/execution-boundary.test.ts`.

This guide walks you through deploying the Normative Evidence Agent as a Cloudflare Workers REST API.

## Prerequisites

- Cloudflare account (free tier works)
- DeepSeek API key
- Local environment with parsed normative data (ARCA, InfoLEG, VUCE)

## Step 1: Authenticate with Cloudflare

```bash
pnpm wrangler login
```

This will open a browser window to authorize Wrangler CLI with your Cloudflare account.

## Step 2: Create KV Namespace

```bash
pnpm wrangler kv:namespace create "NORMATIVE_KV"
```

**Output will look like:**
```
🌀 Creating namespace with title "NORMATIVE_KV"
✨ Success!
Add the following to your configuration file:
[[kv_namespaces]]
binding = "NORMATIVE_KV"
id = "your-actual-namespace-id"
```

## Step 3: Update wrangler.toml

Edit `wrangler.toml` and replace the placeholder `id` with the actual namespace ID:

```toml
name = "vlatam-ai-lab-api"
main = "src/worker/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "NORMATIVE_KV"
id = "your-actual-namespace-id"  # <-- Replace this
preview_id = "your-preview-id"     # <-- Replace this (shown in wrangler output)
```

## Step 4: Set DeepSeek API Key Secret

```bash
pnpm wrangler secret put DEEPSEEK_API_KEY
```

When prompted, paste your DeepSeek API key (starts with `sk-`).

This securely stores the key in Cloudflare's encrypted secrets store (not in code).

## Step 5: Sync Local Data to KV

Ensure you have parsed data locally:

```bash
# If not already done:
pnpm crawler:arca:real
pnpm crawler:infoleg
pnpm crawler:vuce-notes
```

Then sync to Cloudflare KV:

```bash
pnpm run sync:kv
```

This uploads:
- ARCA tariff data (~47,000 positions)
- InfoLEG customs norms (~2,658 norms)
- VUCE manual notes (3 positions)

## Step 6: Test Locally

```bash
pnpm run dev:worker
```

In another terminal, test the API:

```bash
# Health check
curl http://localhost:8787/api/health

# Normative query
curl -X POST http://localhost:8787/api/v1/norms/query \
  -H "Content-Type: application/json" \
  -d '{
    "product_description": "Mochila de campamento con superficie exterior de materia textil",
    "candidate_ncm8": "4202.92.00.110V",
    "origin_country": "CN",
    "destination_country": "AR"
  }'
```

Expected response:
```json
{
  "extracted_claims": [...],
  "unsupported_claims": [...],
  "warnings": [...],
  "confidence": 0.6,
  "human_review_required": true,
  "downstream_allowed": false,
  "query_metadata": {...}
}
```

## Step 7: Deploy to Production

```bash
pnpm run deploy:worker
```

Cloudflare will provide a URL like:
```
https://vlatam-ai-lab-api.your-account.workers.dev
```

## Step 8: Integrate with vlatam-global

Update your frontend to call:

```javascript
const response = await fetch('https://vlatam-ai-lab-api.your-account.workers.dev/api/v1/norms/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    product_description: 'Mochila de campamento...',
    candidate_ncm8: '4202.92.00.110V',
    origin_country: 'CN',
    destination_country: 'AR'
  })
});

const result = await response.json();
```

## Troubleshooting

### KV Not Initialized Error
If you get "Normative database not initialized", ensure:
1. KV namespace is created and bound in `wrangler.toml`
2. `pnpm run sync:kv` completed successfully
3. Check KV contents: `pnpm wrangler kv:key list --binding=NORMATIVE_KV`

### CORS Errors
The Worker is configured to allow origins:
- `https://vlatam-global.com`
- `http://localhost:3000`
- `http://localhost:5173`

Add your domain to the `cors()` call in `src/worker/index.ts` if needed.

### DeepSeek API Errors
- Verify `DEEPSEEK_API_KEY` is set: `pnpm wrangler secret list`
- Check DeepSeek dashboard for API usage/quota
- Test locally first: `pnpm run dev:worker`

## Architecture Notes

- **Serverless**: Zero server management, scales automatically
- **Fast**: Cloudflare KV has <50ms read latency globally
- **Secure**: API keys stored as encrypted secrets
- **Cost-effective**: Free tier includes 100k requests/day
- **Governance-compliant**: Worker enforces `human_review_required=true` at API level

## Next Steps

1. Set up custom domain (optional): `pnpm wrangler route`
2. Add rate limiting via Cloudflare dashboard
3. Monitor logs: `pnpm wrangler tail`
4. Set up alerts for errors or high latency
