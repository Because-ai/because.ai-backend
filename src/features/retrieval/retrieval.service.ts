import type { Evidence } from "../../lib/contract";
import type { VoyageClient } from "../../lib/voyage";
import type { NotesRepository } from "../../repositories/notes.repository";

const RETRIEVAL_LIMIT = 8;

export class RetrievalService {
  constructor(private notesRepository: NotesRepository, private voyage: VoyageClient) {}

  async run(queryText: string, entityRefs: string[]): Promise<Evidence[]> {
    if (entityRefs.length === 0) {
      return [];
    }

    const [embedding] = await this.voyage.embed([queryText], "query");
    const notes = await this.notesRepository.searchByEmbedding(embedding!, entityRefs, RETRIEVAL_LIMIT);

    return notes.map((note) => ({
      id: note.id,
      type: note.type,
      sourceId: note.sourceId,
      excerpt: note.excerpt,
      meta: note.meta,
    }));
  }
}
