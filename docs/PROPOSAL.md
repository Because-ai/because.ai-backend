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

A seven-stage pipeline. Stages 1–3 produce every number. Stage 4 writes prose. Stage 5 is a
second, isolated model whose only job is to delete unsupported sentences. Stages 6 and 7 are
deterministic again. The LLM is never the source of a quantitative claim.

| Stage | Method | What it does |
|---|---|---|
| 1 Detection | Statistics | Trailing-6-month mean ± Nσ band per series, plus a business-impact floor. A move is raised only if it is both statistically unusual and large enough to act on. |
| 2 Suppression | Business rules | Suppresses moves that overlap a known promo or holiday, with the reason shown. |
| 3 Attribution | Deterministic SQL | Splits the change across category mix, discount rate, account movement and marketing spend; each query is captured as evidence. |
| 4 Retrieval + Narrative | Vector search + 1 LLM call | CRM notes filtered to the affected accounts, then one model call writes 5–8 sentences, each tied to an evidence id enforced by schema. |
| 5 Verifier | 1 isolated LLM call | Re-reads each sentence against only its cited evidence, removes the unsupported ones. Coverage and verdict are computed in code. |
| 6 Publish decision | Deterministic | Two gates on the verified output: a coverage floor, and a contradiction check across sources. Failing either means the finding publishes without an explanation. |
| 7 Personas | Deterministic | Selects which verified sentences and actions each audience sees. A strict subset — it can never introduce a claim. |

Governance is a **KPI contract** per metric: definition, formula, grain, source lineage,
named drivers, materiality thresholds, owner, refresh cadence, and access rules. The
pipeline reads it before it reads any data.

When coverage falls below a floor, or sources contradict each other, the engine **abstains**
— it publishes the movement, states what it checked, and asks a specific question instead of
guessing. In our run this fired twice, and once was on a finding whose coverage was
*acceptable*: the contradiction check caught every CRM note for the declining accounts
reporting business as usual. Coverage alone would have let that through.

A **feedback loop** closes it. Two "not material" responses on a series widen its significance
band; two "wrong driver" responses hide that driver. Both are visible, with their reason, and
both take effect on the next run rather than in a backlog.

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
surfaces, tens of thousands of interactions per week, and a team of 6 analysts spending
roughly 40% of their time on "what changed and why" triage.

**Measured in the prototype**, not estimated:

| | |
|---|---|
| Cost per explained finding | **$0.00078** |
| Full sweep of 20 metric-region pairs | **$0.011** |
| Findings that cost nothing at all | 6 of 20 — sparse and suppressed exit before any model call |
| Median end-to-end latency | 6.8s |
| Attribution (the whole causal drill-down) | 26ms worst case, no model call |

**Projected from those figures:**

| Lever | Estimate |
|---|---|
| Analyst triage time reclaimed | 6 analysts × 40% × ~30% automatable ≈ **0.7 FTE** |
| Decision latency | Monday-morning digest vs. mid-week manual note: **2–3 days faster** |
| Model spend, 200 watched series checked daily | ~140 raised × $0.00078 × 30 ≈ **$3.30/month** |
| Same at 10× the data volume | **unchanged** — detection is free and gates every paid call |

That last row is the whole economic argument. Cost is a function of **how many findings are
raised**, not how much data is scanned, because the significance test, the materiality floor,
the calendar check and the entire attribution drill-down are deterministic SQL and statistics
that cost nothing to run on everything. The paid model calls only fire on the small fraction
of series that actually moved and survived both gates.

Set against roughly $0.70 of analyst time per manual explanation at a mid-market loaded rate,
the unit economics are not close. The constraint on this system is trust, not cost — which is
why the verifier and the abstention path exist.

## 5. Phased roadmap

| Phase | Scope | Exit |
|---|---|---|
| Prototype (now) | 4 KPIs, 5 regions, 3 sources at 2 grains; Postgres + pgvector | All seven stages live. 20 combinations swept for $0.011: 12 explained, 2 abstained, 2 suppressed, 4 sparse. |
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

## Evidence this works

One full sweep, reproducible with `bun run demo`:

| | |
|---|---|
| Combinations checked | 20 (4 metrics × 5 regions) |
| Explained | 12 |
| Abstained — evidence would not support a story | 2 |
| Suppressed — calendar or below the materiality floor | 2 |
| Sparse — too little history to judge, no model call | 4 |
| Claims deleted by the verifier | 12 |
| Evidence gaps named | 20 |
| Coverage range / mean | 38%–100% / 67% |
| Verdicts | 1 sure, 9 probably, 2 not sure |
| Total cost | $0.011 |

The coverage *spread* is the point. A system that always returns "sure" is printing a label,
not measuring anything. Two findings published at 38% coverage and are labelled **not sure**
on the card, two refused to explain themselves at all, and six cost nothing because the
system correctly decided there was nothing to explain.

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
