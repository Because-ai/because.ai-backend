import type { MetricConfig } from "../../config/metrics";
import { getMetricConfig } from "../../config/metrics";
import { personas } from "../../config/personas";
import { env } from "../../config/env";
import { monthLabel, monthRange, previousMonth } from "../../lib/dates";
import type {
  Action,
  Evidence,
  EvidenceMap,
  Insight,
  NarrativeSentence,
  PersonaView,
  Severity,
  Telemetry,
  TelemetryStep,
  Trend,
} from "../../lib/contract";
import { addUsage, chatCostUsd, embedCostUsd, ZERO_USAGE, type TokenUsage } from "../../lib/pricing";
import { VOYAGE_MODEL } from "../../lib/voyage";
import { redactAccountName } from "../../config/roles";
import type { CachedFindingsRepository } from "../../repositories/cached-findings.repository";
import type { AttributionResult, AttributionService } from "../attribution/attribution.service";
import { buildTrendEvidence, TREND_EVIDENCE_ID, type DetectionResult, type DetectionService } from "../detection/detection.service";
import type { NarrativeService } from "../narrative/narrative.service";
import type { RetrievalService } from "../retrieval/retrieval.service";
import type { SuppressionService } from "../suppression/suppression.service";
import type { VerifierService } from "../verifier/verifier.service";
import type { FeedbackService } from "../feedback/feedback.service";

export interface FindingsResult {
  insights: Insight[];
  evidence: EvidenceMap;
  source: "live" | "cache";
}

export interface RunOptions {
  persist?: boolean;
  seePii?: boolean;
}

const ABSTENTION_FLOOR = 35;

export class FindingsService {
  constructor(
    private detection: DetectionService,
    private suppression: SuppressionService,
    private attribution: AttributionService,
    private retrieval: RetrievalService,
    private narrative: NarrativeService,
    private verifier: VerifierService,
    private cachedFindings: CachedFindingsRepository,
    private feedback: FeedbackService
  ) {}

  async run(metricKey: string, segmentValue: string, asOfMonth?: string, options: RunOptions = {}): Promise<FindingsResult> {
    const persist = options.persist ?? true;
    const seePii = options.seePii ?? true;
    try {
      const result = await this.runLive(metricKey, segmentValue, asOfMonth, persist);
      return { ...this.applyEntitlement(result, seePii), source: "live" };
    } catch (err) {
      console.error("findings pipeline failed, falling back to cache", err);
      const cached = await this.cachedFindings.getLatest(metricKey, segmentValue);
      if (!cached) {
        throw err;
      }
      return { ...this.applyEntitlement(cached, seePii), source: "cache" };
    }
  }

  async getLatest(metricKey: string, segmentValue: string, seePii = true): Promise<FindingsResult | null> {
    const cached = await this.cachedFindings.getLatest(metricKey, segmentValue);
    if (!cached) {
      return null;
    }
    return { ...this.applyEntitlement(cached, seePii), source: "cache" };
  }

  private async runLive(
    metricKey: string,
    segmentValue: string,
    asOfMonth: string | undefined,
    persist: boolean
  ): Promise<{ insights: Insight[]; evidence: EvidenceMap }> {
    const metric = getMetricConfig(metricKey);
    const adjustments = await this.feedback
      .adjustmentsFor(metricKey, segmentValue)
      .catch(() => ({ bandMultiplier: 1.5, suppressedDrivers: [] as string[] }));

    const steps: TelemetryStep[] = [];
    let usage: TokenUsage = { ...ZERO_USAGE };
    let embedTokens = 0;
    let modelCalls = 0;

    const time = async <T>(name: string, kind: TelemetryStep["kind"], fn: () => Promise<T> | T): Promise<T> => {
      const started = performance.now();
      const value = await fn();
      steps.push({ name, ms: Math.round(performance.now() - started), kind });
      return value;
    };

    const buildTelemetry = (): Telemetry => ({
      steps,
      totalMs: steps.reduce((total, step) => total + step.ms, 0),
      modelCalls,
      tokens: usage,
      embedTokens,
      estCostUsd: chatCostUsd(env.OPENROUTER_MODEL, usage) + embedCostUsd(VOYAGE_MODEL, embedTokens),
    });

    const detectionResult = await time("Detection", "stats", () =>
      this.detection.run(metric, segmentValue, asOfMonth, adjustments.bandMultiplier)
    );

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
      materiality: detectionResult.materiality,
      historyMonths: detectionResult.historyMonths,
    };

