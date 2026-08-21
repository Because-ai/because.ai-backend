import type { CalendarRepository } from "../../repositories/calendar.repository";

export class SuppressionService {
  constructor(private calendarRepository: CalendarRepository) {}

  async check(segmentValue: string, periodStart: string, periodEnd: string): Promise<string | null> {
    const events = await this.calendarRepository.findOverlapping(segmentValue, periodStart, periodEnd);
    if (events.length === 0) {
      return null;
    }

    const event = events[0]!;
    return `Overlaps ${event.label} (${event.kind}), ${event.startsOn} to ${event.endsOn} — treated as expected, not flagged as an anomaly.`;
  }
}
