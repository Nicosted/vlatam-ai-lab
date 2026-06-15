export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries: number = 5
): Promise<Response> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok || response.status !== 429) {
        return response;
      }

      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Rate limited (429), waiting ${waitTime / 1000}s before retry ${attempt}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));

    } catch (error: any) {
      if (attempt === maxRetries) {
        throw error;
      }

      const waitTime = Math.pow(2, attempt) * 1000;
      console.log(`⏳ Network error: ${error.message}, waiting ${waitTime / 1000}s before retry ${attempt}/${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error(`Max retries (${maxRetries}) exceeded`);
}
