import type { MetricConfig } from "../../config/metrics";
import { getContract, WAREHOUSE_LAST_REFRESHED } from "../../config/contract";
import type { Evidence } from "../../lib/contract";
import { formatMetricValue } from "../../lib/metric-format";
import type { OrdersRepository } from "../../repositories/orders.repository";

export const TREND_EVIDENCE_ID = "q-monthly-trend";

export function buildTrendEvidence(result: DetectionResult): Evidence {
  return {
    id: TREND_EVIDENCE_ID,
    type: "query",
    sourceId: `WAREHOUSE/${result.metric.table}`,
    excerpt: result.seriesQuery,
    meta: {
      region: result.segmentValue,
      metric: result.metric.label,
      source: "Warehouse",
      grain: "monthly",
      method: "Statistical significance band (trailing 6 months, mean +/- 1.5 sigma)",
      refreshed: WAREHOUSE_LAST_REFRESHED,
      as_of: result.currentMonth,
    },
    table: {
      columns: ["month", result.metric.label],
      rows: result.monthlySeries.map((point) => [point.month, formatMetricValue(result.metric, point.total)]),
    },
  };
}

export interface MaterialityResult {
  statisticallySignificant: boolean;
  absImpact: number;
  sharePct: number;
  reason: string;
}

export interface DetectionResult {
  metric: MetricConfig;
  segmentValue: string;
  monthlySeries: { month: string; total: number }[];
  seriesQuery: string;
  currentMonth: string;
  currentValue: number;
  priorValue: number;
  changePct: number;
  bandLow: number;
  bandHigh: number;
  isSignificant: boolean;
  reason: string;
  mode: "normal" | "sparse";
  historyMonths: number;
  bandMultiplier: number;
  materiality: MaterialityResult;
}

const DEFAULT_MULTIPLIER = 1.5;
const TRAILING_MONTHS = 6;
const MIN_MONTHS_FOR_BAND = 4;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  const m = mean(values);
  const variance = values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function pctChange(from: number, to: number): number {
  return from === 0 ? 0 : ((to - from) / Math.abs(from)) * 100;
}

export class DetectionService {
  constructor(private ordersRepository: OrdersRepository) {}

  async run(metric: MetricConfig, segmentValue: string, asOfMonth?: string, bandMultiplier = DEFAULT_MULTIPLIER): Promise<DetectionResult> {
    const { points: series, query: seriesQuery } = await this.ordersRepository.monthlySeries(metric, segmentValue, TRAILING_MONTHS + 1, asOfMonth);

    if (series.length === 0) {
      throw new Error(`No data at all for ${metric.key} / ${segmentValue}`);
    }

    const current = series[series.length - 1]!;
    const historical = series.slice(0, series.length - 1);
    const prior = historical[historical.length - 1] ?? current;
    const changePct = pctChange(prior.total, current.total);

    if (series.length < MIN_MONTHS_FOR_BAND) {
      return {
        metric,
        segmentValue,
        monthlySeries: series,
        seriesQuery,
        currentMonth: current.month,
        currentValue: current.total,
        priorValue: prior.total,
        changePct,
        bandLow: Number.NaN,
        bandHigh: Number.NaN,
        isSignificant: false,
        reason: `Only ${series.length} month${series.length === 1 ? "" : "s"} of history on file for ${metric.label} in ${segmentValue}; 6 are needed before a movement can be judged. Re-checked automatically each month.`,
        mode: "sparse",
        historyMonths: series.length,
        bandMultiplier,
        materiality: {
          statisticallySignificant: false,
          absImpact: Math.abs(current.total - prior.total),
          sharePct: 0,
          reason: "Not enough history to assess materiality.",
        },
      };
    }

    const historicalChanges: number[] = [];
    for (let i = 1; i < historical.length; i++) {
      historicalChanges.push(pctChange(historical[i - 1]!.total, historical[i]!.total));
    }

    const bandMean = mean(historicalChanges);
    const bandSd = stdev(historicalChanges) || 1;
    const bandLow = bandMean - bandMultiplier * bandSd;
    const bandHigh = bandMean + bandMultiplier * bandSd;

    const statSig = changePct < bandLow || changePct > bandHigh;

    const contract = contractFor(metric.key);
    const absImpact = Math.abs(current.total - prior.total);
    const typicalSize = Math.abs(mean(historical.map((point) => point.total))) || 1;
    const sharePct = (absImpact / typicalSize) * 100;
    const meetsImpact = absImpact >= contract.minAbsImpact || sharePct >= contract.minSharePct;
    const isSignificant = statSig && meetsImpact;

    const bandText = `the normal range of ${bandLow.toFixed(1)}% to ${bandHigh.toFixed(1)}% over the trailing ${historical.length} months`;
    const multiplierNote = bandMultiplier !== DEFAULT_MULTIPLIER ? ` Sensitivity for this series is ${bandMultiplier.toFixed(2)} sigma, adjusted by your team's feedback.` : "";

    let reason: string;
    if (isSignificant) {
      reason = `${metric.label} ${changePct < 0 ? "fell" : "rose"} ${Math.abs(changePct).toFixed(1)}%, outside ${bandText}, and the ${formatMetricValue(metric, absImpact)} swing is large enough to matter (${sharePct.toFixed(0)}% of a typical month).${multiplierNote}`;
    } else if (statSig && !meetsImpact) {
      reason = `${metric.label} moved ${changePct.toFixed(1)}% — statistically unusual, but the ${formatMetricValue(metric, absImpact)} swing is too small to act on (${sharePct.toFixed(0)}% of a typical month), so it is not raised.${multiplierNote}`;
    } else {
      reason = `${metric.label} moved ${changePct.toFixed(1)}%, within ${bandText}.${multiplierNote}`;
    }

    return {
      metric,
      segmentValue,
      monthlySeries: series,
      seriesQuery,
      currentMonth: current.month,
      currentValue: current.total,
      priorValue: prior.total,
      changePct,
      bandLow,
      bandHigh,
      isSignificant,
      reason,
      mode: "normal",
      historyMonths: series.length,
      bandMultiplier,
      materiality: {
        statisticallySignificant: statSig,
        absImpact,
        sharePct,
        reason: isSignificant
          ? `Outside the ${bandMultiplier.toFixed(1)} sigma band and past the ${formatMetricValue(metric, contract.minAbsImpact)} / ${contract.minSharePct}% materiality floor.`
          : statSig
            ? "Statistically unusual but below the materiality floor."
            : "Within the normal range for this series.",
      },
    };
  }
}

function contractFor(metricKey: string): { minAbsImpact: number; minSharePct: number } {
  try {
    const c = getContract(metricKey);
    return { minAbsImpact: c.materiality.minAbsImpact, minSharePct: c.materiality.minSharePct };
  } catch {
    return { minAbsImpact: 0, minSharePct: 0 };
  }
}
