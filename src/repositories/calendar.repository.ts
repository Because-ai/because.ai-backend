import type { Sql } from "postgres";

export interface CalendarEventRow {
  id: string;
  label: string;
  region: string | null;
  startsOn: string;
  endsOn: string;
  kind: string;
}

// postgres.js hands back a JS Date for `date` columns, not a string. Interpolating one
// straight into a sentence yields "Thu Nov 20 2014 05:30:00 GMT+0530 (India Standard
// Time)", which then ends up in user-facing copy — so normalise to a plain calendar day.
function toIsoDay(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

export class CalendarRepository {
  constructor(private sql: Sql) {}

  async findOverlapping(region: string, periodStart: string, periodEnd: string): Promise<CalendarEventRow[]> {
    const rows = await this.sql<
      { id: string; label: string; region: string | null; starts_on: Date | string; ends_on: Date | string; kind: string }[]
    >`
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
      startsOn: toIsoDay(row.starts_on),
      endsOn: toIsoDay(row.ends_on),
      kind: row.kind,
    }));
  }
}
