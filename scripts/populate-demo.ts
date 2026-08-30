import { getMetricConfig, metricKeys } from "../src/config/metrics";
import { detectionService, findingsService } from "../src/container";
import { sql } from "../src/db/client";
import { env } from "../src/config/env";

const REGIONS = ["West", "East", "Central", "South", "Online"];

const asOfArg = process.argv.find((arg) => arg.startsWith("--asOf="));
const fixedAsOf = asOfArg ? asOfArg.split("=")[1] : undefined;
const SCAN = process.argv.includes("--scan");

async function findMostNotableMonth(
  metricKey: string,
  region: string,
  candidates: string[]
): Promise<{ month: string | null; sparse: boolean }> {
  const metric = getMetricConfig(metricKey);
  let best: { month: string; magnitude: number } | null = null;

  for (const month of candidates) {
    try {
      const result = await detectionService.run(metric, region, month);
      if (result.mode === "sparse") {
        return { month: null, sparse: true };
      }
      if (!result.isSignificant) continue;

      const magnitude = Math.abs(result.changePct);
      if (!best || magnitude > best.magnitude) {
        best = { month, magnitude };
      }
    } catch {
      // not enough trailing history for this month
    }
  }

  return { month: best?.month ?? null, sparse: false };
}

async function assertModelReachable(): Promise<void> {
  const base = env.OLLAMA_BASE_URL.replace(/\/v1\/?$/, "");
  try {
    const res = await fetch(`${base}/api/version`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`${res.status}`);
    const { version } = (await res.json()) as { version: string };
    console.log(`ollama ${version} reachable at ${env.OLLAMA_BASE_URL}, model ${env.OLLAMA_MODEL}\n`);
  } catch {
    throw new Error(
      [
        `Cannot reach Ollama at ${env.OLLAMA_BASE_URL}.`,
        "Start it with `ollama serve` in its own terminal, then re-run.",
        "Use that rather than the desktop app: the desktop app checks for updates hourly, and a",
        "restart mid-sweep drops every in-flight request.",
      ].join("\n")
    );
  }
}

async function run() {
  await assertModelReachable();
  const monthRows = await sql<{ month: string }[]>`
    select distinct to_char(date_trunc('month', order_date), 'YYYY-MM') as month
    from orders
    order by 1 desc
    limit 18
  `;
  const candidates = monthRows.map((row) => row.month);

  const combos = metricKeys.flatMap((metric) => REGIONS.map((region) => ({ metric, region })));
  console.log(`populating ${combos.length} metric x region combinations${SCAN ? " (scanning history for the most notable month)" : ""}\n`);

  let flagged = 0;
  let suppressed = 0;
  let skipped = 0;
  let failed = 0;

  for (const { metric, region } of combos) {
    let asOf = fixedAsOf;
    let runSparse = false;

    if (SCAN && !fixedAsOf) {
      const notable = await findMostNotableMonth(metric, region, candidates);
      if (notable.sparse) {
        runSparse = true;
      } else if (!notable.month) {
        skipped += 1;
        console.log(`  ${metric} / ${region}: no significant month in range, skipped`);
        continue;
      } else {
        asOf = notable.month;
      }
    }

    try {
      const result = await findingsService.run(metric, region, runSparse ? undefined : asOf);
      const insight = result.insights[0]!;

      if (insight.dataMode === "sparse") {
        suppressed += 1;
        console.log(`  ${metric} / ${region}: sparse (${insight.historyMonths ?? 0} months on file)`);
      } else if (insight.abstained) {
        flagged += 1;
        console.log(`  ${metric} / ${region} @ ${asOf ?? "latest"}: abstained (${insight.changePct.toFixed(1)}%)`);
      } else if (insight.suppressedReason) {
        suppressed += 1;
        console.log(`  ${metric} / ${region} @ ${asOf ?? "latest"}: suppressed (${insight.changePct.toFixed(1)}%)`);
      } else {
        flagged += 1;
        console.log(
          `  ${metric} / ${region} @ ${asOf ?? "latest"}: ${insight.changePct.toFixed(1)}% — ${insight.verdict.level}, coverage ${insight.verdict.coveragePct}%, ${insight.causes.length} causes, $${insight.telemetry?.estCostUsd.toFixed(4) ?? "?"}`
        );
      }
    } catch (err) {
      failed += 1;
      console.error(`  ${metric} / ${region}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\ndone: ${flagged} flagged, ${suppressed} suppressed, ${skipped} skipped, ${failed} failed`);
  await sql.end();

  if (failed > 0) {
    console.error(`\n${failed} combination(s) failed; their cached findings are stale or missing.`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
