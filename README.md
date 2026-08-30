# Because.ai

An automated explanation engine for business metrics.

Accenture Innovation Challenge 2026, Round 2, problem statement 3, BusinessIntelligence.ai.

Team Status 200: Mrinal Satyarthi, Aman Khakre, Himanshu Verma. IIT Patna, 2028.

| | |
|---|---|
| Business proposal | [`docs/PROPOSAL.md`](docs/PROPOSAL.md) |
| Demo video script | [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) |
| Frontend repository | [because.ai-main](https://github.com/Because-ai/because.ai-main) |
| Demo video | _link here_ |

---

## What it is, and what it is not

It is not a chatbot. There is no text input, no chat history, and nothing to ask. Asking the right question is the part people are bad at, and a system that waits to be asked only helps the people who already knew what to look for.

Because.ai runs on a schedule. It watches a set of metrics, decides on its own when one has moved in a way worth explaining, works out why, writes the explanation, checks its own work, and pushes the result out. A leader opens it and the answers are already there.

The brief asked for a KPI storytelling engine that explains what changed in a business metric, identifies likely root causes, and recommends next steps, using both structured and unstructured data. This does that, and adds the part we think actually matters: it states how confident it is, and it deletes claims it cannot support.

---

## How this meets the brief

Every minimum prototype expectation, and where to see it.

| The brief asked for | Where it is | See it |
|---|---|---|
| 3–5 connected KPIs across 2–3 sources with different grains | 4 KPIs (`sales`, `profit`, `quantity`, `discount`) across 3 sources: warehouse (monthly), CRM notes (per interaction), marketing spend (**daily**, reconciled to monthly) | `/sources`, `GET /api/sources` |
| A lightweight KPI / semantic contract | `src/config/contract.ts`: definition, formula, grain, lineage, drivers, materiality thresholds, owner, refresh cadence, access rules | `/contract`, `GET /api/contract` |
| ≥2 personas receiving different narratives or actions | Executive, regional manager and analyst views on every finding, each with a delivery channel | persona switcher on any finding |
| One multi-factor KPI movement with known drivers | Attribution ranks category mix, discount rate, account movement and marketing spend, each with its own evidence | "What drove this" on any finding |
| One low-confidence scenario that abstains or asks | Coverage below the floor, or a detected contradiction, publishes the movement plus a clarifying question and no explanation | the finding marked **Abstained** |
| One sparse-history / newly launched KPI | The `Online` region has 2 months of history; fewer than 3 returns a "collecting history" card and spends nothing | the `Online` cards |
| One role-based security / entitlement scenario | `?role=` scopes metrics and regions, 403s out-of-scope requests, redacts customer names | role switch in the top nav |
| Evidence: freshness, method, contribution, confidence, lineage | Every evidence item is stamped with source system, grain, refresh date and method; contribution is a ranked percentage; coverage is computed in code | the evidence drawer |
| A clear LLM vs non-LLM breakdown | Per-finding map of which step was SQL, statistics, vector search or a model call | "How this was computed" on any finding |
| Runtime telemetry: latency, model calls, tokens, cost | Captured per step on every live run and stored with the finding | "Run cost & timing" on any finding |

The LLM is never the source of a quantitative claim. Detection, suppression and attribution
produce every number with no model call; the two model calls write the prose and delete the
parts of it that the evidence does not support.

---

## What the pipeline adds beyond storytelling

- **A governed KPI contract** (`src/config/contract.ts`, `GET /api/contract`). Per-metric definition, formula, grain, source lineage, named drivers, materiality thresholds, owner, refresh cadence and access rules. The pipeline reads it before it reads data.
- **Two-part materiality**. A move is raised only if it is statistically unusual *and* large enough in absolute terms or as a share of a typical month. Statistically odd but trivially small moves are stated and not raised.
- **Persona views**. Every finding carries an executive, regional-manager and analyst version of the narrative and actions. Each is a subset of the sentences the verifier approved, so switching persona never introduces a claim.
- **Role-based entitlement** (`src/config/roles.ts`). `?role=cfo|west_sales_lead|ops_viewer` scopes metrics and regions, returns 403 for out-of-scope requests, and redacts customer names for roles without the PII grant. Every finding records the role it was viewed as.
- **A feedback loop** (`POST /api/feedback`, migrations 005–006). Two "not material" responses widen that series' significance band; two "wrong driver" responses hide that driver. `GET /api/feedback/learned` lists every adjustment and the reason for it.
- **Abstention**. When verifier coverage falls below a floor, or a deterministic check finds sources contradicting each other, the engine publishes the movement and a specific clarifying question instead of a low-confidence explanation.
- **A sparse-history path**. A series with fewer than three months of data returns a "collecting history" card with zero model spend, rather than erroring or guessing.
- **A daily-grain source**. `marketing_spend` (migration 007) is summed from daily to monthly inside attribution, and its evidence states the reconciliation and the staleness of the last row.
- **Runtime telemetry**. Every finding carries per-step latency, prompt and completion token counts, model-call count and an estimated USD cost (`src/lib/pricing.ts`).

---

## The pipeline

Seven stages. All of them run, none are stubs, and only two of them call a model.

### 01. Learns the business

Metrics are declarative config, not hand-written queries:

```ts
sales: {
  key: "sales",
  label: "Sales",
  table: "orders",
  valueColumn: "sales",
  aggregate: "sum",
  dateColumn: "order_date",
  segmentColumn: "region",
  goodDirection: "up",
  unit: "$ sales",
}
```

The pipeline reads this to know how to aggregate the metric, how to slice it, and which direction is healthy. `goodDirection` is why a rising discount renders as a problem and rising profit does not. The sign of the change and the judgement about the change are separate things.

Adding a metric is adding a config entry. It does not mean editing pipeline code.

### 02. Checks it is real

Three gates, all deterministic.

First, a significance band. We take the trailing six month-over-month percentage changes for that metric and segment, and compute mean ± Nσ. A move clears the first gate only if it falls outside that band.

Second, a materiality floor from the KPI contract. Statistical unusualness alone is not enough. The move must also be worth a dollar amount above a threshold, or a meaningful share of a typical month for that series. This is what stops a tiny-but-odd swing on a quiet metric from reaching a leader. Both tests are reported in plain language, not as a boolean:

> Sales fell 56.0%, outside the normal range of -20.8% to 79.5% over the trailing 6 months, and the $18,400 swing is large enough to matter (31% of a typical month)

> Profit moved 41.2%, statistically unusual, but the $840 swing is too small to act on (4% of a typical month), so it is not raised

The N in Nσ is not a constant. It starts at 1.5 and moves per series as the feedback loop learns which movements that team actually cares about, and the reason is appended to the sentence when it differs.

Third, a calendar check. If the flagged period overlaps a known event, the finding is suppressed with the reason stated:

> Overlaps Black Friday / Cyber Monday, a known promo running 20 Nov 2017 to 2 Dec 2017. Expected, so not raised as a finding.

A suppressed finding still appears in the interface, greyed out, with its reason. Hiding it entirely would mean the reader could not tell the difference between "nothing happened" and "nothing was checked".

Percentage change divides by the **absolute** prior value. A metric like profit crosses zero, and `(current - prior) / prior` flips sign whenever `prior` is negative. A month that went from a $563 loss to a $10,760 profit reads as -2009% and gets classified as a critical decline while the chart shows it spiking upward.

### 03. Finds the cause

Deterministic SQL. No model call.

- Category contribution to the delta, weighted by order-mix share when the metric is an average rather than a sum
- Average-discount shift over the same window
- The customers who moved most, returning real customer IDs from the dataset

The IDs are the handoff to step 04's retrieval: notes are filtered to those customers *before* the vector search, not after. Searching all notes and hoping the right ones surface is how you end up citing a note about an unrelated region, which is exactly the failure that destroys credibility the moment a judge clicks through.

Each query is captured as evidence, both the literal SQL and the rows it returned, so a claim built on it can be opened and checked.

Runtime is under 25ms.

### 04. Writes the answer

One model call. It receives the computed statistics, the causes, and the evidence, and returns structured sentences, each carrying the IDs of the evidence supporting it.

Sourcing is enforced by the response schema, not by the prompt. `evidenceIds` is a typed enum built per call from the IDs actually supplied:

```ts
const idSchema = z.enum(uniqueIds as [string, ...string[]]);
```

An invented ID fails schema validation and the call is retried. "Please cite your sources" gets ignored under load; a schema that will not accept an unknown ID cannot be.

### 05. Checks its own work

A second model call, and the isolation is the entire mechanism.

The verifier sees only two things: the sentences, and the content of the evidence those sentences cite. It never sees the generator's prompt, its reasoning, or the cause list. If it inherited that context it would inherit the same assumptions, agree with itself, and the check would be theatre.

Its prompt is adversarial. Its job is finding claims that are not supported, not confirming ones that look fine. Per sentence it rules `supported`, `partly`, or `unsupported`. Unsupported sentences are **removed from what the reader sees**, not annotated.

Coverage and the verdict are computed in code from those rulings, never asserted by the model:

```
coverage = (supported + 0.5 × partly) / judgeable
> 90%  → sure
60–90% → probably
< 60%  → not_sure
```

A model asked to score its own output will tend to score it well. Taking the arithmetic away from it is the difference between a system that reports confidence and one that measures it.

This step earned its place during development. It caught a real bug we had not planted: our trend evidence formatted values with `maximumFractionDigits: 0`, so average discount, which is stored as a fraction, rendered as a column of zeros. The verifier read `0 → 0`, correctly concluded no increase had occurred, and stripped claims that were true. It was right about the evidence and wrong about reality, because the evidence was broken. We found the formatting bug by reading its objections.

### 06. Decides whether to publish at all

Verification produces a coverage number, not a decision. Two deterministic checks turn it
into one.

If coverage falls below a floor, the explanation is not shown. If a contradiction check
fires (accounts flagged as declining while every CRM note retrieved for them reports
business as usual, or a category breakdown pointing against the headline), the same thing
happens, regardless of coverage.

In either case the finding still publishes. It carries the movement, the band it broke, what
was checked, what was missing, and one specific question:

> Was there a pricing, assortment or staffing change in South during Aug? No CRM or calendar
> record was found.

This is the difference between a system that is quiet when it is unsure and one that is
articulate about being unsure. The movement is real and someone should know about it. The
explanation is the part we could not stand behind.

### 07. Cuts it for the reader

The verified sentences and actions are then selected down per persona: three sentences and
one decision for an executive, named accounts and this week's actions for a regional
manager, everything including the gaps for an analyst.

This is deterministic and free. A persona view can only ever be a subset of what the
verifier already approved, so no audience can be shown a claim that did not survive the
check, and reading the executive version cannot be less safe than reading the analyst one.

---

## Architecture

```mermaid
flowchart TD
    subgraph sources["Data sources"]
        PG[("Postgres 17 + pgvector<br/>orders · notes · marketing_spend<br/>calendar_events · feedback<br/>learned_adjustments · cached_findings")]
    end

    subgraph govern["Governance"]
        KC["KPI contract<br/><i>definitions · lineage · thresholds · access</i>"]
        RL["Roles<br/><i>metric + region scope · PII grant</i>"]
    end

    subgraph pipeline["Pipeline (backend)"]
        D["01 Detection<br/><i>significance band + materiality</i>"]
        S["02 Suppression<br/><i>calendar check</i>"]
        A["03 Attribution<br/><i>SQL drill-down · &lt;25ms</i>"]
        R["04a Retrieval<br/><i>entity-filtered vector search</i>"]
        N["04b Narrative<br/><i>model call 1</i>"]
        V["05 Verifier<br/><i>model call 2, isolated</i>"]
        DEC{"06 Publish?<br/><i>coverage floor +<br/>contradiction check</i>"}
        P["07 Personas<br/><i>deterministic subset</i>"]
    end

    subgraph external["External services"]
        VO["mxbai-embed-large-v1<br/>local, 1024-dim"]
        OR["Ollama<br/>qwen2.5:7b-instruct, local"]
    end

    UI["Frontend (Next.js 16)<br/>findings · detail · metrics<br/>contract · sources · learned"]

    KC --> D
    LA[("learned_adjustments")] -->|"band σ · hidden drivers"| D
    PG --> D
    D -->|"&lt; 3 months history"| SPARSE["Sparse finding<br/><i>no model call</i>"]
    D -->|"not material"| QUIET["Quiet finding<br/><i>reason stated</i>"]
    D -->|"material"| S
    S -->|"explained by calendar"| QUIET
    S -->|"unexplained"| A
    A -->|"customer IDs"| R
    PG -.-> R
    R <-->|"embed query"| VO
    A --> N
    R --> N
    N <--> OR
    N -->|"sentences + evidence only"| V
    V <--> OR
    V --> DEC
    DEC -->|"low coverage or<br/>contradiction"| ABST["Abstained finding<br/><i>+ clarifying question</i>"]
    DEC -->|"supported"| P
    P --> CACHE[("cached_findings")]
    QUIET --> CACHE
    SPARSE --> CACHE
    ABST --> CACHE
    CACHE --> RL
    RL -->|"scoped + redacted"| UI
    UI -->|"GET /latest, free"| CACHE
    UI -->|"POST /run, 2 model calls"| D
    UI -->|"POST /feedback"| LA
```

Three things in that diagram are worth pointing at.

**The verifier edge is deliberately the narrowest one.** It receives the sentences and the
evidence they cite, and nothing else. Every other arrow into a model carries more context;
that one carries less on purpose.

**Not every path costs money.** The sparse and quiet branches exit before any model call.
Detection is free and runs on everything, which is what keeps cost tied to findings raised
rather than to data volume.

**Entitlement sits between the cache and the interface,** not inside it. The same stored
finding is scoped and redacted on the way out according to the requesting role, so a
narrower role cannot be widened by calling the API directly.

Reads and writes are separated on purpose. `GET /api/findings/latest` serves the cache and costs nothing; `POST /api/findings/run` executes the pipeline and makes real model calls. Page views only ever hit the first. Without that split, every browser refresh would silently re-run a paid pipeline.

---

## What is real and what is simulated

Three connectors are stand-ins:

| | Production would read | This prototype reads |
|---|---|---|
| Warehouse | Snowflake | Postgres, loaded with the public Kaggle Superstore dataset |
| CRM | Salesforce | A `notes` table of generated notes, tickets and call excerpts |
| Marketing | Google Ads / Meta Ads | A generated `marketing_spend` table at daily grain |

Everything downstream of those connectors is running live, against whatever the connector returns:

- the significance test and the materiality floor
- the calendar suppression check
- the attribution drill-down, including the daily-to-monthly reconciliation of marketing spend
- vector retrieval: real cosine search over a real HNSW index, real embeddings
- narrative generation: a real model call
- the verifier: a second real model call
- the abstention decision, entitlement scoping, persona selection and the feedback loop

The notes are synthetic, but they are retrieved for real by vector search and displayed verbatim. Nothing shown in the evidence drawer is paraphrased or generated at display time.

The marketing figures are generated rather than pulled from an ad platform, but they sit at a
genuinely different grain from the warehouse. The reconciliation from daily rows to a monthly
comparison is real code doing real work, which is the part that would not change if the rows
came from Google Ads.

We are stating this plainly because overclaiming is what loses credibility. Swap the three connectors and the rest of the system does not change.

---

## Running it locally

**Prerequisites:** Bun 1.2+, Docker, and [Ollama](https://ollama.com). No API keys: both models run on your machine, so `DATABASE_URL` is the only credential.

Pull the generation model before the first run:

```bash
ollama pull qwen2.5:7b-instruct
```

### 1. Postgres with pgvector

```bash
docker run --name postgres \
  -e POSTGRES_USER=accenture-admin \
  -e POSTGRES_PASSWORD=accenture \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  -d pgvector/pgvector:pg17
```

The `pgvector` image is required. The stock `postgres` image has no `vector` extension and migration 003 will fail. Pin to `pg17`; Postgres 18 changed its data directory layout and will not start against a volume initialised by an earlier version.

### 2. Environment

Copy `.env.example` to `.env`:

```
DATABASE_URL=postgresql://accenture-admin:accenture@localhost:5432/postgres
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5:7b-instruct

PORT=4000
```

Missing or empty variables fail at boot with a message naming the variable, rather than surfacing later as a confusing runtime error.

### 3. Dataset

Download the [Sample Superstore dataset](https://www.kaggle.com/datasets/vivek468/superstore-dataset-final) and save it as `data/superstore.csv`. It is not committed.

### 4. Migrate and seed

```bash
bun install
bun run migrate            # applies src/db/migrations/*.sql in order
bun run load:superstore    # loads 9,994 rows into orders
bun run seed:calendar      # promo windows for each year in the data
bun run seed:notes         # generates and embeds 72 notes across all four regions
bun run seed:sparse        # a newly-launched "Online" region with 2 months of history
bun run seed:marketing     # daily marketing spend, with a cut in the West in Sept 2017
```

Or run the whole sequence, including a reset, with `bun run demo`.

`seed:notes` batches all 72 notes into a single embedding call. Embeddings are computed in-process by `mxbai-embed-large-v1` through ONNX, so there is no API key, no rate limit and no per-token cost. The model downloads once (~90MB, q8-quantised) and is cached thereafter. q8 was chosen over fp32 after measuring both: the retrieval ranking is identical and it is roughly 80x faster to load.

### 5. Run

```bash
bun run dev                # backend on :4000
```

Frontend, in the `because.ai-main` repo:

```bash
bun install
echo "BACKEND_URL=http://localhost:4000" > .env.local
bun run dev                # frontend on :3000
```

### 6. Populate findings

```bash
bun run populate:demo      # all 20 metric × region combinations
```

Detection is deterministic and free, so `populate:demo` sweeps every candidate month per combination to find where the metric actually moved, then spends model calls only on that month. Without the scan, running against the true latest period returns a quiet card for almost everything. The dataset's final month is unremarkable in most regions.

The sparse `Online` region is detected as such and skipped without a scan or a model call.

Expect the full sweep to take roughly an hour on a CPU-only machine, dominated by the two
generation calls per finding. It is a one-time cost: the interface reads the cache. With
free-tier rate limiter, not compute. The whole run costs about a cent.

---

## API surface

**Pipeline**

| Method | Endpoint | Cost |
|---|---|---|
| `POST` | `/api/findings/run?metric=sales&segment=West&asOf=2017-10` | 2 model calls + 1 embedding call |
| `GET` | `/api/findings/latest?metric=sales&segment=West` | free, serves cache, 404 if never run |

`asOf` pins the analysis to a historical month. Any pipeline failure falls back to the last good cached response and marks it `source: "cache"` rather than erroring.

`role` may be added to any `/api/findings` request: `cfo` (default), `west_sales_lead`, `ops_viewer`.

**Reference**

| Method | Endpoint | Returns |
|---|---|---|
| `GET` | `/api/metrics` | metric definitions from config |
| `GET` | `/api/contract` | the governed KPI contract for every metric |
| `GET` | `/api/contract/:metric` | one metric's contract |
| `GET` | `/api/sources` | connector inventory with live row counts |
| `POST` | `/api/feedback` | record analyst / business-user feedback, returns the learned adjustment |
| `GET` | `/api/feedback/learned` | every band and driver adjustment the feedback loop has made |
| `GET` | `/health` | liveness |

**Per-step, for debugging without paying for the whole pipeline**

| Method | Endpoint |
|---|---|
| `GET` | `/api/detection/run?metric=sales&segment=West&asOf=2017-10` |
| `GET` | `/api/suppression/check?segment=West&start=…&end=…` |
| `GET` | `/api/attribution/run?metric=sales&segment=West&…` |
| `GET` | `/api/retrieval/run?query=…&entityRefs=CUST-1,CUST-2` |
| `POST` | `/api/narrative/generate` |
| `POST` | `/api/verifier/verify` |

---

## Results

One full run across every metric and region, reproducible with `bun run demo`.

> The quality figures below were measured before generation moved to a local model. The
> dataset counts still hold, but coverage, verdicts and stripped-claim counts depend on the
> model doing the writing and the checking, so re-run `bun run demo` to regenerate them
> rather than quoting these.

| | |
|---|---|
| Transaction rows | 10,042 (2014-01-03 to 2017-12-30) |
| Regions / customers / categories | 5 / 803 / 3 |
| Notes, tickets and calls indexed | 72 |
| Daily marketing spend rows | 8,772 |
| Combinations checked | 20 (4 metrics × 5 regions) |
| **Explained** | 12 |
| **Abstained**, evidence would not support a story | 2 |
| **Suppressed** by calendar, or not material | 2 |
| **Sparse**, too little history to judge | 4 |
| Causes attributed | 33 |
| Evidence items produced | 54 |
| Claims stripped by the verifier | 12 |
| Evidence gaps named | 20 |
| Coverage range | 38% – 100% |
| Mean coverage | 67% |
| Verdicts | 1 sure, 9 probably, 2 not sure |

**Cost and latency**

Both models run on the machine serving the backend, so there is no per-token cost. What
replaces it is wall-clock time. Measured on a CPU-only laptop (i5-13500H, 13.7GB RAM, no
CUDA) for one explained finding, `sales / East` at 2017-01:

| | |
|---|---|
| Cost, any number of findings | **$0.00** |
| Model calls | 2 |
| Tokens | 2,568 prompt, 858 completion |
| Narrative call | 197s |
| Verifier call | 142s |
| Retrieval, including model load | 1.2s |
| Detection, suppression, attribution combined | 79ms, no model call |
| **End to end** | **5m 40s** |

The shape is the point. The deterministic stages that produce every number in the output
finish in well under a tenth of a second. Effectively all of the runtime is the two
generation calls, and findings that never reach them, the sparse and suppressed ones, cost
nothing at all.

A CUDA machine runs the same work roughly an order of magnitude faster. The interface reads
`cached_findings` rather than the pipeline, so this latency is paid once by `populate:demo`
and not by anyone opening the app.

**The interesting cases**

The six quiet findings matter as much as the fourteen loud ones:

| | Why it stayed quiet |
|---|---|
| `sales / South` (+392.7%) | Overlaps a known promo window. Suppressed, reason shown. |
| `discount / East` (+106.0%) | Same. |
| `sales`, `profit`, `quantity`, `discount` / `Online` | 2 months of history. No judgement attempted, no model call made. |

And two findings refused to explain themselves:

| | Coverage | What happened |
|---|---|---|
| `discount / South` (+212.2%) | 33% | Below the floor. Published the movement and a clarifying question instead of a narrative. |
| `discount / Central` (+84.0%) | 75% | Coverage was fine; the contradiction check fired. Every CRM note retrieved for the accounts flagged as declining reported business as usual. |

The second one is the one to look at first. It abstained *despite* acceptable coverage,
because a deterministic check caught the evidence disagreeing with itself. Coverage alone
would have let it through.

Two more, `sales / East` and `quantity / South`, published at 38% coverage and are labelled
**not sure** on the card. A system that always returns "sure" is not measuring anything.

Reproduce with `bun run demo`, or `bun run eval:full` for a per-combination breakdown with
the verifier's reasoning logged.

---

## Limitations

Stated plainly, because they are real.

**The materiality floor is hand-set, not derived.** The dollar thresholds in the KPI contract
are our judgement about this dataset, not a calibration against what a business actually acts
on. In production they would come from the metric owner, and the feedback loop would move them
it currently moves only the sigma band.

**Profit percentages are large and hard to read.** Profit crosses zero month to month in this dataset. Dividing by the absolute prior value keeps the sign correct, but a swing from a small loss to a healthy profit is still mathematically a four-figure percentage. The number is right and it looks absurd. A percentage-point presentation would suit this metric family better.

**The significance band is wide on volatile series.** Six trailing observations is a small sample, and on a noisy metric the standard deviation is large enough that the band admits almost anything. It is well-behaved on sales and units; it is loose on profit. The materiality floor catches some of what the band lets through, but more history or seasonal decomposition would be the real fix.

**Percentage change on an averaged metric is ambiguous.** For average discount, "rose 212%" and "rose 15.7 percentage points" are both true and mean different things. Our verifier flagged this on its own during evaluation. The narrative should say percentage points for `avg`-aggregated metrics; it currently does not.

**The contradiction check is a small set of specific rules.** It catches two shapes we know about: uniformly reassuring notes behind a decline, and a category breakdown pointing against the headline. It is not a general consistency engine, and a contradiction we did not anticipate will pass through it.

**The notes are synthetic.** They are retrieved for real and displayed verbatim, but we wrote them. Retrieval quality against genuine CRM text, which is inconsistent, abbreviated and contradictory, is untested.

**One dataset, one shape of business.** Retail transactions with region, category and customer dimensions. We have not tested against subscription, manufacturing, or any schema where the interesting dimensions are not already columns.

**Vector retrieval depends on attribution being right.** Notes are filtered to the customers attribution surfaced. If attribution picks the wrong customers, retrieval faithfully returns notes about them, and the verifier will not catch it. The evidence genuinely does support the sentence; it is just the wrong evidence to have gone looking for.

**Redaction is string replacement, not a data-layer control.** Customer names are scrubbed from the payload on the way out. That is honest about what it does, and it is the right shape, but a production system would not let the un-redacted value reach the process at all.

**Entitlement has no identity behind it.** The role is a cookie the user picks. It demonstrates that scoping and redaction work end to end; it is not authentication, and production would bind the role to an IdP.

**Cost figures are estimates from list prices.** Token counts are measured from the actual API responses, but the dollar figure multiplies them by prices in `src/lib/pricing.ts`. Those are correct as of writing and are not fetched live.

**Everything runs locally, and that costs wall-clock time.** Both models are served on the machine running the backend: `mxbai-embed-large-v1` in-process through ONNX, and `qwen2.5:7b-instruct` through Ollama. No customer data leaves the network and there is no per-token cost, but on a CPU-only laptop a single explained finding takes around 5 to 6 minutes, almost all of it in the two generation calls. A full sweep is closer to an hour. This is tolerable because the interface reads `cached_findings` rather than running the pipeline, so `populate:demo` is a one-time cost and the app stays instant afterwards. On a CUDA machine the same run is roughly an order of magnitude faster.

**There is deliberately no hosted fallback.** Neither for embeddings nor for generation. A second code path that nothing exercises would rot without anyone noticing, and a documented option that silently fails is worse than no option.

**Latency is a token problem, not a model-size problem.** We measured `qwen2.5:3b-instruct`
against the 7B on the same finding expecting a large speedup and did not get one: 5m 40s
against 5m 44s end to end. Generation dominates, and the smaller model does not generate
proportionally fewer tokens. If this run needs to be faster, the levers are asking for fewer
narrative sentences and shorter verifier reasons, or populating fewer combinations. Dropping
to a smaller model is not one of them.

**The verifier prompt carries worked examples, and it needs them.** Measured over six trials
on a narrative containing one fabricated causal claim, the earlier prompt caught it 2 times
out of 6 and wrongly deleted a true claim once. With three worked examples appended, naming
the specific failure mode of accepting a cause the evidence never mentions, it caught the
fabrication 6 times out of 6 with no false positives. A small local model does not infer the
standard from an abstract instruction the way a frontier model does. `bun run bench:verifier`
re-runs that check against any model.

**Model choice is a trade.** `qwen2.5:7b-instruct` was picked because it holds the strict JSON schema, including the dynamic enum of evidence ids, and because its verifier output still discriminates rather than approving everything it is shown. A smaller model will satisfy the schema and return an empty narrative; that failure is quiet, so any model swap needs checking against a known finding rather than trusting that valid JSON means correct JSON.

---

## Repository layout

```
src/
  config/          metric definitions, KPI contract, personas, roles, environment validation
  db/              migrations (001-007), client, migration runner
  features/
    detection/     01. significance band + materiality
    suppression/   02. calendar check
    attribution/   03. SQL drill-down (category, discount, accounts, marketing)
    retrieval/     04a. entity-filtered vector search
    narrative/     04b. model call 1
    verifier/      05. model call 2, isolated
    findings/      orchestration, cache, fallback, personas, abstention, telemetry
    contract/      the KPI contract as an endpoint
    feedback/      feedback capture and the learning loop
    metrics/       config as an endpoint
    sources/       connector inventory
  repositories/    data access shared across steps
  lib/             contract types, local LLM client, local embedding client, pricing, formatting
  container.ts     one place where everything is wired
scripts/           load, seed (calendar/notes/sparse/marketing), reset, populate, evaluate, demo
docs/              business proposal, demo video script
```

One directory per pipeline step. Each has a service, and a controller and routes where the step is independently useful over HTTP. Data access shared by more than one step lives in `repositories/` rather than being duplicated. Nothing constructs its own dependencies; `container.ts` does it once.
