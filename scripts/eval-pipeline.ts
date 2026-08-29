import { getMetricConfig } from "../src/config/metrics";
import { sql } from "../src/db/client";
import { monthRange, previousMonth } from "../src/lib/dates";
import { LlmClient } from "../src/lib/llm";
import { EmbeddingClient } from "../src/lib/embeddings";
import { AttributionService } from "../src/features/attribution/attribution.service";
import { buildTrendEvidence, DetectionService } from "../src/features/detection/detection.service";
import { NarrativeService } from "../src/features/narrative/narrative.service";
import { RetrievalService } from "../src/features/retrieval/retrieval.service";
import { SuppressionService } from "../src/features/suppression/suppression.service";
import { VerifierService } from "../src/features/verifier/verifier.service";
import { CalendarRepository } from "../src/repositories/calendar.repository";
import { NotesRepository } from "../src/repositories/notes.repository";
import { OrdersRepository } from "../src/repositories/orders.repository";

const RUN_FULL = process.argv.includes("--full");
const MONTHS_TO_EVALUATE = 5;

const ordersRepository = new OrdersRepository(sql);
const calendarRepository = new CalendarRepository(sql);
const notesRepository = new NotesRepository(sql);
const llm = new LlmClient();
const embedder = new EmbeddingClient();

const detectionService = new DetectionService(ordersRepository);
const suppressionService = new SuppressionService(calendarRepository);
const attributionService = new AttributionService(ordersRepository);
const retrievalService = new RetrievalService(notesRepository, embedder);
const narrativeService = new NarrativeService(llm);
const verifierService = new VerifierService(llm);

async function run() {
  const metric = getMetricConfig("sales");

  const regionRows = await sql<{ region: string }[]>`select distinct region from orders order by region`;
  const monthRows = await sql<{ month: string }[]>`
    select distinct to_char(date_trunc('month', order_date), 'YYYY-MM') as month
    from orders
    order by 1 desc
    limit ${MONTHS_TO_EVALUATE}
  `;

  const regions = regionRows.map((row) => row.region);
  const asOfMonths = monthRows.map((row) => row.month);

  console.log(`evaluating ${regions.length} regions x ${asOfMonths.length} months = ${regions.length * asOfMonths.length} combinations${RUN_FULL ? " (--full)" : ""}\n`);

  let flaggedCount = 0;
  let suppressedCount = 0;
  let attributedCount = 0;
  const attributionRuntimes: number[] = [];

  let sentenceTotal = 0;
  let strippedTotal = 0;
  const coverageValues: number[] = [];
  const verdictSpread: Record<string, number> = { sure: 0, probably: 0, not_sure: 0 };

  for (const region of regions) {
    for (const asOfMonth of asOfMonths) {
      let detectionResult;
      try {
        detectionResult = await detectionService.run(metric, region, asOfMonth);
      } catch (err) {
        console.log(`  ${region} / ${asOfMonth}: skipped — ${err instanceof Error ? err.message : "error"}`);
        continue;
      }

      if (!detectionResult.isSignificant) {
        console.log(`  ${region} / ${asOfMonth}: not significant — ${detectionResult.reason}`);
        continue;
      }
      flaggedCount += 1;

      const { start: currentStart, end: currentEnd } = monthRange(detectionResult.currentMonth);
      const priorMonthKey = previousMonth(detectionResult.currentMonth);
      const { start: priorStart, end: priorEnd } = monthRange(priorMonthKey);

      const suppression = await suppressionService.check(region, currentStart, currentEnd);
      if (suppression) {
        suppressedCount += 1;
        console.log(`  ${region} / ${asOfMonth}: flagged, suppressed — ${suppression.reason}`);
        continue;
      }

      const attributionStart = performance.now();
      const attributionResult = await attributionService.run({
        metric,
        segmentValue: region,
        priorValue: detectionResult.priorValue,
        currentStart,
        currentEnd,
        priorStart,
        priorEnd,
      });
      const attributionMs = performance.now() - attributionStart;
      attributionRuntimes.push(attributionMs);
      attributedCount += 1;

      console.log(
        `  ${region} / ${asOfMonth}: flagged ${detectionResult.changePct.toFixed(1)}%, ${attributionResult.causes.length} causes, ${attributionResult.entityRefs.length} entity refs, attribution ${attributionMs.toFixed(0)}ms`
      );

      if (RUN_FULL) {
        const retrievalQuery = attributionResult.causes.map((cause) => cause.claim).join(". ") || `${metric.label} change in ${region}`;
        const retrievalResult = await retrievalService.run(retrievalQuery, attributionResult.entityRefs);
        const noteEvidence = retrievalResult.evidence;
        const allEvidence = [buildTrendEvidence(detectionResult), ...attributionResult.evidence, ...noteEvidence];
        const evidenceMap = Object.fromEntries(allEvidence.map((item) => [item.id, item]));

        const generation = await narrativeService.generate({
          metric: metric.label,
          segment: region,
          period: `${detectionResult.currentMonth} vs ${priorMonthKey}`,
          changePct: detectionResult.changePct,
          unit: metric.unit,
          causes: attributionResult.causes,
          evidence: allEvidence,
        });

        const verifierResult = await verifierService.verify(generation.narrative, evidenceMap);

        sentenceTotal += generation.narrative.length;
        strippedTotal += verifierResult.strippedClaims.length;
        coverageValues.push(verifierResult.coveragePct);
        verdictSpread[verifierResult.level] = (verdictSpread[verifierResult.level] ?? 0) + 1;

        console.log(
          `    narrative: ${generation.narrative.length} sentences, ${verifierResult.strippedClaims.length} stripped, coverage ${verifierResult.coveragePct}%, level ${verifierResult.level}`
        );
      }
    }
  }

  const meanAttributionMs = attributionRuntimes.length ? attributionRuntimes.reduce((a, b) => a + b, 0) / attributionRuntimes.length : 0;

  console.log("\n=== summary ===");
  console.log(`combinations run: ${regions.length * asOfMonths.length}`);
  console.log(`flagged: ${flaggedCount}`);
  console.log(`suppressed: ${suppressedCount}`);
  console.log(`attributed (flagged, not suppressed): ${attributedCount}`);
  console.log(`mean attribution runtime: ${meanAttributionMs.toFixed(1)}ms`);

  if (RUN_FULL) {
    const meanCoverage = coverageValues.length ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length : 0;
    console.log(`\n--full: narrative + verifier stats`);
    console.log(`sentences generated: ${sentenceTotal}`);
    console.log(`claims stripped: ${strippedTotal} (across ${attributedCount} runs)`);
    console.log(`mean coverage: ${meanCoverage.toFixed(1)}%`);
    console.log(`coverage distribution: ${coverageValues.join(", ")}`);
    console.log(`verdict spread: sure=${verdictSpread.sure ?? 0} probably=${verdictSpread.probably ?? 0} not_sure=${verdictSpread.not_sure ?? 0}`);
  }

  await sql.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
