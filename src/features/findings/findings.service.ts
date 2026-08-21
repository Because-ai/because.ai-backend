import type { MetricConfig } from "../../config/metrics";
import { getMetricConfig } from "../../config/metrics";
import { monthLabel, monthRange, previousMonth } from "../../lib/dates";
import type { EvidenceMap, Insight, Severity, Trend } from "../../lib/contract";
import type { CachedFindingsRepository } from "../../repositories/cached-findings.repository";
import type { AttributionService } from "../attribution/attribution.service";
import type { DetectionService } from "../detection/detection.service";
import type { NarrativeService } from "../narrative/narrative.service";
import type { RetrievalService } from "../retrieval/retrieval.service";
import type { SuppressionService } from "../suppression/suppression.service";
import type { VerifierService } from "../verifier/verifier.service";

export interface FindingsResult {
  insights: Insight[];
  evidence: EvidenceMap;
  source: "live" | "cache";
}

export class FindingsService {
  constructor(
    private detection: DetectionService,
    private suppression: SuppressionService,
    private attribution: AttributionService,
    private retrieval: RetrievalService,
    private narrative: NarrativeService,
    private verifier: VerifierService,
    private cachedFindings: CachedFindingsRepository
  ) {}

  async run(metricKey: string, segmentValue: string, asOfMonth?: string): Promise<FindingsResult> {
    try {
      const result = await this.runLive(metricKey, segmentValue, asOfMonth);
      return { ...result, source: "live" };
    } catch (err) {
      console.error("findings pipeline failed, falling back to cache", err);
      const cached = await this.cachedFindings.getLatest(metricKey, segmentValue);
      if (!cached) {
        throw err;
      }
      return { insights: cached.insights, evidence: cached.evidence, source: "cache" };
    }
  }

  private async runLive(metricKey: string, segmentValue: string, asOfMonth?: string): Promise<{ insights: Insight[]; evidence: EvidenceMap }> {
    const metric = getMetricConfig(metricKey);
    const detectionResult = await this.detection.run(metric, segmentValue, asOfMonth);

    const { start: currentStart, end: currentEnd } = monthRange(detectionResult.currentMonth);
    const priorMonthKey = previousMonth(detectionResult.currentMonth);
    const { start: priorStart, end: priorEnd } = monthRange(priorMonthKey);

    const currentYear = detectionResult.currentMonth.split("-")[0];
    const priorYear = priorMonthKey.split("-")[0];
    const period = `${monthLabel(detectionResult.currentMonth)} ${currentYear} vs ${monthLabel(priorMonthKey)} ${priorYear}`;

    const trend: Trend = {
      labels: detectionResult.monthlySeries.map((point) => monthLabel(point.month)),
      values: detectionResult.monthlySeries.map((point) => point.total),
      unit: metric.unit,
    };

    const baseInsight = {
      id: `${metricKey}-${segmentValue.toLowerCase().replace(/\s+/g, "-")}-${detectionResult.currentMonth}`,
      trend,
      metric: metric.label,
      segment: segmentValue,
      period,
      changePct: detectionResult.changePct,
      detectedAt: new Date().toISOString(),
      isSignificant: detectionResult.isSignificant,
    };

    if (!detectionResult.isSignificant) {
      const insight = this.buildSuppressedInsight(baseInsight, detectionResult.reason);
      if (!asOfMonth) {
        await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: {} });
      }
      return { insights: [insight], evidence: {} };
    }

    const calendarReason = await this.suppression.check(segmentValue, currentStart, currentEnd);
    if (calendarReason) {
      const insight = this.buildSuppressedInsight(baseInsight, calendarReason);
      if (!asOfMonth) {
        await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: {} });
      }
      return { insights: [insight], evidence: {} };
    }

    const attributionResult = await this.attribution.run({
      segmentValue,
      priorValue: detectionResult.priorValue,
      currentStart,
      currentEnd,
      priorStart,
      priorEnd,
    });

    const retrievalQuery = attributionResult.causes.map((cause) => cause.claim).join(". ") || `${metric.label} change in ${segmentValue}`;
    const noteEvidence = await this.retrieval.run(retrievalQuery, attributionResult.entityRefs);
    const allEvidence = [...attributionResult.evidence, ...noteEvidence];
    const evidenceMap: EvidenceMap = Object.fromEntries(allEvidence.map((item) => [item.id, item]));

    const generation = await this.narrative.generate({
      metric: metric.label,
      segment: segmentValue,
      period,
      changePct: detectionResult.changePct,
      unit: metric.unit,
      causes: attributionResult.causes,
      evidence: allEvidence,
    });

    const verifierResult = await this.verifier.verify(generation.narrative, evidenceMap);

    const insight: Insight = {
      ...baseInsight,
      severity: this.classifySeverity(metric, detectionResult.changePct),
      suppressedReason: null,
      headline: generation.headline,
      narrative: verifierResult.narrative,
      causes: attributionResult.causes,
      actions: generation.actions,
      verdict: {
        level: verifierResult.level,
        coveragePct: verifierResult.coveragePct,
        strippedClaims: verifierResult.strippedClaims,
        missingData: verifierResult.missingData,
      },
    };

    if (!asOfMonth) {
      await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: evidenceMap });
    }

    return { insights: [insight], evidence: evidenceMap };
  }

  private buildSuppressedInsight(base: Omit<Insight, "severity" | "suppressedReason" | "headline" | "narrative" | "causes" | "actions" | "verdict">, reason: string): Insight {
    return {
      ...base,
      severity: "watch",
      suppressedReason: reason,
      headline: `${base.metric} moved ${base.changePct.toFixed(1)}% in ${base.segment}, but this is expected. No action suggested.`,
      narrative: [],
      causes: [],
      actions: [],
      verdict: { level: "sure", coveragePct: 100, strippedClaims: [], missingData: [] },
    };
  }

  private classifySeverity(metric: MetricConfig, changePct: number): Severity {
    const improved = metric.goodDirection === "up" ? changePct > 0 : changePct < 0;
    if (improved) {
      return "resolved";
    }
    return Math.abs(changePct) >= 8 ? "critical" : "watch";
  }
}
