import type { JSONValue, Sql } from "postgres";
import type { EvidenceMap, Insight } from "../lib/contract";

export interface FindingsPayload {
  insights: Insight[];
  evidence: EvidenceMap;
}

export class CachedFindingsRepository {
  constructor(private sql: Sql) {}

  async save(metric: string, segment: string, period: string, payload: FindingsPayload): Promise<void> {
    await this.sql`
      insert into cached_findings (metric, segment, period, payload)
      values (${metric}, ${segment}, ${period}, ${this.sql.json(payload as unknown as JSONValue)})
    `;
  }

  async getLatest(metric: string, segment: string): Promise<FindingsPayload | null> {
    const [row] = await this.sql<{ payload: FindingsPayload }[]>`
      select payload
      from cached_findings
      where metric = ${metric} and segment = ${segment}
      order by created_at desc
      limit 1
    `;

    return row?.payload ?? null;
  }
}
