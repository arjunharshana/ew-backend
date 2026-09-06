/**
 * sessionManager.ts
 *
 * The ML API has ONE global simulation. This module is our layer on top
 * that gives the frontend a "start a run with this scenario/scheduler"
 * experience, records history so it survives their in-memory ring buffers,
 * and enforces only one active session at a time (matching their reality -
 * you cannot actually run two scenarios in parallel against their service).
 *
 * If your team later needs true concurrent runs, that requires either (a)
 * multiple instances of their service on different ports, each wrapped by
 * its own mlApiClient baseURL, or (b) them adding real per-run isolation
 * on their side. Flag this to them if concurrent demo runs matter for judging.
 */

import { v4 as uuidv4 } from "uuid";
import { mlClient } from "../clients/mlClientProvider";
import * as sessionRepo from "../db/sessionRepository";
import { Session } from "../types/domain";
import { broadcastToAll } from "./wsRelay";

const SNAPSHOT_INTERVAL_STEPS = 5; // persist every Nth step, not every single one

/** Starts a new session: resets their simulation to the requested scenario/scheduler, then starts it. */
export async function startSession(
  scenarioName: string,
  schedulerName: string,
  seed?: number
): Promise<Session> {
  const active = sessionRepo.getActiveSession();
  if (active) {
    throw new Error(
      `A session is already active (${active.sessionId}, status=${active.status}). ` +
        `Their service only supports one simulation at a time - pause or complete it first.`
    );
  }

  const sessionId = uuidv4();
  const resolvedSeed = seed ?? Math.floor(Math.random() * 1_000_000);

  await mlClient.resetSimulation({
    seed: resolvedSeed,
    scenario_name: scenarioName,
    scheduler_name: schedulerName,
  });

  sessionRepo.createSession(sessionId, scenarioName, schedulerName, resolvedSeed);
  sessionRepo.updateSessionStatus(sessionId, "running");

  await mlClient.startSimulation();

  const session = sessionRepo.getSession(sessionId)!;
  broadcastToAll({ type: "session_started", sessionId, payload: session });
  return session;
}

export async function pauseSession(sessionId: string): Promise<void> {
  assertSessionExists(sessionId);
  await mlClient.pauseSimulation();
  sessionRepo.updateSessionStatus(sessionId, "paused");
  broadcastToAll({ type: "session_paused", sessionId, payload: {} });
}

export async function resumeSession(sessionId: string): Promise<void> {
  assertSessionExists(sessionId);
  await mlClient.startSimulation();
  sessionRepo.updateSessionStatus(sessionId, "running");
  broadcastToAll({ type: "session_resumed", sessionId, payload: {} });
}

export async function completeSession(sessionId: string): Promise<void> {
  assertSessionExists(sessionId);
  await mlClient.pauseSimulation();
  sessionRepo.updateSessionStatus(sessionId, "completed");
  const finalMetrics = sessionRepo.getSessionMetrics(sessionId);
  broadcastToAll({ type: "session_completed", sessionId, payload: finalMetrics ?? {} });
}

/**
 * Records a telemetry snapshot for the given session, and persists metrics
 * on a throttled cadence. Call this from wherever telemetry arrives -
 * either the WS relay (real-time) or a polling loop (fallback).
 */
export function recordTelemetry(sessionId: string, telemetry: import("../types/domain").Telemetry): void {
  const step = telemetry.system_status.step;
  if (step % SNAPSHOT_INTERVAL_STEPS === 0) {
    sessionRepo.insertTelemetrySnapshot(sessionId, step, telemetry);
  }
  sessionRepo.upsertSessionMetrics(sessionId, telemetry.performance);
}

function assertSessionExists(sessionId: string): void {
  const session = sessionRepo.getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }
}
