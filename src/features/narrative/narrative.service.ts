import { narrativeGenerationSchema, type Cause, type Evidence, type NarrativeGeneration } from "../../lib/contract";
import type { OpenRouterClient } from "../../lib/openrouter";

export interface NarrativeInput {
  metric: string;
  segment: string;
  period: string;
  changePct: number;
  unit: string;
  causes: Cause[];
  evidence: Evidence[];
}

const SYSTEM_PROMPT = `You are the narrative-writing step of Because.ai, a system that explains why a business metric moved.
You are given a metric change, a set of deterministically computed causes, and a set of evidence items (queries, CRM notes, support tickets, call excerpts).
Write a short headline and a narrative made of individual sentences. Some sentences state a fact or claim backed by evidence: set evidenceIds to the ids of the evidence items that support it, only from the ids you were given, never invent an id. Connective or summary sentences that add no new factual claim should have an empty evidenceIds array.
Only state what the causes and evidence actually support. Do not speculate about causes you were not given.
Also write 1-3 recommended actions: concrete next steps a business leader could take, each with affectedEntities (who it involves) and a rationale grounded in the causes/evidence above.`;

export class NarrativeService {
  constructor(private openRouter: OpenRouterClient) {}

  async generate(input: NarrativeInput): Promise<NarrativeGeneration> {
    const user = JSON.stringify({
      metric: input.metric,
      segment: input.segment,
      period: input.period,
      changePct: input.changePct,
      unit: input.unit,
      causes: input.causes.map((cause) => ({
        id: cause.id,
        claim: cause.claim,
        contributionPoints: cause.contributionPct,
        evidenceIds: cause.evidence,
      })),
      evidence: input.evidence.map((item) => ({
        id: item.id,
        type: item.type,
        sourceId: item.sourceId,
        excerpt: item.excerpt,
      })),
    });

    return this.openRouter.completeStructured(
      { system: SYSTEM_PROMPT, user, schemaName: "narrative_generation" },
      narrativeGenerationSchema
    );
  }
}
