import { db } from "./database";
import { PerformanceMetrics, Session, SessionStatus, Telemetry } from "../types/domain";

export function createSession(
  sessionId: string,
  scenarioName: string,
  schedulerName: string,
  seed: number
): void {
  db.prepare(
    `INSERT INTO sessions (session_id, scenario_name, scheduler_name, seed, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, scenarioName, schedulerName, seed, "idle", new Date().toISOString());
}

export function updateSessionStatus(sessionId: string, status: SessionStatus): void {
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  db.prepare(
    `UPDATE sessions SET status = ?, completed_at = COALESCE(?, completed_at) WHERE session_id = ?`
  ).run(status, completedAt, sessionId);
}

export function getSession(sessionId: string): Session | undefined {
  const row = db.prepare(`SELECT * FROM sessions WHERE session_id = ?`).get(sessionId) as
    | {
        session_id: string;
        scenario_name: string;
        scheduler_name: string;
        seed: number;
        status: SessionStatus;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    sessionId: row.session_id,
    scenarioName: row.scenario_name,
    schedulerName: row.scheduler_name,
    seed: row.seed,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function listSessions(): Session[] {
  const rows = db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all() as Array<{
    session_id: string;
    scenario_name: string;
    scheduler_name: string;
    seed: number;
    status: SessionStatus;
    created_at: string;
    completed_at: string | null;
  }>;
  return rows.map((row) => ({
    sessionId: row.session_id,
    scenarioName: row.scenario_name,
    schedulerName: row.scheduler_name,
    seed: row.seed,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  }));
}

/** Get the currently "active" session, if any - the one we're actively driving/watching. */
export function getActiveSession(): Session | undefined {
  const row = db
    .prepare(`SELECT * FROM sessions WHERE status IN ('running', 'paused') ORDER BY created_at DESC LIMIT 1`)
    .get() as
    | {
        session_id: string;
        scenario_name: string;
        scheduler_name: string;
        seed: number;
        status: SessionStatus;
        created_at: string;
        completed_at: string | null;
      }
    | undefined;
  if (!row) return undefined;
  return {
    sessionId: row.session_id,
    scenarioName: row.scenario_name,
    schedulerName: row.scheduler_name,
    seed: row.seed,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at ?? undefined,
  };
}

export function insertTelemetrySnapshot(sessionId: string, step: number, telemetry: Telemetry): void {
  db.prepare(
    `INSERT OR REPLACE INTO telemetry_snapshots (session_id, step, captured_at, telemetry_json)
     VALUES (?, ?, ?, ?)`
  ).run(sessionId, step, new Date().toISOString(), JSON.stringify(telemetry));
}

export function getTelemetryHistory(sessionId: string, limit = 500): Telemetry[] {
  const rows = db
    .prepare(
      `SELECT telemetry_json FROM telemetry_snapshots WHERE session_id = ? ORDER BY step DESC LIMIT ?`
    )
    .all(sessionId, limit) as Array<{ telemetry_json: string }>;
  return rows.map((r) => JSON.parse(r.telemetry_json)).reverse();
}

export function upsertSessionMetrics(sessionId: string, performance: PerformanceMetrics): void {
  db.prepare(
    `INSERT INTO session_metrics (session_id, performance_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET performance_json = excluded.performance_json, updated_at = excluded.updated_at`
  ).run(sessionId, JSON.stringify(performance), new Date().toISOString());
}

export function getSessionMetrics(sessionId: string): PerformanceMetrics | undefined {
  const row = db.prepare(`SELECT performance_json FROM session_metrics WHERE session_id = ?`).get(
    sessionId
  ) as { performance_json: string } | undefined;
  return row ? JSON.parse(row.performance_json) : undefined;
}
