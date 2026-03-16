# @b3-crow/core-interaction-service

CROW CCTV Core Interaction Service — receives session triggers, runs sequential LLM analysis on composite frames, stores interaction documents, provides cross-session RAG retrieval, and performs daily camera calibration.

## API Endpoints

### `POST /analyze` — Session Analysis

Receives a session-close trigger, fetches composites from R2, runs sequential Gemini 2.0 Flash analysis per 5-minute time period, and writes interaction documents to D1.

**Request:**

```json
{
  "store_id": "store1",
  "session_start": 1709276400,
  "session_end": 1709280000
}
```

**Auth:** `Authorization: Bearer <token>`

**Behavior:**

- Groups session frames into 5-minute periods
- Analyzes each period sequentially, chaining previous summary as context
- Queries Vectorize for similar prior sessions (RAG, top 3)
- Embeds completed interaction into Vectorize (best-effort)
- Partial failure: failed periods logged, other periods still analyzed

### `GET /interactions` — Query Interactions

```
GET /interactions?store_id=X[&session_start=Y]
Authorization: Bearer <token>
```

### `POST /search` — Semantic Search

```json
{
  "store_id": "store1",
  "query": "tall man in black jacket browsing sneakers",
  "top_k": 10
}
```

Returns matching interaction summaries with similarity scores via Vectorize.

### `POST /calibrate` — Trigger Calibration

```json
{
  "store_id": "store1",
  "date": "2026-03-05"
}
```

Finds the busiest session on that date, analyzes cross-camera transitions via Gemini, and updates camera spatial relationships. Idempotent per store+date.

### `GET /calibrations` — Calibration History

```
GET /calibrations?store_id=X
Authorization: Bearer <token>
```

### `GET /registry` — Camera Registry

```
GET /registry?store_id=X
Authorization: Bearer <token>
```

Current camera layout: grid positions, zones, adjacency.

### `GET /health` — Health Check

### `GET /dashboard` — Web Dashboard

Interactive UI for viewing interactions, calibrations, camera registry, and running semantic searches.

## Cron: Daily Calibration

Runs at **03:00 UTC** daily. For each store, calibrates yesterday's data (picks busiest session, runs Gemini analysis, auto-applies if confidence > 0.8).

## Cloudflare Bindings

| Binding          | Type        | Name                                  |
| ---------------- | ----------- | ------------------------------------- |
| `DB`             | D1 Database | `crow-core-interaction-service-db`    |
| `INGEST_FRAMES`  | R2 Bucket   | `crow-cctv-frames` (cross-service)    |
| `VECTORIZE`      | Vectorize   | `crow-interactions` (768-dim, cosine) |
| `AI`             | Workers AI  | Embedding model (bge-base-en-v1.5)    |
| `AUTH_TOKEN`     | Secret      | Bearer token                          |
| `GEMINI_API_KEY` | Secret      | Gemini API key                        |

## Install

```bash
bun install
```

## Local Development

```bash
# Start dev server
bun run dev   # wrangler dev --env local --port 8008
```

Create `.dev.vars` (gitignored):

```
AUTH_TOKEN=your-secret-token
GEMINI_API_KEY=your-gemini-key
```

## Database Migrations

```bash
wrangler d1 migrations apply crow-core-interaction-service-db --local
wrangler d1 migrations apply crow-core-interaction-service-db --remote
```

## Testing

```bash
bun test
```

56 tests covering analyzer, embeddings, calibrator, and all route handlers.

## D1 Schema

- `interactions` — session-level analysis documents (migration 0001)
- `time_period_analyses` — per-5-minute Gemini outputs (migration 0001)
- `camera_registry` — camera grid positions + adjacency (migration 0003)
- `calibrations` — daily calibration results + reasoning chain (migration 0003)

## Vectorize Index

```
Name:       crow-interactions
Dimensions: 768 (bge-base-en-v1.5)
Metric:     cosine
Metadata:   store_id, session_start, interaction_id
```

## License

MIT
