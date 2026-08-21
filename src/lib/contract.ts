import { z } from "zod";

export const severitySchema = z.enum(["critical", "watch", "resolved"]);
export const verdictLevelSchema = z.enum(["sure", "probably", "not_sure"]);
export const evidenceTypeSchema = z.enum(["query", "note", "ticket", "call"]);

export const evidenceSchema = z.object({
  id: z.string(),
  type: evidenceTypeSchema,
  sourceId: z.string(),
  excerpt: z.string(),
  meta: z.record(z.string(), z.string()),
  table: z
    .object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .optional(),
});

export const evidenceMapSchema = z.record(z.string(), evidenceSchema);

export const narrativeSentenceSchema = z.object({
  text: z.string(),
  evidenceIds: z.array(z.string()),
});

export const causeSchema = z.object({
  id: z.string(),
  claim: z.string(),
  contributionPct: z.number(),
  evidence: z.array(z.string()),
});

export const actionSchema = z.object({
  recommendation: z.string(),
  affectedEntities: z.array(z.string()),
  rationale: z.string(),
});

export const verdictSchema = z.object({
  level: verdictLevelSchema,
  coveragePct: z.number(),
  strippedClaims: z.array(z.string()),
  missingData: z.array(z.string()),
});

export const trendSchema = z.object({
  labels: z.array(z.string()),
  values: z.array(z.number()),
  unit: z.string(),
});

export const insightSchema = z.object({
  id: z.string(),
  trend: trendSchema,
  metric: z.string(),
  segment: z.string(),
  period: z.string(),
  changePct: z.number(),
  severity: severitySchema,
  detectedAt: z.string(),
  isSignificant: z.boolean(),
  suppressedReason: z.string().nullable(),
  headline: z.string(),
  narrative: z.array(narrativeSentenceSchema),
  causes: z.array(causeSchema),
  actions: z.array(actionSchema),
  verdict: verdictSchema,
});

export type Severity = z.infer<typeof severitySchema>;
export type VerdictLevel = z.infer<typeof verdictLevelSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type EvidenceMap = z.infer<typeof evidenceMapSchema>;
export type NarrativeSentence = z.infer<typeof narrativeSentenceSchema>;
export type Cause = z.infer<typeof causeSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Trend = z.infer<typeof trendSchema>;
export type Insight = z.infer<typeof insightSchema>;

export const narrativeGenerationSchema = z.object({
  headline: z.string(),
  narrative: z.array(narrativeSentenceSchema),
  actions: z.array(actionSchema),
});
export type NarrativeGeneration = z.infer<typeof narrativeGenerationSchema>;

export const verifierOutputSchema = z.object({
  sentenceVerdicts: z.array(
    z.object({
      index: z.number(),
      supported: z.boolean(),
      reason: z.string().optional(),
    })
  ),
  level: verdictLevelSchema,
  coveragePct: z.number(),
  missingData: z.array(z.string()),
});
export type VerifierOutput = z.infer<typeof verifierOutputSchema>;
