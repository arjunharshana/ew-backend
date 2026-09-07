import { Request, Response } from "express";
import { z } from "zod";
import * as sessionManager from "../services/sessionManager";
import * as sessionRepo from "../db/sessionRepository";
import { mlClient } from "../clients/mlClientProvider";

const startSessionSchema = z.object({
  scenarioName: z.string().min(1),
  schedulerName: z.string().min(1),
  seed: z.number().int().optional(),
});

export async function startSession(req: Request, res: Response): Promise<void> {
  const parsed = startSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }

  try {
    const session = await sessionManager.startSession(
      parsed.data.scenarioName,
      parsed.data.schedulerName,
      parsed.data.seed
    );
    res.status(202).json(session);
  } catch (err) {
    res.status(409).json({ error: err instanceof Error ? err.message : "Failed to start session" });
  }
}

export async function pauseSession(req: Request, res: Response): Promise<void> {
  try {
    await sessionManager.pauseSession(req.params.sessionId);
    res.json({ status: "paused" });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Failed to pause session" });
  }
}

export async function resumeSession(req: Request, res: Response): Promise<void> {
  try {
    await sessionManager.resumeSession(req.params.sessionId);
    res.json({ status: "resumed" });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Failed to resume session" });
  }
}

export async function completeSession(req: Request, res: Response): Promise<void> {
  try {
    await sessionManager.completeSession(req.params.sessionId);
    res.json({ status: "completed" });
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : "Failed to complete session" });
  }
}

/**
 * Manual step endpoint - mainly useful in mock mode (no real WS stream to
 * record from automatically) or for a frontend "step" button in non-realtime
 * demo mode. Steps their simulation directly and records the result.
 */
export async function stepSession(req: Request, res: Response): Promise<void> {
  const session = sessionRepo.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const steps = typeof req.body?.steps === "number" ? req.body.steps : 1;
  try {
    const telemetry = await mlClient.stepSimulation({ steps });
    sessionManager.recordTelemetry(session.sessionId, telemetry);
    res.json(telemetry);
  } catch (err) {
    res.status(502).json({ error: "Upstream ML API error", detail: err instanceof Error ? err.message : String(err) });
  }
}

export async function setSpeed(req: Request, res: Response): Promise<void> {
  const session = sessionRepo.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const speed = req.body?.speed;
  if (!speed) {
    res.status(400).json({ error: "Missing speed parameter" });
    return;
  }
  try {
    const result = await mlClient.setSpeed({ speed: speed as any });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: "Upstream ML API error", detail: err instanceof Error ? err.message : String(err) });
  }
}

export function getSession(req: Request, res: Response): void {
  const session = sessionRepo.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json(session);
}

export function listSessions(_req: Request, res: Response): void {
  res.json(sessionRepo.listSessions());
}

export function getSessionMetrics(req: Request, res: Response): void {
  const metrics = sessionRepo.getSessionMetrics(req.params.sessionId);
  if (!metrics) {
    res.status(404).json({ error: "No metrics recorded yet for this session" });
    return;
  }
  res.json(metrics);
}

export function getSessionHistory(req: Request, res: Response): void {
  const session = sessionRepo.getSession(req.params.sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
  res.json(sessionRepo.getTelemetryHistory(req.params.sessionId, limit));
}