import { pipeline } from "@huggingface/transformers";

export const EMBEDDING_DIMENSIONS = 1024;
export const EMBEDDING_MODEL = "mixedbread-ai/mxbai-embed-large-v1";

const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

export type EmbeddingInputType = "query" | "document";

export interface EmbedResult {
  embeddings: number[][];
  tokens: number;
}

type Extractor = (texts: string[], options: Record<string, unknown>) => Promise<{ tolist(): number[][] }>;

export class EmbeddingClient {
  readonly model = EMBEDDING_MODEL;

  private extractor: Promise<Extractor> | null = null;

  private load(): Promise<Extractor> {
    if (!this.extractor) {
      console.log(`loading embedding model ${EMBEDDING_MODEL} (first run downloads ~90MB, then cached)`);
      this.extractor = pipeline("feature-extraction", EMBEDDING_MODEL, { dtype: "q8" }).then(
        (pipe) => pipe as unknown as Extractor
      );
    }
    return this.extractor;
  }

  async embed(texts: string[], inputType: EmbeddingInputType): Promise<EmbedResult> {
    if (texts.length === 0) {
      return { embeddings: [], tokens: 0 };
    }

    const extractor = await this.load();
    const prepared = inputType === "query" ? texts.map((text) => QUERY_PREFIX + text) : texts;

    const output = await extractor(prepared, { pooling: "cls", normalize: true });
    const embeddings = output.tolist();

    const width = embeddings[0]?.length ?? 0;
    if (width !== EMBEDDING_DIMENSIONS) {
      throw new Error(`${EMBEDDING_MODEL} returned ${width}-dimension vectors but the notes table is vector(${EMBEDDING_DIMENSIONS})`);
    }

    const tokens = prepared.reduce((total, text) => total + Math.ceil(text.length / 4), 0);
    return { embeddings, tokens };
  }
}
