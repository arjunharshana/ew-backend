import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { env } from "../config/env";

const dbDir = path.dirname(env.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(env.dbPath);
db.pragma("journal_mode = WAL");

export function initSchema(): void {
  db.exec(`
    -- A "session" is OUR abstraction: a period during which the frontend
    -- asked us to run/watch the ML team's single global simulation with a
    -- given scenario+scheduler+seed. Their service has no concept of this -
    -- we invented it so the frontend can have "runs" and history.
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      scenario_name TEXT NOT NULL,
      scheduler_name TEXT NOT NULL,
      seed INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    -- One row per telemetry snapshot we captured for a session, so history
    -- survives past their in-memory ring buffers (150 waterfall / 25 timeline
    -- entries) and past a restart of their service.
    CREATE TABLE IF NOT EXISTS telemetry_snapshots (
      session_id TEXT NOT NULL,
      step INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      telemetry_json TEXT NOT NULL,
      PRIMARY KEY (session_id, step),
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );

    -- Latest performance metrics per session, kept separately for fast
    -- reads (the frontend polls this far more often than full telemetry).
    CREATE TABLE IF NOT EXISTS session_metrics (
      session_id TEXT PRIMARY KEY,
      performance_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id)
    );
  `);
}
