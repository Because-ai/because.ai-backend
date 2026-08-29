import type { Evidence } from "../../lib/contract";
import type { EmbeddingClient } from "../../lib/embeddings";
import type { NotesRepository } from "../../repositories/notes.repository";

const RETRIEVAL_LIMIT = 8;

export interface RetrievalResult {
  evidence: Evidence[];
  embedTokens: number;
}

export class RetrievalService {
  constructor(private notesRepository: NotesRepository, private embeddings: EmbeddingClient) {}

  get embeddingModel(): string {
    return this.embeddings.model;
  }

  async run(queryText: string, entityRefs: string[]): Promise<RetrievalResult> {
    if (entityRefs.length === 0) {
      return { evidence: [], embedTokens: 0 };
    }

    const { embeddings, tokens } = await this.embeddings.embed([queryText], "query");
    const notes = await this.notesRepository.searchByEmbedding(embeddings[0]!, entityRefs, RETRIEVAL_LIMIT);

    const evidence = notes.map((note) => ({
      id: note.id,
      type: note.type,
      sourceId: note.sourceId,
      excerpt: note.excerpt,
      meta: {
        ...note.meta,
        source: "CRM",
        grain: "per interaction",
        method: "Vector cosine search over embedded notes",
      },
    }));

    return { evidence, embedTokens: tokens };
  }
}
