import { verifierOutputSchema, type EvidenceMap, type NarrativeSentence, type VerdictLevel } from "../../lib/contract";
import type { OpenRouterClient } from "../../lib/openrouter";

export interface VerifierResult {
  narrative: NarrativeSentence[];
  strippedClaims: string[];
  level: VerdictLevel;
  coveragePct: number;
  missingData: string[];
}

const SYSTEM_PROMPT = `You are the verifier step of Because.ai — a separate, independent check on a narrative someone else wrote. You do not see how it was generated, what data was analyzed, or why particular causes were chosen. You only see each sentence that claims to be backed by evidence, and the actual content of that evidence.
For each sentence, judge strictly: does the evidence shown actually support the claim in the text? If it only partially supports it, or does not support it, mark supported: false and say why in reason.
Then give an overall verdict. level is "sure" if essentially everything is well-supported, "probably" if the core claim is supported but some details are inferred or only partially supported, "not_sure" if a meaningful share of the claims are unsupported or the evidence is thin. coveragePct is your estimate, 0-100, of how much of the story is actually traced to the evidence you were shown. missingData should name specific, concrete gaps: evidence you would want to see but were not given, or entities/records with no coverage at all.`;

export class VerifierService {
  constructor(private openRouter: OpenRouterClient) {}

  async verify(narrative: NarrativeSentence[], evidenceMap: EvidenceMap): Promise<VerifierResult> {
    const judgeable = narrative.map((sentence, index) => ({ sentence, index })).filter(({ sentence }) => sentence.evidenceIds.length > 0);

    if (judgeable.length === 0) {
      return {
        narrative,
        strippedClaims: [],
        level: "not_sure",
        coveragePct: 0,
        missingData: ["No sentence in the narrative cites any evidence."],
      };
    }

    const user = JSON.stringify({
      sentences: judgeable.map(({ sentence, index }) => ({
        index,
        text: sentence.text,
        evidence: sentence.evidenceIds.map((id) => {
          const item = evidenceMap[id];
          return item ? { id: item.id, type: item.type, excerpt: item.excerpt } : { id, type: "missing", excerpt: "" };
        }),
      })),
    });

    const result = await this.openRouter.completeStructured({ system: SYSTEM_PROMPT, user, schemaName: "verifier_output" }, verifierOutputSchema);

    const rejectedIndexes = new Set(result.sentenceVerdicts.filter((verdict) => !verdict.supported).map((verdict) => verdict.index));
    const strippedClaims = narrative.filter((_, index) => rejectedIndexes.has(index)).map((sentence) => sentence.text);
    const filteredNarrative = narrative.filter((_, index) => !rejectedIndexes.has(index));

    return {
      narrative: filteredNarrative,
      strippedClaims,
      level: result.level,
      coveragePct: result.coveragePct,
      missingData: result.missingData,
    };
  }
}
