import type { MetricConfig } from "../../config/metrics";
import type { Cause, Evidence } from "../../lib/contract";
import type { OrdersRepository } from "../../repositories/orders.repository";

export interface AttributionInput {
  metric: MetricConfig;
  segmentValue: string;
  priorValue: number;
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
}

export interface AttributionResult {
  causes: Cause[];
  evidence: Evidence[];
  entityRefs: string[];
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const plain = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const DISCOUNT_SHIFT_THRESHOLD = 0.02;
const TOP_CATEGORY_COUNT = 2;
const TOP_CUSTOMER_COUNT = 5;

function formatValue(metric: MetricConfig, value: number): string {
  if (metric.valueColumn === "discount") {
    return `${(value * 100).toFixed(1)}%`;
  }
  if (metric.valueColumn === "sales" || metric.valueColumn === "profit") {
    return money.format(value);
  }
  return `${plain.format(value)} ${metric.unit}`;
}

export class AttributionService {
  constructor(private ordersRepository: OrdersRepository) {}

  async run(input: AttributionInput): Promise<AttributionResult> {
    const { metric, segmentValue, priorValue, currentStart, currentEnd, priorStart, priorEnd } = input;

    const { rows: categoryRows, query: categoryQuery } = await this.ordersRepository.categoryBreakdown(
      metric,
      segmentValue,
      currentStart,
      currentEnd,
      priorStart,
      priorEnd
    );

    const categoryDeltas = categoryRows
      .map((row) => ({ ...row, delta: row.currentTotal - row.priorTotal }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, TOP_CATEGORY_COUNT);

    const causes: Cause[] = [];
    const evidence: Evidence[] = [];

    if (categoryDeltas.length > 0) {
      const categoryEvidenceId = "q-category-breakdown";
      evidence.push({
        id: categoryEvidenceId,
        type: "query",
        sourceId: "WAREHOUSE/orders",
        excerpt: categoryQuery,
        meta: { region: segmentValue, metric: metric.label, current_period: currentStart, prior_period: priorStart },
        table: {
          columns: ["category", "current", "prior", "delta"],
          rows: categoryRows.map((row) => [
            row.category,
            formatValue(metric, row.currentTotal),
            formatValue(metric, row.priorTotal),
            formatValue(metric, row.currentTotal - row.priorTotal),
          ]),
        },
      });

      for (const row of categoryDeltas) {
        const contributionPct = priorValue === 0 ? 0 : (row.delta / priorValue) * 100;
        causes.push({
          id: `c-category-${row.category.toLowerCase().replace(/\s+/g, "-")}`,
          claim: `${metric.label} in ${row.category} ${row.delta < 0 ? "fell" : "rose"} ${formatValue(metric, Math.abs(row.delta))} in ${segmentValue}`,
          contributionPct,
          evidence: [categoryEvidenceId],
        });
      }
    }

    // Discount shift is a plausible secondary driver for revenue-style metrics, but it
    // would be circular for the discount metric itself, so skip it there.
    if (metric.valueColumn !== "discount") {
      const discountStats = await this.ordersRepository.discountStats(segmentValue, currentStart, currentEnd, priorStart, priorEnd);
      const discountShift = discountStats.currentAvgDiscount - discountStats.priorAvgDiscount;

      if (Math.abs(discountShift) >= DISCOUNT_SHIFT_THRESHOLD) {
        const discountEvidenceId = "q-discount-stats";
        const estimatedImpact = discountShift * discountStats.currentTotal;
        const contributionPct = priorValue === 0 ? 0 : (-estimatedImpact / priorValue) * 100;

        evidence.push({
          id: discountEvidenceId,
          type: "query",
          sourceId: "WAREHOUSE/orders",
          excerpt: `select avg(discount) filter (where order_date >= '${currentStart}' and order_date < '${currentEnd}') as current_avg,\n       avg(discount) filter (where order_date >= '${priorStart}' and order_date < '${priorEnd}') as prior_avg\nfrom orders\nwhere region = '${segmentValue}';`,
          meta: { region: segmentValue, current_period: currentStart, prior_period: priorStart },
          table: {
            columns: ["period", "avg_discount"],
            rows: [
              [priorStart, `${(discountStats.priorAvgDiscount * 100).toFixed(1)}%`],
              [currentStart, `${(discountStats.currentAvgDiscount * 100).toFixed(1)}%`],
            ],
          },
        });

        causes.push({
          id: "c-discount",
          claim: `Average discount in ${segmentValue} moved from ${(discountStats.priorAvgDiscount * 100).toFixed(1)}% to ${(discountStats.currentAvgDiscount * 100).toFixed(1)}%`,
          contributionPct,
          evidence: [discountEvidenceId],
        });
      }
    }

    const topCustomers = await this.ordersRepository.topMovingCustomers(
      metric,
      segmentValue,
      currentStart,
      currentEnd,
      priorStart,
      priorEnd,
      TOP_CUSTOMER_COUNT
    );
    const entityRefs = topCustomers.filter((customer) => customer.delta < 0).map((customer) => customer.customerId);

    return { causes, evidence, entityRefs };
  }
}
