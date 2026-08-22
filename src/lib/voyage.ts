import { env } from "../config/env";

export const EMBEDDING_DIMENSIONS = 1024;

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 21_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VoyageClient {
  async embed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
    let lastError = "";

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.VOYAGE_API_KEY}`,
        },
        body: JSON.stringify({
          model: "voyage-4-lite",
          input: texts,
          input_type: inputType,
          output_dimension: EMBEDDING_DIMENSIONS,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as { data: { embedding: number[] }[] };
        return data.data.map((item) => item.embedding);
      }

      lastError = `${response.status} ${await response.text()}`;

      // The free tier allows 3 requests/minute, so a 429 needs a wait measured in
      // tens of seconds, not the usual sub-second retry.
      if (response.status === 429 && attempt < MAX_ATTEMPTS - 1) {
        const waitMs = BASE_BACKOFF_MS * (attempt + 1);
        console.warn(`Voyage rate limited, retrying in ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
        await sleep(waitMs);
        continue;
      }

      break;
    }

    throw new Error(`Voyage embeddings request failed: ${lastError}`);
  }
}
