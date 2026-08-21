import type { MetricConfig } from "../../config/metrics";
import type { OrdersRepository } from "../../repositories/orders.repository";

export interface DetectionResult {
  metric: MetricConfig;
  segmentValue: string;
  monthlySeries: { month: string; total: number }[];
  currentMonth: string;
  currentValue: number;
  priorValue: number;
  changePct: number;
  zScore: number;
  isSignificant: boolean;
}

const SIGNIFICANCE_THRESHOLD = 1.5;
const TRAILING_MONTHS = 6;

function stdev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export class DetectionService {
  constructor(private ordersRepository: OrdersRepository) {}

  async run(metric: MetricConfig, segmentValue: string): Promise<DetectionResult> {
    const series = await this.ordersRepository.monthlySeries(metric, segmentValue, TRAILING_MONTHS + 1);

    if (series.length < 2) {
      throw new Error(`Not enough monthly data for ${metric.key} / ${segmentValue}`);
    }

    const current = series[series.length - 1]!;
    const trailing = series.slice(0, series.length - 1);
    const trailingValues = trailing.map((point) => point.total);
    const mean = trailingValues.reduce((a, b) => a + b, 0) / trailingValues.length;
    const sd = stdev(trailingValues) || 1;
    const zScore = (current.total - mean) / sd;
    const prior = trailing[trailing.length - 1]!;
    const changePct = prior.total === 0 ? 0 : ((current.total - prior.total) / prior.total) * 100;

    return {
      metric,
      segmentValue,
      monthlySeries: series,
      currentMonth: current.month,
      currentValue: current.total,
      priorValue: prior.total,
      changePct,
      zScore,
      isSignificant: Math.abs(zScore) >= SIGNIFICANCE_THRESHOLD,
    };
  }
}
