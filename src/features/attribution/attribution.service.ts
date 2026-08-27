import type { MetricConfig } from "../../config/metrics";
import { WAREHOUSE_LAST_REFRESHED } from "../../config/contract";
import type { Cause, Evidence } from "../../lib/contract";
import { formatMetricValue } from "../../lib/metric-format";
import type { OrdersRepository } from "../../repositories/orders.repository";
import type { MarketingRepository } from "../../repositories/marketing.repository";

const MARKETING_SHIFT_THRESHOLD = 0.12;

const QUERY_META = {
  source: "Warehouse",
  grain: "monthly",
  method: "Deterministic SQL contribution analysis",
  refreshed: WAREHOUSE_LAST_REFRESHED,
};

export interface AttributionInput {
  metric: MetricConfig;
  segmentValue: string;
  priorValue: number;
  currentStart: string;
  currentEnd: string;
  priorStart: string;
  priorEnd: string;
  suppressedDrivers?: string[];
}

export interface AttributionResult {
  causes: Cause[];
  evidence: Evidence[];
  entityRefs: string[];
}

const DISCOUNT_SHIFT_THRESHOLD = 0.02;
const TOP_CATEGORY_COUNT = 2;
const TOP_CUSTOMER_COUNT = 5;

export class AttributionService {
  constructor(private ordersRepository: OrdersRepository, private marketingRepository?: MarketingRepository) {}

  async run(input: AttributionInput): Promise<AttributionResult> {
    const { metric, segmentValue, priorValue, currentStart, currentEnd, priorStart, priorEnd } = input;
    const suppressedDrivers = new Set(input.suppressedDrivers ?? []);

    const { rows: categoryRows, query: categoryQuery } = await this.ordersRepository.categoryBreakdown(
      metric,
      segmentValue,
      currentStart,
      currentEnd,
      priorStart,
      priorEnd
    );

    const currentCountTotal = categoryRows.reduce((acc, row) => acc + row.currentCount, 0) || 1;
    const priorCountTotal = categoryRows.reduce((acc, row) => acc + row.priorCount, 0) || 1;

    const withContribution = categoryRows.map((row) => {
      const ownDelta = row.currentTotal - row.priorTotal;
      const contribution =
        metric.aggregate === "avg"
          ? (row.currentCount / currentCountTotal) * row.currentTotal - (row.priorCount / priorCountTotal) * row.priorTotal
          : ownDelta;
      return { ...row, ownDelta, contribution };
    });

    const categoryDeltas = [...withContribution]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
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
        meta: { region: segmentValue, metric: metric.label, current_period: currentStart, prior_period: priorStart, ...QUERY_META },
        table: {
          columns: ["category", "current", "prior", "delta"],
          rows: categoryRows.map((row) => [
            row.category,
            formatMetricValue(metric, row.currentTotal),
            formatMetricValue(metric, row.priorTotal),
            formatMetricValue(metric, row.currentTotal - row.priorTotal),
          ]),
        },
      });

      for (const row of categoryDeltas) {
        const contributionPct = priorValue === 0 ? 0 : (row.contribution / Math.abs(priorValue)) * 100;
        const id = `c-category-${row.category.toLowerCase().replace(/\s+/g, "-")}`;
        if (suppressedDrivers.has(id) || suppressedDrivers.has("c-category")) continue;
        causes.push({
          id,
          claim: `${metric.label} in ${row.category} ${row.ownDelta < 0 ? "fell" : "rose"} ${formatMetricValue(metric, Math.abs(row.ownDelta))} in ${segmentValue}`,
          contributionPct,
          evidence: [categoryEvidenceId],
        });
      }
    }

    // The discount cause estimates impact as (discount shift x revenue), which is only
    // dimensionally sound when the metric itself is money. Against units sold it divides
    // dollars by units and produces a meaningless contribution in the thousands of points.
    // It would also be circular for the discount metric itself.
    if ((metric.valueColumn === "sales" || metric.valueColumn === "profit") && !suppressedDrivers.has("c-discount")) {
      const discountStats = await this.ordersRepository.discountStats(segmentValue, currentStart, currentEnd, priorStart, priorEnd);
      const discountShift = discountStats.currentAvgDiscount - discountStats.priorAvgDiscount;

      if (Math.abs(discountShift) >= DISCOUNT_SHIFT_THRESHOLD) {
        const discountEvidenceId = "q-discount-stats";
        const estimatedImpact = discountShift * discountStats.currentTotal;
        const contributionPct = priorValue === 0 ? 0 : (-estimatedImpact / Math.abs(priorValue)) * 100;

        evidence.push({
          id: discountEvidenceId,
          type: "query",
          sourceId: "WAREHOUSE/orders",
          excerpt: `select avg(discount) filter (where order_date >= '${currentStart}' and order_date < '${currentEnd}') as current_avg,\n       avg(discount) filter (where order_date >= '${priorStart}' and order_date < '${priorEnd}') as prior_avg\nfrom orders\nwhere region = '${segmentValue}';`,
          meta: { region: segmentValue, current_period: currentStart, prior_period: priorStart, ...QUERY_META },
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

    if (
      this.marketingRepository &&
      (metric.valueColumn === "sales" || metric.valueColumn === "profit") &&
      !suppressedDrivers.has("c-marketing")
    ) {
      const marketing = await this.marketingRepository.window(segmentValue, currentStart, currentEnd, priorStart, priorEnd);
      const shift = marketing.priorSpend === 0 ? 0 : (marketing.currentSpend - marketing.priorSpend) / marketing.priorSpend;

      if (Math.abs(shift) >= MARKETING_SHIFT_THRESHOLD) {
        const marketingEvidenceId = "q-marketing-spend";
        const contributionPct = Math.max(-25, Math.min(25, shift * 20));
        const staleness = marketing.lastRowDate && marketing.lastRowDate < currentEnd ? ` (last daily row ${marketing.lastRowDate})` : "";

        evidence.push({
          id: marketingEvidenceId,
          type: "query",
          sourceId: "MARKETING/marketing_spend",
          excerpt: marketing.query,
          meta: {
            region: segmentValue,
            current_period: currentStart,
            prior_period: priorStart,
            source: "Marketing platform",
            grain: "daily to monthly (summed)",
            method: "External join, daily grain reconciled to monthly",
            refreshed: marketing.lastRowDate ?? "unknown",
          },
          table: {
            columns: ["period", "spend"],
            rows: [
              [priorStart, `$${Math.round(marketing.priorSpend).toLocaleString()}`],
              [currentStart, `$${Math.round(marketing.currentSpend).toLocaleString()}`],
            ],
          },
        });

        causes.push({
          id: "c-marketing",
          claim: `Marketing spend in ${segmentValue} ${shift < 0 ? "fell" : "rose"} ${Math.abs(shift * 100).toFixed(0)}% month over month${staleness}`,
          contributionPct,
          evidence: [marketingEvidenceId],
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
