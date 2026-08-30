import { VerifierService } from "../src/features/verifier/verifier.service";
import { LlmClient } from "../src/lib/llm";
import type { EvidenceMap, NarrativeSentence } from "../src/lib/contract";

const MODELS = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["qwen2.5:7b-instruct", "qwen2.5:3b-instruct"];

const evidence: EvidenceMap = {
  "e-trend": {
    id: "e-trend",
    type: "query",
    sourceId: "WAREHOUSE/orders",
    excerpt: "select to_char(order_date,'YYYY-MM') m, sum(sales) from orders where region='East' group by 1;",
    meta: {},
    table: {
      columns: ["month", "Sales"],
      rows: [["2016-12", "$30,157"], ["2017-01", "$5,870"]],
    },
  },
  "e-cat": {
    id: "e-cat",
    type: "query",
    sourceId: "WAREHOUSE/orders",
    excerpt: "select category, sum(sales) from orders where region='East' group by 1;",
    meta: {},
    table: {
      columns: ["category", "current", "prior", "delta"],
      rows: [
        ["Office Supplies", "$2,100", "$11,690", "-$9,590"],
        ["Furniture", "$1,900", "$10,520", "-$8,620"],
        ["Technology", "$1,870", "$7,947", "-$6,077"],
      ],
    },
  },
};

// Three sentences with known correct answers: one true, one fabricated, one overreaching.
const narrative: NarrativeSentence[] = [
  { text: "Sales in East fell from $30,157 in December 2016 to $5,870 in January 2017.", evidenceIds: ["e-trend"] },
  { text: "The decline was caused by the loss of three major enterprise contracts in the East region.", evidenceIds: ["e-cat"] },
  { text: "Office Supplies fell $9,590, the largest single category decline.", evidenceIds: ["e-cat"] },
];

const EXPECTED = ["supported", "unsupported", "supported"];

async function run() {
  for (const model of MODELS) {
    process.env.OLLAMA_MODEL = model;
    const service = new VerifierService(new LlmClient());

    const t0 = performance.now();
    try {
      const result = await service.verify(narrative, evidence);
      const ms = Math.round(performance.now() - t0);

      const kept = result.narrative.length;
      const caughtFabrication = result.strippedClaims.some((c) => c.includes("enterprise contracts"));

      console.log(`\n=== ${model} ===`);
      console.log(`  wall clock       ${(ms / 1000).toFixed(1)}s`);
      console.log(`  coverage         ${result.coveragePct}%  (${result.level})`);
      console.log(`  sentences kept   ${kept} of ${narrative.length}`);
      console.log(`  stripped         ${result.strippedClaims.length}`);
      console.log(`  caught the lie   ${caughtFabrication ? "YES" : "NO  <-- rubber-stamped a fabricated claim"}`);
      console.log(`  tokens           ${result.usage.prompt} prompt / ${result.usage.completion} completion`);
      console.log(`  expected         ${EXPECTED.join(", ")}`);
      for (const claim of result.strippedClaims) {
        console.log(`    stripped: "${claim.slice(0, 78)}"`);
      }
    } catch (err) {
      console.log(`\n=== ${model} ===`);
      console.log(`  FAILED: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
