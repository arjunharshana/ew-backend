# EW Scheduler Backend

Node/Express (TypeScript) backend for the Smart Scan EW project (SIH26055), built against
**Rishant's real V4.0 Hybrid FastAPI service**.

## The one thing to understand about their API

Their service (`app/main.py`) holds **one global simulation** - one environment, one scheduler,
one clock. It is not a per-run REST resource. `POST /api/simulation/start` starts *the*
simulation; `GET /api/telemetry` returns *the current state of the one running simulation*.

This backend's job is to wrap that stateful control panel with a **session** abstraction so your
frontend gets "start a run, watch it, see its history" - even though their service itself has no
concept of parallel or historical runs. Sessions live only in this backend's SQLite DB.

**Implication:** only one session can be active at a time (enforced in `sessionManager.ts`), because
that mirrors their real constraint. If your team needs true concurrent demo runs, that requires
either multiple instances of their FastAPI service on different ports (each with its own
`ML_API_BASE_URL`), or them adding real per-run isolation - raise it with them if it matters for judging.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Runs against a **mock ML client** by default (`USE_MOCK_ML=true` in `.env`), so you can build the
whole backend without his server running. Set `ML_API_BASE_URL` to his actual server address
(laptop IP/domain, or wherever you end up hosting it) and `USE_MOCK_ML=false` to go live.

Run `npx tsx src/scripts/smokeTest.ts` for an end-to-end check (start session, step, check metrics,
complete) without needing the HTTP server running.

## Confirmed real API surface (`src/clients/mlApiClient.ts`)

Pulled directly from `app/api/routes.py` in his repo:

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | readiness check |
| GET | `/api/status` | current sim state/step/scenario/scheduler |
| GET | `/api/telemetry` | full telemetry payload (see below) - **this is the important one** |
| GET | `/api/waterfall?limit=100` | recent frequency-time trajectory |
| GET | `/api/scenarios` | catalog of loadable scenarios |
| GET | `/api/schedulers` | catalog of scheduler algorithms + their benchmark IR% |
| GET | `/api/benchmark` | static 5-way scheduler comparison + 8-scenario breakdown |
| GET | `/api/export` | mission summary report |
| POST | `/api/simulation/start` `{steps?}` | start/resume continuous execution |
| POST | `/api/simulation/pause` | pause |
| POST | `/api/simulation/step` `{steps?}` | synchronous discrete step(s), returns telemetry directly |
| POST | `/api/simulation/reset` `{seed?, scenario_name?, scheduler_name?}` | reset with new config |
| POST | `/api/simulation/speed` `{speed}` | `0.25x`..`5x`, `max` |
| WS | `/ws` or `/ws/telemetry` | pushes `{event_type: "TELEMETRY", payload: <telemetry>}` on every step |

### The telemetry payload already contains your PS's figures of merit

`telemetry.performance` gives you, computed on their side, already:
`interception_ratio_pct`, `detection_rate_pct` (this is Pd), `scan_efficiency_pct`,
`total_opportunities`, `intercepted_opportunities`, `total_detections`, `total_scans`.

Plus: `primary_prediction` (predicted next bin + confidence + Q-value ranking - useful for a
prediction-accuracy metric), `arbitration` (which sub-policy fired and why, human-readable),
`latency` (step latency vs. a 10ms real-time budget), and `neural_model` (checkpoint identity/hash,
frozen-inference confirmation).

**You generally do NOT need to recompute Pd/Pfa/interception-ratio yourself** - that work is done.
Your backend's value-add is: session/history management, persistence beyond their in-memory ring
buffers (150 waterfall entries, 25 timeline entries - gone on restart), and whatever aggregate/
comparison views your frontend wants across sessions (e.g., "compare this session's final IR% across
schedulers" - which their `/api/benchmark` already gives you a static version of, but a live
per-session version is new).

## What this backend adds on top

- **`src/services/sessionManager.ts`** — session lifecycle (start/pause/resume/complete), enforcing
  one active session, wrapping their reset+start calls.
- **`src/services/wsRelay.ts`** — connects to their single `/ws/telemetry` once, fans it out to
  however many frontend clients connect to *our* `/ws`, and persists a snapshot every 5th step.
- **`src/db/`** — SQLite: `sessions`, `telemetry_snapshots`, `session_metrics`. Durable history their
  service doesn't keep.
- **`src/controllers/catalogController.ts`** — thin passthroughs for their read-only reference data
  (`/api/scenarios`, `/api/schedulers`, `/api/benchmark`) so the frontend only ever talks to us.

## Our REST API (what your frontend calls)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | our health + whether their ML API is reachable |
| GET | `/api/scenarios` | proxied scenario catalog |
| GET | `/api/schedulers` | proxied scheduler catalog |
| GET | `/api/benchmark` | proxied static benchmark comparison |
| GET | `/api/telemetry` | proxied current telemetry (their global sim's live state) |
| GET | `/api/ml-status` | proxied `/api/status` |
| POST | `/sessions` | `{scenarioName, schedulerName, seed?}` → starts a session (resets + starts their sim) |
| GET | `/sessions` | list all sessions we've tracked |
| GET | `/sessions/:id` | session details |
| POST | `/sessions/:id/pause` | pause |
| POST | `/sessions/:id/resume` | resume |
| POST | `/sessions/:id/complete` | mark complete, pause upstream |
| POST | `/sessions/:id/step` | `{steps?}` — manual discrete step (needed in mock mode; optional when live WS is streaming) |
| GET | `/sessions/:id/metrics` | latest `performance` snapshot for this session |
| GET | `/sessions/:id/history` | `?limit=` full telemetry snapshot history for this session |
| WS | `/ws` | our relay stream: `{type: "telemetry"\|"session_started"\|..., sessionId, payload}` |

## Mock vs. real

`src/clients/mockMlApiClient.ts` mirrors the real telemetry shape exactly (same fields, fake values)
so your frontend and this backend can be fully built and demoed before/without his server running.
It's REST-only (no fake WebSocket), so in mock mode call `POST /sessions/:id/step` manually to
advance and record telemetry, rather than relying on the WS relay.

## Open items to confirm with the ML team

1. **Hosting** — once his laptop-hosted server needs to be reachable reliably (dev handoff, judging
   day), get a stable `ML_API_BASE_URL`. This backend only needs that one `.env` value changed.
2. **CORS** — his `app/main.py` currently allows `allow_origins=["*"]`, so no CORS issue calling
   from Node.
3. **Restart behavior** — if his service restarts, `state` resets to `IDLE` and all in-memory history
   is gone. Our `sessionManager` doesn't currently detect an upstream restart mid-session - worth
   adding a state reconciliation check if that becomes a real occurrence during dev.
4. **Concurrent sessions** — see note at the top. Only relevant if you want multiple simultaneous
   demo runs.

## Project structure

```
src/
  clients/          # mlApiClient (real), mockMlApiClient, provider switch
  config/           # env var loading
  controllers/       # sessionsController, catalogController, healthController
  db/                # SQLite: database.ts (schema), sessionRepository.ts
  middleware/         # error handling
  routes/             # sessionsRoutes, catalogRoutes, healthRoutes
  services/           # sessionManager (our session logic), wsRelay (WS fan-out)
  types/              # domain.ts - the CONFIRMED ML API contract
  scripts/            # smoke test
  app.ts / server.ts
```
