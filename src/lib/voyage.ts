import { env } from "../config/env";

export const EMBEDDING_DIMENSIONS = 1024;

export class VoyageClient {
  async embed(texts: string[], inputType: "query" | "document"): Promise<number[][]> {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "voyage-3",
        input: texts,
        input_type: inputType,
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      throw new Error(`Voyage embeddings request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { data: { embedding: number[] }[] };
    return data.data.map((item) => item.embedding);
  }
}
