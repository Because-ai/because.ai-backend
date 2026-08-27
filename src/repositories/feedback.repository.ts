import type { JSONValue, Sql } from "postgres";

export interface FeedbackInput {
  findingId: string;
  metric: string;
  segment: string;
  persona?: string | null;
  role?: string | null;
  target: "finding" | "sentence" | "cause" | "action";
  targetRef?: string | null;
  verdict: "accept" | "reject" | "correct";
  comment?: string | null;
}

export interface FeedbackRow extends FeedbackInput {
  id: string;
  createdAt: string;
}

export interface BandMultiplierAdjustment {
  metric: string;
  segment: string;
  kind: "band_multiplier";
  value: { multiplier: number };
  reason: string;
  updatedAt: string;
}

export interface SuppressedDriverAdjustment {
  metric: string;
  segment: string;
  kind: "suppressed_driver";
  value: { drivers: string[] };
  reason: string;
  updatedAt: string;
}

export type LearnedAdjustment = BandMultiplierAdjustment | SuppressedDriverAdjustment;

export class FeedbackRepository {
  constructor(private sql: Sql) {}

  async save(input: FeedbackInput): Promise<void> {
    await this.sql`
      insert into feedback (finding_id, metric, segment, persona, role, target, target_ref, verdict, comment)
      values (
        ${input.findingId}, ${input.metric}, ${input.segment}, ${input.persona ?? null}, ${input.role ?? null},
        ${input.target}, ${input.targetRef ?? null}, ${input.verdict}, ${input.comment ?? null}
      )
    `;
  }

  async listByFinding(findingId: string): Promise<FeedbackRow[]> {
    const rows = await this.sql<
      {
        id: string;
        finding_id: string;
        metric: string;
        segment: string;
        persona: string | null;
        role: string | null;
        target: FeedbackInput["target"];
        target_ref: string | null;
        verdict: FeedbackInput["verdict"];
        comment: string | null;
        created_at: Date | string;
      }[]
    >`
      select * from feedback where finding_id = ${findingId} order by created_at desc
    `;
    return rows.map((row) => ({
      id: row.id,
      findingId: row.finding_id,
      metric: row.metric,
      segment: row.segment,
      persona: row.persona,
      role: row.role,
      target: row.target,
      targetRef: row.target_ref,
      verdict: row.verdict,
      comment: row.comment,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    }));
  }

  async count(metric: string, segment: string, target: string, verdict: string, targetRef?: string): Promise<number> {
    const rows = targetRef
      ? await this.sql<{ count: string }[]>`
          select count(*) as count from feedback
          where metric = ${metric} and segment = ${segment} and target = ${target} and verdict = ${verdict} and target_ref = ${targetRef}
        `
      : await this.sql<{ count: string }[]>`
          select count(*) as count from feedback
          where metric = ${metric} and segment = ${segment} and target = ${target} and verdict = ${verdict}
        `;
    return Number(rows[0]?.count ?? 0);
  }

  async distinctRejectedCauses(metric: string, segment: string): Promise<{ targetRef: string; count: number }[]> {
    const rows = await this.sql<{ target_ref: string; count: string }[]>`
      select target_ref, count(*) as count from feedback
      where metric = ${metric} and segment = ${segment} and target = 'cause' and verdict = 'reject' and target_ref is not null
      group by target_ref
    `;
    return rows.map((row) => ({ targetRef: row.target_ref, count: Number(row.count) }));
  }

  async upsertAdjustment(
    metric: string,
    segment: string,
    kind: LearnedAdjustment["kind"],
    value: JSONValue,
    reason: string
  ): Promise<void> {
    await this.sql`
      insert into learned_adjustments (metric, segment, kind, value, reason, updated_at)
      values (${metric}, ${segment}, ${kind}, ${this.sql.json(value)}, ${reason}, now())
      on conflict (metric, segment, kind)
      do update set value = excluded.value, reason = excluded.reason, updated_at = now()
    `;
  }

  async getAdjustments(metric: string, segment: string): Promise<LearnedAdjustment[]> {
    const rows = await this.sql<
      { metric: string; segment: string; kind: LearnedAdjustment["kind"]; value: unknown; reason: string; updated_at: Date | string }[]
    >`
      select metric, segment, kind, value, reason, updated_at from learned_adjustments
      where metric = ${metric} and segment = ${segment}
    `;
    return rows.map((row) => ({
      metric: row.metric,
      segment: row.segment,
      kind: row.kind,
      value: row.value,
      reason: row.reason,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    })) as LearnedAdjustment[];
  }

  async listAdjustments(): Promise<LearnedAdjustment[]> {
    const rows = await this.sql<
      { metric: string; segment: string; kind: LearnedAdjustment["kind"]; value: unknown; reason: string; updated_at: Date | string }[]
    >`
      select metric, segment, kind, value, reason, updated_at from learned_adjustments order by updated_at desc
    `;
    return rows.map((row) => ({
      metric: row.metric,
      segment: row.segment,
      kind: row.kind,
      value: row.value,
      reason: row.reason,
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    })) as LearnedAdjustment[];
  }
}
