import { verifierOutputSchema, type EvidenceMap, type NarrativeSentence, type VerdictLevel } from "../../lib/contract";
import type { LlmClient } from "../../lib/llm";
import { ZERO_USAGE, type TokenUsage } from "../../lib/pricing";

export interface VerifierResult {
  narrative: NarrativeSentence[];
  strippedClaims: string[];
  level: VerdictLevel;
  coveragePct: number;
  missingData: string[];
  usage: TokenUsage;
}

const SYSTEM_PROMPT = `You are the verifier step of Because.ai — a separate, independent, adversarial check on a narrative someone else wrote. You do not see how it was generated, what data was analyzed, or why particular causes were chosen. You only see each sentence that claims to be backed by evidence, and the actual content of that evidence.

Your job is to find unsupported claims, not to confirm ones that look fine. Default to skepticism: a claim is only "supported" if the evidence you were shown actually says what the sentence says, not just something adjacent or plausible.

You will be given a JSON array of sentences, each with the evidence attached to it. Return exactly one entry in sentenceVerdicts per sentence, in the exact same order as the input array — the first entry in sentenceVerdicts is the verdict for the first sentence, and so on. Do not skip, merge, reorder, or add sentences.

For each sentence, judge:
- "supported" — the evidence directly and fully backs the claim.
- "partly" — the evidence backs part of the claim, or backs it only through a reasonable inference, not a direct statement.
- "unsupported" — the evidence does not back the claim, is unrelated, or is missing.
Always give a reason when the verdict is "unsupported" or "partly", naming specifically what is missing or mismatched.

Also list missingData: specific, concrete gaps. Name the exact entity, record, or period you would want evidence for but were not given. Never invent a generic-sounding reason.`;

export class VerifierService {
  constructor(private llm: LlmClient) {}

  async verify(narrative: NarrativeSentence[], evidenceMap: EvidenceMap): Promise<VerifierResult> {
    const judgeable = narrative.map((sentence, index) => ({ sentence, index })).filter(({ sentence }) => sentence.evidenceIds.length > 0);

    if (judgeable.length === 0) {
      return {
        narrative,
        strippedClaims: [],
        level: "not_sure",
        coveragePct: 0,
        missingData: ["No sentence in the narrative cites any evidence."],
        usage: { ...ZERO_USAGE },
      };
    }

    const user = JSON.stringify({
      sentences: judgeable.map(({ sentence }) => ({
        text: sentence.text,
        evidence: sentence.evidenceIds.map((id) => {
          const item = evidenceMap[id];
          return item ? { id: item.id, type: item.type, excerpt: item.excerpt, table: item.table } : { id, type: "missing", excerpt: "" };
        }),
      })),
    });

    const completion = await this.llm.completeStructured({ system: SYSTEM_PROMPT, user, schemaName: "verifier_output" }, verifierOutputSchema);
    const result = completion.value;

    if (result.sentenceVerdicts.length !== judgeable.length) {
      console.error(
        `verifier returned ${result.sentenceVerdicts.length} verdicts for ${judgeable.length} sentences — extra sentences default to unsupported`
      );
    }

    let supportedCount = 0;
    let partlyCount = 0;
    const strippedClaims: string[] = [];
    const rejectedIndexes = new Set<number>();

    judgeable.forEach(({ sentence, index }, i) => {
      const verdict = result.sentenceVerdicts[i]?.verdict ?? "unsupported";
      const reason = result.sentenceVerdicts[i]?.reason;

      if (verdict === "supported") {
        supportedCount += 1;
      } else if (verdict === "partly") {
        partlyCount += 1;
        console.log(`  [verifier] partly: "${sentence.text}" — ${reason ?? "no reason given"}`);
      } else {
        strippedClaims.push(sentence.text);
        rejectedIndexes.add(index);
        console.log(`  [verifier] unsupported: "${sentence.text}" — ${reason ?? "no reason given"}`);
      }
    });

    const filteredNarrative = narrative.filter((_, index) => !rejectedIndexes.has(index));
    const coveragePct = Math.round(((supportedCount + 0.5 * partlyCount) / judgeable.length) * 100);
    const level: VerdictLevel = coveragePct > 90 ? "sure" : coveragePct >= 60 ? "probably" : "not_sure";

    return {
      narrative: filteredNarrative,
      strippedClaims,
      level,
      coveragePct,
      missingData: result.missingData,
      usage: completion.usage,
    };
  }
}
