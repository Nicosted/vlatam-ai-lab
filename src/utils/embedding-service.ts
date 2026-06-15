/**
 * Embedding service using Cloudflare Workers AI
 * Uses @cf/baai/bge-m3 model (multilingual, 1024 dimensions)
 *
 * Can be called:
 * - From scripts (via REST API with API token)
 * - From Worker (via AI binding)
 */

export interface EmbeddingResult {
  embedding: number[];
  token_count: number;
}

export class EmbeddingService {
  private accountId: string;
  private apiToken: string;
  private aiBinding: Ai | undefined;

  constructor(options: {
    accountId: string;
    apiToken: string;
    aiBinding?: Ai | undefined;
  }) {
    this.accountId = options.accountId;
    this.apiToken = options.apiToken;
    this.aiBinding = options.aiBinding;
  }

  /**
   * Generate embedding for a text chunk
   */
  async embed(text: string): Promise<EmbeddingResult> {
    if (this.aiBinding) {
      return this.embedWithBinding(text);
    }
    return this.embedWithRestApi(text);
  }

  /**
   * Use Workers AI binding directly (when running in Worker)
   */
  private async embedWithBinding(text: string): Promise<EmbeddingResult> {
    try {
      const response = await this.aiBinding!.run('@cf/baai/bge-m3', {
        text: [text.substring(0, 8000)],
      });

      const embedding = (response as any).data?.[0];

      if (!embedding) {
        throw new Error('No embedding in response');
      }

      return {
        embedding,
        token_count: Math.ceil(text.length / 4),
      };
    } catch (error: any) {
      throw new Error(`Embedding failed: ${error.message}`);
    }
  }

  /**
   * Use REST API (for scripts running outside Worker)
   */
  private async embedWithRestApi(text: string): Promise<EmbeddingResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/@cf/baai/bge-m3`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: [text.substring(0, 8000)],
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Embedding API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as any;
      const embedding = data.result?.data?.[0];

      if (!embedding) {
        throw new Error('No embedding in response');
      }

      return {
        embedding,
        token_count: Math.ceil(text.length / 4),
      };
    } catch (error: any) {
      clearTimeout(timeout);
      throw new Error(`Embedding failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += 10) {
      const batch = texts.slice(i, i + 10);
      const batchResults = await Promise.all(
        batch.map(text => this.embed(text))
      );
      results.push(...batchResults);

      if (i + 10 < texts.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }
}
