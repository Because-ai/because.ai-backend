# Because.ai

An automated explanation engine for business metrics.

Accenture Innovation Challenge 2026, Round 2, problem statement 3, BusinessIntelligence.ai.

Team Status 200: Mrinal Satyarthi, Aman Khakre, Himanshu Verma. IIT Patna, 2028.

---

## What it is, and what it is not

It is not a chatbot. There is no text input, no chat history, and nothing to ask. Asking the right question is the part people are bad at, and a system that waits to be asked only helps the people who already knew what to look for.

Because.ai runs on a schedule. It watches a set of metrics, decides on its own when one has moved in a way worth explaining, works out why, writes the explanation, checks its own work, and pushes the result out. A leader opens it and the answers are already there.

The brief asked for a KPI storytelling engine that explains what changed in a business metric, identifies likely root causes, and recommends next steps, using both structured and unstructured data. This does that, and adds the part we think actually matters: it states how confident it is, and it deletes claims it cannot support.

---

## The five steps

All five run. None are stubs.

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

Two gates, both deterministic.

First, a significance band. We take the trailing six month-over-month percentage changes for that metric and segment, and compute mean ± 1.5σ. A move is a finding only if it falls outside that band. The band is reported in plain language, not as a boolean:

> Sales fell 56.0%, outside the normal range of -20.8% to 79.5% over the trailing 6 months

Second, a calendar check. If the flagged period overlaps a known event, the finding is suppressed with the reason stated:

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

---

## Architecture

```mermaid
flowchart TD
    subgraph sources["Data sources"]
        PG[("Postgres 17 + pgvector<br/>orders · notes<br/>calendar_events · cached_findings")]
    end

    subgraph pipeline["Pipeline (backend)"]
        D["01 Detection<br/><i>significance band</i>"]
        S["02 Suppression<br/><i>calendar check</i>"]
        A["03 Attribution<br/><i>SQL drill-down · &lt;25ms</i>"]
        R["04a Retrieval<br/><i>entity-filtered vector search</i>"]
        N["04b Narrative<br/><i>model call 1</i>"]
        V["05 Verifier<br/><i>model call 2, isolated</i>"]
    end

    subgraph external["External services"]
        VO["Voyage AI<br/>voyage-4-lite · 1024-dim"]
        OR["OpenRouter<br/>gemini-2.5-flash-lite"]
    end

    UI["Frontend (Next.js 16)<br/>findings · detail · metrics · sources"]

    PG --> D
    D -->|"not significant"| QUIET["Quiet finding<br/><i>reason stated</i>"]
    D -->|"significant"| S
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
    V --> CACHE[("cached_findings")]
    QUIET --> CACHE
    CACHE --> UI
    UI -->|"GET /latest, free"| CACHE
    UI -->|"POST /run, 2 model calls"| D
```

The verifier receives only the narrative and the evidence. That edge is deliberately the narrowest one in the diagram.

Reads and writes are separated on purpose. `GET /api/findings/latest` serves the cache and costs nothing; `POST /api/findings/run` executes the pipeline and makes real model calls. Page views only ever hit the first. Without that split, every browser refresh would silently re-run a paid pipeline.

---

## What is real and what is simulated

Two connectors are stand-ins:

| | Production would read | This prototype reads |
|---|---|---|
| Warehouse | Snowflake | Postgres, loaded with the public Kaggle Superstore dataset |
| CRM | Salesforce | A `notes` table of generated notes, tickets and call excerpts |

Everything downstream of those connectors is running live, against whatever the connector returns:

- the significance test
- the calendar suppression check
- the attribution drill-down
- vector retrieval: real cosine search over a real HNSW index, real embeddings
- narrative generation: a real model call
- the verifier: a second real model call

The notes are synthetic, but they are retrieved for real by vector search and displayed verbatim. Nothing shown in the evidence drawer is paraphrased or generated at display time.

We are stating this plainly because overclaiming is what loses credibility. Swap the two connectors and the rest of the system does not change.

---

## Running it locally

**Prerequisites:** Bun 1.2+, Docker, an OpenRouter API key, a Voyage AI API key.

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
OPENROUTER_API_KEY=
OPENROUTER_MODEL=google/gemini-2.5-flash-lite
VOYAGE_API_KEY=
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
bun run seed:notes         # generates and embeds notes (one batched Voyage call)
```

`seed:notes` batches all embeddings into a single request. Voyage's free tier allows 3 requests per minute, and one call per note trips the rate limit immediately.

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
bun run populate:demo      # all 16 metric × region combinations
```

