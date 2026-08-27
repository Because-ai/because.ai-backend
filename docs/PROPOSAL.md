# Because.ai — Business Proposal

Accenture Innovation Challenge 2026 · Round 2 · Track 3, BusinessIntelligence.ai
Team Status 200: Mrinal Satyarthi, Aman Khakre, Himanshu Verma.

---

## 1. Problem framing

Every enterprise tracks dozens of KPIs across fragmented systems. The hard part is not
building another dashboard — it is knowing which movement matters this week, why it
happened, and what to do about it, before the number is stale.

Three failure modes are common:

- **The question bottleneck.** A dashboard answers questions. Asking the right one is the
  skill most people lack, so a pull-based tool only helps the people who already knew
  where to look.
- **Explanation without evidence.** An LLM asked "why did sales drop?" will produce a
  fluent, plausible, unfalsifiable paragraph. Leaders act on it. Some of it is wrong.
- **Slow triage.** By the time an analyst has reconciled three source systems and written
  the note, the decision window has moved.

Because.ai is push-based. It runs on a schedule, decides on its own when a KPI has moved
in a way worth explaining, works out why from deterministic queries, writes the
explanation, checks its own work by removing every claim it cannot support, and delivers
a different version of the story to each audience.

## 2. Solution design

A six-stage pipeline. Stages 1–3 produce every number. Stage 4 writes prose. Stage 5 is a
second, isolated model whose only job is to delete unsupported sentences. The LLM is never
the source of a quantitative claim.

| Stage | Method | What it does |
|---|---|---|
| 1 Detection | Statistics | Trailing-6-month mean ± Nσ band per series, plus a business-impact floor. A move is raised only if it is both statistically unusual and large enough to act on. |
| 2 Suppression | Business rules | Suppresses moves that overlap a known promo or holiday, with the reason shown. |
| 3 Attribution | Deterministic SQL | Splits the change across category mix, discount rate, account movement and marketing spend; each query is captured as evidence. |
| 4 Retrieval + Narrative | Vector search + 1 LLM call | CRM notes filtered to the affected accounts, then one model call writes 5–8 sentences, each tied to an evidence id enforced by schema. |
| 5 Verifier | 1 isolated LLM call | Re-reads each sentence against only its cited evidence, removes the unsupported ones. Coverage and verdict are computed in code. |
| 6 Personas | Deterministic | Selects which verified sentences and actions each audience sees. |

Governance is a **KPI contract** per metric: definition, formula, grain, source lineage,
named drivers, materiality thresholds, owner, refresh cadence, and access rules. The
pipeline reads it before it reads any data.

When coverage falls below a floor, or sources contradict each other, the engine
**abstains** — it publishes the movement and a clarifying question instead of a guess.

## 3. Target users

Three personas, each a view onto the same verified finding, delivered on a different
channel:

| Persona | Sees | Channel |
|---|---|---|
| Executive | 2–3 sentences, the dollar impact, one decision | Monday leadership digest |
| Regional manager | Named accounts, this-week actions | Slack alert to the regional channel |
| Analyst | Full narrative, every evidence gap, all links | BI workspace |

Three entitlement roles, enforced at the API:

| Role | Metrics | Regions | Customer names |
|---|---|---|---|
| CFO | all | all | visible |
| West sales lead | all | West only | visible |
| Ops viewer | sales, units | all | redacted |

## 4. Business case and impact

Assumptions (directional, per the brief): an enterprise running ~3 AI-assisted analytics
surfaces, tens of thousands of interactions per week, a team of 6 analysts spending ~40%
of their time on "what changed and why" triage.

| Lever | Estimate |
|---|---|
| Analyst triage time reclaimed | 6 analysts × 40% × ~30% automatable ≈ 0.7 FTE |
| Decision latency | Monday-morning digest vs. mid-week manual note: 2–3 days faster |
| Cost per insight | measured live in the prototype telemetry (tokens × current model price + embeddings); on `gemini-2.5-flash-lite` + `voyage-4-lite` this is fractions of a cent per finding |
| Monthly run cost at 40k interactions/week | dominated by the deterministic stages, which are free; model spend scales with *findings raised*, not interactions, because detection gates it |

The economic argument is that deterministic-first design decouples cost from volume: the
significance test and attribution run on every series for nothing, and the paid model
calls only fire on the small fraction of series that actually moved.

## 5. Phased roadmap

| Phase | Scope | Exit |
|---|---|---|
| Prototype (now) | 4 KPIs, 5 regions, Superstore + synthetic CRM + generated marketing spend, Postgres + pgvector | This repo: all six stages live, personas, roles, feedback loop, telemetry, abstention |
| Pilot (4–6 weeks) | 1 real warehouse, 5 governed KPIs, read-only connectors, 10 named users | Coverage and false-positive rates measured against analyst judgement |
| Production connectors (1 quarter) | Snowflake + Salesforce connectors, RBAC via the customer IdP, retention and audit policy | SOC2-aligned data handling, per-tenant KPI contracts |
| Scale (ongoing) | Multi-tenant governed semantics, drift monitoring, connector SDK for Fabric / Databricks / Looker | New tenant onboarded by writing a contract, not code |

## 6. Key risks and mitigations

| Risk | Mitigation |
|---|---|
| Model cost drift | Deterministic-first design; detection gates paid calls; per-insight telemetry makes cost visible; model tier is a config value. |
| Over-flagging → alert fatigue | Two-part materiality (statistical *and* business impact); per-series sensitivity that widens automatically when a team repeatedly marks findings immaterial. |
| Under-flagging → missed liability | Feedback path narrows the band when a team flags a missed move; abstention surfaces "something happened here we cannot explain" rather than staying silent. |
| Hallucinated explanations | The LLM never produces a number; the isolated verifier removes unsupported sentences; coverage is computed in code and sometimes low on purpose. |
| Data quality / freshness | The KPI contract carries lineage and refresh cadence; evidence shows source freshness; stale sources are flagged. |
| Wrong evidence retrieved | Notes are filtered to the accounts attribution surfaced; if that is wrong, the verifier will not catch it — documented as a known limitation and a target for the feedback loop. |
| Privacy / regulation (GDPR, India DPDP) | Row- and column-level entitlement enforced at the API; customer names redacted for roles without the PII grant; every finding records the role it was viewed as; retention and consent handled at the connector layer in production. |
| Adoption | Push model ("explanations, already written"); persona-specific delivery on the channel each role already uses; feedback is one click and visibly changes behaviour. |

---

## What is real and what is simulated

| | Production would read | This prototype reads |
|---|---|---|
| Warehouse | Snowflake | Postgres + the public Kaggle Superstore dataset |
| CRM | Salesforce | A generated `notes` table, embedded for real vector search |
| Marketing | Google Ads / Meta Ads | A generated daily `marketing_spend` table |

Everything downstream of the connectors runs live: the significance test, the calendar
check, the attribution SQL, real cosine retrieval over a real HNSW index, a real narrative
model call, and a real isolated verifier call. Swap the connectors and the rest does not
change.
