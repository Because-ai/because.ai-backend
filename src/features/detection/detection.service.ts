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
  bandLow: number;
  bandHigh: number;
  isSignificant: boolean;
  reason: string;
}

const SIGNIFICANCE_THRESHOLD = 1.5;
const TRAILING_MONTHS = 6;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pctChange(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / from) * 100;
}

export class DetectionService {
  constructor(private ordersRepository: OrdersRepository) {}

  async run(metric: MetricConfig, segmentValue: string, asOfMonth?: string): Promise<DetectionResult> {
    const series = await this.ordersRepository.monthlySeries(metric, segmentValue, TRAILING_MONTHS + 1, asOfMonth);

    if (series.length < 3) {
      throw new Error(`Not enough monthly data for ${metric.key} / ${segmentValue}`);
    }

    const current = series[series.length - 1]!;
    const historical = series.slice(0, series.length - 1);
    const prior = historical[historical.length - 1]!;

    const historicalChanges: number[] = [];
    for (let i = 1; i < historical.length; i++) {
      historicalChanges.push(pctChange(historical[i - 1]!.total, historical[i]!.total));
    }

    const bandMean = mean(historicalChanges);
    const bandSd = stdev(historicalChanges) || 1;
    const bandLow = bandMean - SIGNIFICANCE_THRESHOLD * bandSd;
    const bandHigh = bandMean + SIGNIFICANCE_THRESHOLD * bandSd;

    const changePct = pctChange(prior.total, current.total);
    const isSignificant = changePct < bandLow || changePct > bandHigh;

    const bandText = `the normal range of ${bandLow.toFixed(1)}% to ${bandHigh.toFixed(1)}% over the trailing ${historical.length} months`;
    const reason = isSignificant
      ? `${metric.label} ${changePct < 0 ? "fell" : "rose"} ${Math.abs(changePct).toFixed(1)}%, outside ${bandText}`
      : `${metric.label} moved ${changePct.toFixed(1)}%, within ${bandText}`;

    return {
      metric,
      segmentValue,
      monthlySeries: series,
      currentMonth: current.month,
      currentValue: current.total,
      priorValue: prior.total,
      changePct,
      bandLow,
      bandHigh,
      isSignificant,
      reason,
    };
  }
}
