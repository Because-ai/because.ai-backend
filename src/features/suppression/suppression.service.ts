import type { Evidence } from "../../lib/contract";
import type { CalendarRepository } from "../../repositories/calendar.repository";

function formatWindow(startsOn: string, endsOn: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" };
  const start = new Date(`${startsOn}T00:00:00Z`).toLocaleDateString("en-GB", opts);
  const end = new Date(`${endsOn}T00:00:00Z`).toLocaleDateString("en-GB", opts);
  return `${start} to ${end}`;
}

export const CALENDAR_EVIDENCE_ID = "q-calendar-events";

export interface SuppressionResult {
  reason: string;
  evidence: Evidence;
}

export class SuppressionService {
  constructor(private calendarRepository: CalendarRepository) {}

  async check(segmentValue: string, periodStart: string, periodEnd: string): Promise<SuppressionResult | null> {
    const events = await this.calendarRepository.findOverlapping(segmentValue, periodStart, periodEnd);
    if (events.length === 0) {
      return null;
    }

    const event = events[0]!;
    const reason = `Overlaps ${event.label}, a known ${event.kind} running ${formatWindow(event.startsOn, event.endsOn)} — expected, so not raised as a finding.`;

    const evidence: Evidence = {
      id: CALENDAR_EVIDENCE_ID,
      type: "query",
      sourceId: "WAREHOUSE/calendar_events",
      excerpt: `select id, label, region, starts_on, ends_on, kind\nfrom calendar_events\nwhere (region is null or region = '${segmentValue}')\n  and starts_on < '${periodEnd}'\n  and ends_on >= '${periodStart}';`,
      meta: {
        region: segmentValue,
        period_start: periodStart,
        period_end: periodEnd,
        source: "Business calendar",
        grain: "event window",
        method: "Deterministic overlap check",
      },
      table: {
        columns: ["label", "kind", "starts_on", "ends_on"],
        rows: [[event.label, event.kind, event.startsOn, event.endsOn]],
      },
    };

    return { reason, evidence };
  }
}