    const scopedId = (id: string) => `${baseInsight.id}:${id}`;
    const trendEvidence = { ...buildTrendEvidence(detectionResult), id: scopedId(TREND_EVIDENCE_ID) };

    if (detectionResult.mode === "sparse") {
      const narrative: NarrativeSentence[] = [{ text: detectionResult.reason, evidenceIds: [trendEvidence.id] }];
      const insight = this.finishSuppressed(baseInsight, {
        reason: detectionResult.reason,
        narrative,
        severity: "watch",
        dataMode: "sparse",
        headline: `Not enough history to judge ${metric.label} in ${segmentValue} yet — ${detectionResult.historyMonths} of 6 months on file.`,
        telemetry: buildTelemetry(),
      });
      const evidenceMap: EvidenceMap = { [trendEvidence.id]: trendEvidence };
      if (persist) await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: evidenceMap });
      return { insights: [insight], evidence: evidenceMap };
    }

    if (!detectionResult.isSignificant) {
      const narrative: NarrativeSentence[] = [{ text: detectionResult.reason, evidenceIds: [trendEvidence.id] }];
      const insight = this.finishSuppressed(baseInsight, {
        reason: detectionResult.reason,
        narrative,
        severity: "watch",
        headline: `${metric.label} moved ${detectionResult.changePct.toFixed(1)}% in ${segmentValue}, but this is within the normal range. No action suggested.`,
        telemetry: buildTelemetry(),
      });
      const evidenceMap: EvidenceMap = { [trendEvidence.id]: trendEvidence };
      if (persist) await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: evidenceMap });
      return { insights: [insight], evidence: evidenceMap };
    }

    const suppression = await time("Suppression", "sql", () => this.suppression.check(segmentValue, currentStart, currentEnd));
    if (suppression) {
      const calendarEvidence = { ...suppression.evidence, id: scopedId(suppression.evidence.id) };
      const narrative: NarrativeSentence[] = [
        { text: detectionResult.reason, evidenceIds: [trendEvidence.id] },
        { text: suppression.reason, evidenceIds: [calendarEvidence.id] },
      ];
      const insight = this.finishSuppressed(baseInsight, {
        reason: suppression.reason,
        narrative,
        severity: "watch",
        headline: `${metric.label} moved ${detectionResult.changePct.toFixed(1)}% in ${segmentValue}, but this is expected. No action suggested.`,
        telemetry: buildTelemetry(),
      });
      const evidenceMap: EvidenceMap = { [trendEvidence.id]: trendEvidence, [calendarEvidence.id]: calendarEvidence };
      if (persist) await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: evidenceMap });
      return { insights: [insight], evidence: evidenceMap };
    }

    const attributionResult = await time("Attribution", "sql", () =>
      this.attribution.run({
        metric,
        segmentValue,
        priorValue: detectionResult.priorValue,
        currentStart,
        currentEnd,
        priorStart,
        priorEnd,
        suppressedDrivers: adjustments.suppressedDrivers,
      })
    );

    const retrievalQuery = attributionResult.causes.map((cause) => cause.claim).join(". ") || `${metric.label} change in ${segmentValue}`;
    const retrievalResult = await time("Retrieval", "vector", () => this.retrieval.run(retrievalQuery, attributionResult.entityRefs));
    embedTokens += retrievalResult.embedTokens;
    const noteEvidence = retrievalResult.evidence;

    const attributionQueryIds = new Set(attributionResult.evidence.filter((item) => item.type === "query").map((item) => item.id));
    const allEvidence = [
      trendEvidence,
      ...attributionResult.evidence.map((item) => (item.type === "query" ? { ...item, id: scopedId(item.id) } : item)),
      ...noteEvidence,
    ];
    const causes = attributionResult.causes.map((cause) => ({
      ...cause,
      evidence: cause.evidence.map((id) => (attributionQueryIds.has(id) ? scopedId(id) : id)),
    }));

    const evidenceMap: EvidenceMap = Object.fromEntries(allEvidence.map((item) => [item.id, item]));

    const generation = await time("Narrative", "llm", () =>
      this.narrative.generate({
        metric: metric.label,
        segment: segmentValue,
        period,
        changePct: detectionResult.changePct,
        unit: metric.unit,
        causes,
        evidence: allEvidence,
      })
    );
    usage = addUsage(usage, generation.usage);
    modelCalls += 1;

    const verifierResult = await time("Verifier", "llm", () => this.verifier.verify(generation.narrative, evidenceMap));
    usage = addUsage(usage, verifierResult.usage);
    modelCalls += 1;

    const contradiction = detectContradiction(detectionResult, attributionResult, noteEvidence);
    const shouldAbstain = verifierResult.coveragePct < ABSTENTION_FLOOR || contradiction.flag;

    if (shouldAbstain) {
      const insight = this.buildAbstainedInsight(
        baseInsight,
        detectionResult,
        trendEvidence.id,
        verifierResult.coveragePct,
        [...verifierResult.missingData, ...(contradiction.flag ? [contradiction.note] : [])],
        buildTelemetry()
      );
      if (persist) await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: evidenceMap });
      return { insights: [insight], evidence: evidenceMap };
    }

    const actions: Action[] = generation.actions.map((action) => ({ ...action, owner: action.owner ?? undefined }));
    const personaViews = await time("Personas", "stats", () => buildPersonaViews(verifierResult.narrative, actions));

    const insight: Insight = {
      ...baseInsight,
      severity: this.classifySeverity(metric, detectionResult.changePct),
      suppressedReason: null,
      abstained: false,
      clarifyingQuestion: null,
      headline: generation.headline,
      narrative: verifierResult.narrative,
      causes,
      actions,
      personaViews,
      verdict: {
        level: verifierResult.level,
        coveragePct: verifierResult.coveragePct,
        strippedClaims: verifierResult.strippedClaims,
        missingData: verifierResult.missingData,
      },
      telemetry: buildTelemetry(),
    };

    if (persist) {
      await this.cachedFindings.save(metricKey, segmentValue, period, { insights: [insight], evidence: evidenceMap });
    }

    return { insights: [insight], evidence: evidenceMap };
  }

  private finishSuppressed(
    base: BaseInsight,
    opts: { reason: string; narrative: NarrativeSentence[]; severity: Severity; headline: string; telemetry: Telemetry; dataMode?: "normal" | "sparse" }
  ): Insight {
    return {
      ...base,
      severity: opts.severity,
      suppressedReason: opts.reason,
      abstained: false,
      clarifyingQuestion: null,
      dataMode: opts.dataMode ?? "normal",
      headline: opts.headline,
      narrative: opts.narrative,
      causes: [],
      actions: [],
      personaViews: buildPersonaViews(opts.narrative, []),
      verdict: { level: opts.dataMode === "sparse" ? "not_sure" : "sure", coveragePct: opts.dataMode === "sparse" ? 0 : 100, strippedClaims: [], missingData: [] },
      telemetry: opts.telemetry,
    };
  }

  private buildAbstainedInsight(
    base: BaseInsight,
    detectionResult: DetectionResult,
    trendEvidenceId: string,
    coveragePct: number,
    missingData: string[],
    telemetry: Telemetry
  ): Insight {
    const monthName = monthLabel(detectionResult.currentMonth);
    const narrative: NarrativeSentence[] = [
      { text: detectionResult.reason, evidenceIds: [trendEvidenceId] },
      {
        text: "We checked category mix, discount rate, account movement and the business calendar. None of them explains the move on its own, and the evidence retrieved does not hold together.",
        evidenceIds: [],
      },
    ];
    if (missingData.length > 0) {
      narrative.push({ text: `What would confirm a cause: ${missingData.join("; ")}.`, evidenceIds: [] });
    }

    const clarifyingQuestion = `Was there a pricing, assortment or staffing change in ${base.segment} during ${monthName}? No CRM or calendar record was found.`;

    return {
      ...base,
      severity: base.changePct < 0 ? "critical" : "watch",
      suppressedReason: null,
      abstained: true,
      clarifyingQuestion,
      headline: `${base.metric} moved ${base.changePct.toFixed(1)}% in ${base.segment} — not enough evidence to explain it`,
      narrative,
      causes: [],
      actions: [],
      personaViews: buildPersonaViews(narrative, []),
      verdict: { level: "not_sure", coveragePct, strippedClaims: [], missingData },
      telemetry,
    };
  }

  private classifySeverity(metric: MetricConfig, changePct: number): Severity {
    const improved = metric.goodDirection === "up" ? changePct > 0 : changePct < 0;
    if (improved) {
      return "resolved";
    }
    return Math.abs(changePct) >= 8 ? "critical" : "watch";
  }

  private applyEntitlement(payload: { insights: Insight[]; evidence: EvidenceMap }, seePii: boolean): { insights: Insight[]; evidence: EvidenceMap } {
    if (seePii) {
      return payload;
    }

    const names = new Set<string>();
    for (const item of Object.values(payload.evidence)) {
      if (item.meta?.account) names.add(item.meta.account);
    }

    const scrub = (text: string): string => {
      let out = text;
      for (const name of names) {
        if (name) out = out.split(name).join(redactAccountName(name));
      }
      return out;
    };

    const evidence: EvidenceMap = Object.fromEntries(
      Object.entries(payload.evidence).map(([id, item]) => [
        id,
        {
          ...item,
          excerpt: scrub(item.excerpt),
          meta: item.meta?.account ? { ...item.meta, account: redactAccountName(item.meta.account) } : item.meta,
        },
      ])
    );

    const scrubSentences = (sentences: NarrativeSentence[]) => sentences.map((s) => ({ ...s, text: scrub(s.text) }));
    const scrubActions = (actions: Action[]) =>
      actions.map((a) => ({
        ...a,
        recommendation: scrub(a.recommendation),
        rationale: scrub(a.rationale),
        affectedEntities: a.affectedEntities.map(scrub),
      }));

    const insights = payload.insights.map((insight) => ({
      ...insight,
      headline: scrub(insight.headline),
      narrative: scrubSentences(insight.narrative),
      causes: insight.causes.map((c) => ({ ...c, claim: scrub(c.claim) })),
      actions: scrubActions(insight.actions),
      personaViews: insight.personaViews?.map((view) => ({
        ...view,
        narrative: scrubSentences(view.narrative),
        actions: scrubActions(view.actions),
      })),
      verdict: {
        ...insight.verdict,
        strippedClaims: insight.verdict.strippedClaims.map(scrub),
        missingData: insight.verdict.missingData.map(scrub),
      },
    }));

    return { insights, evidence };
  }
}

