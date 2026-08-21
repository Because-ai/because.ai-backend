import type { Sql } from "postgres";

export interface NoteRow {
  id: string;
  type: "note" | "ticket" | "call";
  sourceId: string;
  entityType: string;
  entityRef: string;
  excerpt: string;
  meta: Record<string, string>;
}

export interface NewNote {
  id: string;
  type: "note" | "ticket" | "call";
  sourceId: string;
  entityType: "customer" | "region" | "category";
  entityRef: string;
  excerpt: string;
  meta: Record<string, string>;
  embedding: number[];
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export class NotesRepository {
  constructor(private sql: Sql) {}

  async searchByEmbedding(embedding: number[], entityRefs: string[], limit: number): Promise<NoteRow[]> {
    if (entityRefs.length === 0) {
      return [];
    }

    const rows = await this.sql.unsafe<
      { id: string; type: "note" | "ticket" | "call"; source_id: string; entity_type: string; entity_ref: string; excerpt: string; meta: Record<string, string> }[]
    >(
      `
      select id, type, source_id, entity_type, entity_ref, excerpt, meta
      from notes
      where entity_ref = any($2)
      order by embedding <=> $1::vector
      limit $3
      `,
      [toVectorLiteral(embedding), entityRefs, limit]
    );

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      sourceId: row.source_id,
      entityType: row.entity_type,
      entityRef: row.entity_ref,
      excerpt: row.excerpt,
      meta: row.meta,
    }));
  }

  async insert(note: NewNote): Promise<void> {
    await this.sql.unsafe(
      `
      insert into notes (id, type, source_id, entity_type, entity_ref, excerpt, meta, embedding)
      values ($1, $2, $3, $4, $5, $6, $7, $8::vector)
      on conflict (id) do nothing
      `,
      [note.id, note.type, note.sourceId, note.entityType, note.entityRef, note.excerpt, JSON.stringify(note.meta), toVectorLiteral(note.embedding)]
    );
  }
}
