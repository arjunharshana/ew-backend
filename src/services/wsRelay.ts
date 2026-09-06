/**
 * wsRelay.ts
 *
 * Their service exposes exactly one WebSocket stream (/ws/telemetry)
 * broadcasting the ONE global simulation's telemetry to whoever's
 * connected. We connect to it once, from the Node backend, and then
 * fan that single stream out to however many frontend clients are
 * connected to OUR WebSocket - so your frontend doesn't need to know
 * their service exists at all, and you can inject your own events
 * (session_started/paused/completed) into the same stream.
 */

import { WebSocket, WebSocketServer } from "ws";
import { Server } from "http";
import { mlClient } from "../clients/mlClientProvider";
import { MLWsEvent } from "../types/domain";
import * as sessionRepo from "../db/sessionRepository";
import { recordTelemetry } from "./sessionManager";
import { enrichTelemetry } from "./telemetryEnricher";

const frontendClients = new Set<WebSocket>();
let upstreamSocket: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

export function attachWsServer(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    frontendClients.add(ws);
    ws.on("close", () => frontendClients.delete(ws));
  });

  connectToUpstream();
}

function connectToUpstream(): void {
  // Skip connecting to a real socket when running against the mock client -
  // it has no actual WS server. The mock is REST-only; in mock mode,
  // record telemetry manually after stepSimulation() calls instead
  // (see routes/sessionsRoutes.ts step handler).
  if (mlClient.wsUrl.startsWith("ws://mock-ml-client-no-real-socket")) {
    // eslint-disable-next-line no-console
    console.warn("[wsRelay] Mock ML client active - skipping upstream WebSocket connection.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`[wsRelay] Connecting to upstream telemetry stream at ${mlClient.wsUrl}`);
  upstreamSocket = new WebSocket(mlClient.wsUrl);

  upstreamSocket.on("open", () => {
    // eslint-disable-next-line no-console
    console.log("[wsRelay] Connected to ML API telemetry stream.");
  });

  upstreamSocket.on("message", (data) => {
    try {
      const event: MLWsEvent = JSON.parse(data.toString());
      if (event.event_type === "TELEMETRY") {
        event.payload = enrichTelemetry(event.payload);
        const activeSession = sessionRepo.getActiveSession();
        if (activeSession) {
          recordTelemetry(activeSession.sessionId, event.payload);
        }
        broadcastToAll({
          type: "telemetry",
          sessionId: activeSession?.sessionId ?? null,
          payload: event.payload,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[wsRelay] Failed to parse upstream message:", err);
    }
  });

  upstreamSocket.on("close", () => {
    // eslint-disable-next-line no-console
    console.warn("[wsRelay] Upstream connection closed. Reconnecting in 3s...");
    scheduleReconnect();
  });

  upstreamSocket.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[wsRelay] Upstream connection error:", err.message);
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToUpstream();
  }, 3000);
}

export interface RelayEvent<T = unknown> {
  type: string;
  sessionId: string | null;
  payload: T;
}

export function broadcastToAll(event: RelayEvent): void {
  const message = JSON.stringify(event);
  for (const socket of frontendClients) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}
