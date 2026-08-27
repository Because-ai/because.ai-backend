import type { Sql } from "postgres";

export interface MarketingWindow {
  currentSpend: number;
  priorSpend: number;
  lastRowDate: string | null;
  query: string;
}

export class MarketingRepository {
  constructor(private sql: Sql) {}

  async window(
    region: string,
    currentStart: string,
    currentEnd: string,
    priorStart: string,
    priorEnd: string
  ): Promise<MarketingWindow> {
    const query = `select
  sum(spend) filter (where spend_date >= '${currentStart}' and spend_date < '${currentEnd}') as current_spend,
  sum(spend) filter (where spend_date >= '${priorStart}' and spend_date < '${priorEnd}') as prior_spend,
  max(spend_date)::text as last_row
from marketing_spend
where region = '${region}';`;

    const [row] = await this.sql<{ current_spend: string | null; prior_spend: string | null; last_row: string | null }[]>`
      select
        sum(spend) filter (where spend_date >= ${currentStart} and spend_date < ${currentEnd}) as current_spend,
        sum(spend) filter (where spend_date >= ${priorStart} and spend_date < ${priorEnd}) as prior_spend,
        max(spend_date)::text as last_row
      from marketing_spend
      where region = ${region}
    `;

    return {
      currentSpend: Number(row?.current_spend ?? 0),
      priorSpend: Number(row?.prior_spend ?? 0),
      lastRowDate: row?.last_row ?? null,
      query,
    };
  }

  async count(): Promise<number> {
    const [row] = await this.sql<{ count: string }[]>`select count(*) as count from marketing_spend`;
    return Number(row?.count ?? 0);
  }
}
