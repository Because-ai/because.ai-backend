import type { Sql } from "postgres";

export interface CalendarEventRow {
  id: string;
  label: string;
  region: string | null;
  startsOn: string;
  endsOn: string;
  kind: string;
}

export class CalendarRepository {
  constructor(private sql: Sql) {}

  async findOverlapping(region: string, periodStart: string, periodEnd: string): Promise<CalendarEventRow[]> {
    const rows = await this.sql<{ id: string; label: string; region: string | null; starts_on: string; ends_on: string; kind: string }[]>`
      select id, label, region, starts_on, ends_on, kind
      from calendar_events
      where (region is null or region = ${region})
        and starts_on < ${periodEnd}
        and ends_on >= ${periodStart}
    `;

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      region: row.region,
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      kind: row.kind,
    }));
  }
}
