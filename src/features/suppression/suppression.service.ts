import type { Evidence } from "../../lib/contract";
import type { CalendarRepository } from "../../repositories/calendar.repository";

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
    const reason = `Overlaps ${event.label} (${event.kind}), ${event.startsOn} to ${event.endsOn} — treated as expected, not flagged as an anomaly.`;

    const evidence: Evidence = {
      id: CALENDAR_EVIDENCE_ID,
      type: "query",
      sourceId: "WAREHOUSE/calendar_events",
      excerpt: `select id, label, region, starts_on, ends_on, kind\nfrom calendar_events\nwhere (region is null or region = '${segmentValue}')\n  and starts_on < '${periodEnd}'\n  and ends_on >= '${periodStart}';`,
      meta: { region: segmentValue, period_start: periodStart, period_end: periodEnd },
      table: {
        columns: ["label", "kind", "starts_on", "ends_on"],
        rows: [[event.label, event.kind, event.startsOn, event.endsOn]],
      },
    };

    return { reason, evidence };
  }
}
