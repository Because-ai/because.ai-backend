import { z } from "zod";
import { actionSchema, type Cause, type Evidence, type NarrativeGeneration } from "../../lib/contract";
import type { LlmClient } from "../../lib/llm";
import type { TokenUsage } from "../../lib/pricing";

export interface NarrativeResult extends NarrativeGeneration {
  usage: TokenUsage;
}

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

Write a short headline, then a narrative of 5 to 8 sentences in this fixed order: what changed, where it changed, why it changed, why it matters, what to do next.

One evidence item with id "q-monthly-trend" is the query behind the overall metric change itself (the six-month series and its numbers) — cite it for the opening "what changed" sentence, since that is the evidence that actually proves the topline number.

Every sentence that states a factual claim MUST carry at least one evidence id in evidenceIds. Only a purely connective or transitional sentence (one that adds no new factual claim on its own) may have an empty evidenceIds array; this should be rare, not the default. The schema only allows evidence ids that actually exist, so pick from what you were given.

Only state what the causes and evidence actually support. Do not speculate about causes you were not given.

Also write 1-3 recommended actions: concrete next steps a business leader could take, each with affectedEntities (who it involves) and a rationale grounded in the causes/evidence above.`;


function buildNarrativeSchema(evidenceIds: string[]) {
  const uniqueIds = [...new Set(evidenceIds)];
  const idSchema = uniqueIds.length > 0 ? z.enum(uniqueIds as [string, ...string[]]) : z.string();

  return z.object({
    headline: z.string(),
    narrative: z.array(
      z.object({
        text: z.string(),
        evidenceIds: z.array(idSchema),
      })
    ),
    actions: z.array(actionSchema),
  });
}

export class NarrativeService {
  constructor(private llm: LlmClient) {}

  get model(): string {
    return this.llm.model;
  }

  async generate(input: NarrativeInput): Promise<NarrativeResult> {
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
        table: item.table,
      })),
    });

    const schema = buildNarrativeSchema(input.evidence.map((item) => item.id));
    const result = await this.llm.completeStructured({ system: SYSTEM_PROMPT, user, schemaName: "narrative_generation" }, schema);
    return { ...(result.value as NarrativeGeneration), usage: result.usage };
  }
}