type BaseInsight = Pick<
  Insight,
  "id" | "trend" | "metric" | "segment" | "period" | "changePct" | "detectedAt" | "isSignificant" | "materiality" | "historyMonths"
>;

function buildPersonaViews(narrative: NarrativeSentence[], actions: Action[]): PersonaView[] {
  return personas.map((persona) => {
    let sentences: NarrativeSentence[];
    if (persona.key === "executive") {
      sentences = narrative.length <= persona.maxSentences ? narrative : [narrative[0]!, ...narrative.slice(-2)];
    } else if (persona.key === "regional_manager") {
      sentences = narrative.slice(0, Math.max(persona.maxSentences, narrative.length - 1));
    } else {
      sentences = narrative;
    }
    return {
      persona: persona.key,
      label: persona.label,
      deliveryChannel: persona.deliveryChannel,
      narrative: sentences,
      actions: actions.slice(0, persona.maxActions),
    };
  });
}

const REASSURING = /reordered as usual|no concerns raised|steady account|as usual, no concerns/i;

function detectContradiction(
  detectionResult: DetectionResult,
  attributionResult: AttributionResult,
  noteEvidence: Evidence[]
): { flag: boolean; note: string } {
  const positiveOnly =
    attributionResult.entityRefs.length > 0 && noteEvidence.length > 0 && noteEvidence.every((note) => REASSURING.test(note.excerpt));
  if (positiveOnly) {
    return { flag: true, note: "Accounts were flagged as declining, but every CRM note retrieved for them reports business as usual." };
  }

  const categoryCauses = attributionResult.causes.filter((cause) => cause.id.startsWith("c-category"));
  const categorySum = categoryCauses.reduce((total, cause) => total + cause.contributionPct, 0);
  if (
    categoryCauses.length > 0 &&
    Math.sign(categorySum) !== Math.sign(detectionResult.changePct) &&
    Math.abs(categorySum) > Math.abs(detectionResult.changePct) * 0.4
  ) {
    return { flag: true, note: "The category breakdown points the opposite way to the headline movement." };
  }

  return { flag: false, note: "" };
}
