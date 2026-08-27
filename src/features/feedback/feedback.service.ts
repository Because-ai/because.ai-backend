import type { FeedbackInput, FeedbackRow, LearnedAdjustment, FeedbackRepository } from "../../repositories/feedback.repository";

const BASE_MULTIPLIER = 1.5;
const MIN_MULTIPLIER = 1.0;
const MAX_MULTIPLIER = 3.0;
const REJECT_STEP = 0.3;
const MISS_STEP = 0.25;
const DRIVER_SUPPRESS_THRESHOLD = 2;

export interface SeriesAdjustments {
  bandMultiplier: number;
  suppressedDrivers: string[];
}

export class FeedbackService {
  constructor(private feedbackRepository: FeedbackRepository) {}

  async record(input: FeedbackInput): Promise<void> {
    await this.feedbackRepository.save(input);
    await this.recompute(input.metric, input.segment);
  }

  async listByFinding(findingId: string): Promise<FeedbackRow[]> {
    return this.feedbackRepository.listByFinding(findingId);
  }

  async adjustmentsFor(metric: string, segment: string): Promise<SeriesAdjustments> {
    const rows = await this.feedbackRepository.getAdjustments(metric, segment);
    let bandMultiplier = BASE_MULTIPLIER;
    let suppressedDrivers: string[] = [];

    for (const row of rows) {
      if (row.kind === "band_multiplier") {
        bandMultiplier = row.value.multiplier;
      } else if (row.kind === "suppressed_driver") {
        suppressedDrivers = row.value.drivers;
      }
    }

    return { bandMultiplier, suppressedDrivers };
  }

  async listLearned(): Promise<LearnedAdjustment[]> {
    return this.feedbackRepository.listAdjustments();
  }

  private async recompute(metric: string, segment: string): Promise<void> {
    const rejects = await this.feedbackRepository.count(metric, segment, "finding", "reject");
    const misses = await this.feedbackRepository.count(metric, segment, "finding", "correct");

    const multiplier = clamp(
      BASE_MULTIPLIER + REJECT_STEP * Math.max(0, rejects - 1) - MISS_STEP * misses,
      MIN_MULTIPLIER,
      MAX_MULTIPLIER
    );

    if (multiplier !== BASE_MULTIPLIER) {
      const reason =
        multiplier > BASE_MULTIPLIER
          ? `${rejects} "not material" responses on this series widened the band to ${multiplier.toFixed(2)} sigma.`
          : `${misses} "you missed this" responses tightened the band to ${multiplier.toFixed(2)} sigma.`;
      await this.feedbackRepository.upsertAdjustment(metric, segment, "band_multiplier", { multiplier }, reason);
    }

    const rejectedCauses = await this.feedbackRepository.distinctRejectedCauses(metric, segment);
    const suppressed = rejectedCauses.filter((row) => row.count >= DRIVER_SUPPRESS_THRESHOLD).map((row) => row.targetRef);
    if (suppressed.length > 0) {
      await this.feedbackRepository.upsertAdjustment(
        metric,
        segment,
        "suppressed_driver",
        { drivers: suppressed },
        `${suppressed.join(", ")} marked as noise for this series and hidden from future findings.`
      );
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