Detection is deterministic and free, so `populate:demo` sweeps every candidate month per combination to find where the metric actually moved, then spends model calls only on that month. Without the scan, running against the true latest period returns a quiet card for almost everything. The dataset's final month is unremarkable in most regions.

---

## API surface

**Pipeline**

| Method | Endpoint | Cost |
|---|---|---|
| `POST` | `/api/findings/run?metric=sales&segment=West&asOf=2017-10` | 2 model calls + 1 embedding call |
| `GET` | `/api/findings/latest?metric=sales&segment=West` | free, serves cache, 404 if never run |

`asOf` pins the analysis to a historical month. Any pipeline failure falls back to the last good cached response and marks it `source: "cache"` rather than erroring.

**Reference**

| Method | Endpoint | Returns |
|---|---|---|
| `GET` | `/api/metrics` | metric definitions from config |
| `GET` | `/api/sources` | connector inventory with live row counts |
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

One full run across every metric and segment.

| | |
|---|---|
| Transaction rows | 9,994 (2014-01-03 to 2017-12-30) |
| Regions / customers / categories | 4 / 793 / 3 |
| Notes, tickets and calls indexed | 29 |
| Combinations checked | 16 (4 metrics × 4 regions) |
| Raised as findings | 14 |
| Suppressed | 2 |
| Claims stripped by the verifier | 17 |
| Evidence gaps named | 22 |
| Coverage range | 40% – 100% |
| Mean coverage | 66% |
| Verdicts | 1 sure, 11 probably, 2 not sure |
| Attribution runtime | under 25ms, no model call |

The two `not_sure` findings are `discount · West` and `sales · East`, both at 40% coverage. They are the ones we would point a judge at first. A system that always returns "sure" is not measuring anything, and the coverage figure is only meaningful if it is sometimes low.

Reproduce with `bun run populate:demo`, or `bun run eval:full` for a per-combination breakdown with verifier reasoning logged.

---

## Limitations

Stated plainly, because they are real.

**Profit percentages are large and hard to read.** Profit crosses zero month to month in this dataset. Dividing by the absolute prior value keeps the sign correct, but a swing from a small loss to a healthy profit is still mathematically a four-figure percentage. The number is right and it looks absurd. A percentage-point presentation would suit this metric family better.

**The significance band is wide on volatile series.** Six trailing observations is a small sample, and on a noisy metric the standard deviation is large enough that the band admits almost anything. It is well-behaved on sales and units; it is loose on profit. More history, or seasonal decomposition, would tighten it.

**Percentage change on an averaged metric is ambiguous.** For average discount, "rose 212%" and "rose 15.7 percentage points" are both true and mean different things. Our verifier flagged this on its own during evaluation. The narrative should say percentage points for `avg`-aggregated metrics; it currently does not.

**The notes are synthetic.** They are retrieved for real and displayed verbatim, but we wrote them. Retrieval quality against genuine CRM text, which is inconsistent, abbreviated and contradictory, is untested.

**One dataset, one shape of business.** Retail transactions with region, category and customer dimensions. We have not tested against subscription, manufacturing, or any schema where the interesting dimensions are not already columns.

**Vector retrieval depends on attribution being right.** Notes are filtered to the customers attribution surfaced. If attribution picks the wrong customers, retrieval faithfully returns notes about them, and the verifier will not catch it. The evidence genuinely does support the sentence; it is just the wrong evidence to have gone looking for.

**Rate limits shape the runtime.** Voyage's free tier is 3 requests per minute. There is retry with backoff, and a full 16-combination populate spends time waiting on it.

---

## Repository layout

```
src/
  config/          metric definitions, environment validation
  db/              migrations, client, migration runner
  features/
    detection/     01. significance band
    suppression/   02. calendar check
    attribution/   03. SQL drill-down
    retrieval/     04a. entity-filtered vector search
    narrative/     04b. model call 1
    verifier/      05. model call 2, isolated
    findings/      orchestration, cache, fallback
    metrics/       config as an endpoint
    sources/       connector inventory
  repositories/    data access shared across steps
  lib/             contract types, OpenRouter and Voyage clients, formatting
  container.ts     one place where everything is wired
scripts/           load, seed, populate, evaluate
```

One directory per pipeline step. Each has a service, and a controller and routes where the step is independently useful over HTTP. Data access shared by more than one step lives in `repositories/` rather than being duplicated. Nothing constructs its own dependencies; `container.ts` does it once.
