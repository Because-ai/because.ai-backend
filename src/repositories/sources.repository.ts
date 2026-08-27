import type { Sql } from "postgres";

export interface OrdersStats {
  rowCount: number;
  firstDate: string | null;
  lastDate: string | null;
  regionCount: number;
  customerCount: number;
}

export interface NotesStats {
  rowCount: number;
  byType: { type: string; count: number }[];
}

export class SourcesRepository {
  constructor(private sql: Sql) {}

  async ordersStats(): Promise<OrdersStats> {
    const [row] = await this.sql<
      { row_count: string; first_date: string | null; last_date: string | null; region_count: string; customer_count: string }[]
    >`
      select count(*) as row_count,
             min(order_date)::text as first_date,
             max(order_date)::text as last_date,
             count(distinct region) as region_count,
             count(distinct customer_id) as customer_count
      from orders
    `;

    return {
      rowCount: Number(row?.row_count ?? 0),
      firstDate: row?.first_date ?? null,
      lastDate: row?.last_date ?? null,
      regionCount: Number(row?.region_count ?? 0),
      customerCount: Number(row?.customer_count ?? 0),
    };
  }

  async calendarCount(): Promise<number> {
    const [row] = await this.sql<{ count: string }[]>`select count(*) as count from calendar_events`;
    return Number(row?.count ?? 0);
  }

  async notesStats(): Promise<NotesStats> {
    const rows = await this.sql<{ type: string; count: string }[]>`
      select type, count(*) as count from notes group by type order by type
    `;
    return {
      rowCount: rows.reduce((acc, row) => acc + Number(row.count), 0),
      byType: rows.map((row) => ({ type: row.type, count: Number(row.count) })),
    };
  }

  async findingsCount(): Promise<number> {
    const [row] = await this.sql<{ count: string }[]>`select count(*) as count from cached_findings`;
    return Number(row?.count ?? 0);
  }

  async marketingStats(): Promise<{ rowCount: number; lastDate: string | null }> {
    try {
      const [row] = await this.sql<{ row_count: string; last_date: string | null }[]>`
        select count(*) as row_count, max(spend_date)::text as last_date from marketing_spend
      `;
      return { rowCount: Number(row?.row_count ?? 0), lastDate: row?.last_date ?? null };
    } catch {
      return { rowCount: 0, lastDate: null };
    }
  }
}
