import type { SourcesRepository } from "../../repositories/sources.repository";

export interface SourceConnector {
  id: string;
  name: string;
  kind: "warehouse" | "crm" | "calendar" | "internal";
  productionSystem: string;
  prototypeSystem: string;
  isSimulated: boolean;
  table: string;
  status: "connected" | "empty";
  rowCount: number;
  detail: string;
}

export class SourcesService {
  constructor(private sourcesRepository: SourcesRepository) {}

  async list(): Promise<SourceConnector[]> {
    const [orders, calendarCount, notes, findingsCount, marketing] = await Promise.all([
      this.sourcesRepository.ordersStats(),
      this.sourcesRepository.calendarCount(),
      this.sourcesRepository.notesStats(),
      this.sourcesRepository.findingsCount(),
      this.sourcesRepository.marketingStats(),
    ]);

    const noteBreakdown = notes.byType.map((row) => `${row.count} ${row.type}${row.count === 1 ? "" : "s"}`).join(", ");

    return [
      {
        id: "warehouse",
        name: "Transaction warehouse",
        kind: "warehouse",
        productionSystem: "Snowflake",
        prototypeSystem: "Postgres (Superstore dataset)",
        isSimulated: true,
        table: "orders",
        status: orders.rowCount > 0 ? "connected" : "empty",
        rowCount: orders.rowCount,
        detail:
          orders.rowCount > 0
            ? `${orders.firstDate} to ${orders.lastDate} · ${orders.regionCount} regions · ${orders.customerCount} customers`
            : "No rows loaded",
      },
      {
        id: "crm",
        name: "Account notes, tickets and calls",
        kind: "crm",
        productionSystem: "Salesforce",
        prototypeSystem: "Postgres + pgvector (generated notes)",
        isSimulated: true,
        table: "notes",
        status: notes.rowCount > 0 ? "connected" : "empty",
        rowCount: notes.rowCount,
        detail: notes.rowCount > 0 ? `${noteBreakdown} · embedded for vector retrieval` : "No notes seeded",
      },
      {
        id: "marketing",
        name: "Marketing spend",
        kind: "warehouse",
        productionSystem: "Google Ads / Meta Ads",
        prototypeSystem: "Postgres (generated daily spend)",
        isSimulated: true,
        table: "marketing_spend",
        status: marketing.rowCount > 0 ? "connected" : "empty",
        rowCount: marketing.rowCount,
        detail:
          marketing.rowCount > 0
            ? `daily grain · reconciled to monthly in attribution · last row ${marketing.lastDate ?? "unknown"}`
            : "No spend rows seeded",
      },
      {
        id: "calendar",
        name: "Business calendar",
        kind: "calendar",
        productionSystem: "Internal calendar service",
        prototypeSystem: "Postgres",
        isSimulated: false,
        table: "calendar_events",
        status: calendarCount > 0 ? "connected" : "empty",
        rowCount: calendarCount,
        detail: calendarCount > 0 ? "Promo and holiday windows used to suppress expected movements" : "No events seeded",
      },
      {
        id: "findings",
        name: "Finding cache",
        kind: "internal",
        productionSystem: "Because.ai store",
        prototypeSystem: "Postgres",
        isSimulated: false,
        table: "cached_findings",
        status: findingsCount > 0 ? "connected" : "empty",
        rowCount: findingsCount,
        detail: findingsCount > 0 ? "Last good response per metric and segment, used as the demo fallback" : "Nothing cached yet",
      },
    ];
  }
}
