# because.ai-backend

The live pipeline behind Because.ai's Sales/Region finding: detection → suppression → attribution → retrieval → narrative → verifier, running against a real Postgres-loaded copy of the Superstore dataset, with two real OpenRouter model calls (narrative generation and an isolated verifier) and real Voyage AI embeddings for retrieval.

## Setup

1. `bun install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — a Postgres connection string with the `pgvector` extension available (e.g. a free [Neon](https://neon.tech) project)
   - `OPENROUTER_API_KEY` — from [openrouter.ai](https://openrouter.ai)
   - `OPENROUTER_MODEL` — confirm the current cheapest/best model id yourself at [openrouter.ai/models](https://openrouter.ai/models); `.env.example` has a starting suggestion
   - `VOYAGE_API_KEY` — from [voyageai.com](https://www.voyageai.com)
3. Download the [Sample Superstore dataset](https://www.kaggle.com/datasets/vivek468/superstore-dataset-final) from Kaggle and save it as `data/superstore.csv` (not committed — see `.gitignore`)
4. `bun run migrate` — applies `src/db/migrations/*.sql` in order
5. `bun run load:superstore` — loads the CSV into `orders`
6. `bun run seed:calendar` — seeds a promo/holiday window for every year present in the loaded data (powers the suppression check)
7. `bun run seed:notes` — authors and embeds ~20 synthetic CRM notes/tickets/calls for frequent West-region customers (powers retrieval)
8. `bun run dev`

## Running the pipeline

`POST /api/findings/run?metric=sales&segment=West` runs the full live pipeline and returns `{ insights, evidence, source }` (`source` is `"live"` or `"cache"` if something failed and it fell back to the last good response).

Each step is also individually reachable for debugging, so you can test a stage without burning model/embedding calls on the rest of the pipeline:

| Step | Endpoint |
|---|---|
| Detection | `GET /api/detection/run?metric=sales&segment=West` |
| Suppression | `GET /api/suppression/check?segment=West&start=2026-08-01&end=2026-09-01` |
| Attribution | `GET /api/attribution/run?segment=West&priorValue=...&currentStart=...&currentEnd=...&priorStart=...&priorEnd=...` |
| Retrieval | `GET /api/retrieval/run?query=...&entityRefs=CUST-1,CUST-2` |
| Narrative | `POST /api/narrative/generate` (body: `{ metric, segment, period, changePct, unit, causes, evidence }`) |
| Verifier | `POST /api/verifier/verify` (body: `{ narrative, evidence }`) |

## A known thing to check before demo day

The significance test (`SIGNIFICANCE_THRESHOLD` in `src/features/detection/detection.service.ts`) needs the loaded data to actually contain a month where Sales in a region moves enough to trip it — otherwise every run just returns a suppressed/quiet finding and the narrative/verifier steps never fire. After loading the real CSV, hit `/api/detection/run?metric=sales&segment=West` (and try other regions) to confirm at least one period is significant. If the real data is too smooth, either lower the threshold or directly `UPDATE orders SET sales = ...` for a chunk of a recent month's West-region rows — this is explicitly fine (proving the pipeline reacts to real data changes is the whole point of the fallback-free "run live" demo).

## Architecture

Layered by feature, one directory per pipeline step (`src/features/<step>/`), each with its own `*.service.ts` and, where it's independently testable over HTTP, a `*.controller.ts` + `*.routes.ts`. Data access shared across steps (e.g. `orders`, used by both detection and attribution) lives in `src/repositories/`, not duplicated per feature. Everything is wired together once in `src/container.ts` — routers import already-instantiated controllers from there rather than constructing classes themselves.
