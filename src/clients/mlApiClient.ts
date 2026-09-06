/**
 * mlApiClient.ts
 *
 * Wraps the ML team's REAL, confirmed FastAPI service (app/main.py,
 * app/api/routes.py in Rishant's repo - SIH26055 V4.0 Hybrid production
 * build). Nothing else in this codebase should import axios or know
 * their route shapes directly - go through this module.
 *
 * KEY FACT ABOUT THEIR SERVICE: it is a single global simulation, not a
 * per-run resource. There's one `service` singleton on their side holding
 * one env/scheduler/clock. Calling start/pause/step/reset affects THE
 * simulation, not "a" simulation you created. If two people on your team
 * hit this API at once, they're driving the same simulation. Design your
 * own layer (orchestrator/session tracking) around that constraint -
 * see src/services/sessionManager.ts.
 *
 * Confirmed endpoints (from app/api/routes.py):
 *   GET  /health
 *   GET  /api/benchmark
 *   GET  /api/export
 *   GET  /api/status
 *   GET  /api/telemetry
 *   GET  /api/waterfall?limit=100
 *   GET  /api/scenarios
 *   GET  /api/schedulers
 *   POST /api/simulation/start   { steps?: number }
 *   POST /api/simulation/pause
 *   POST /api/simulation/step    { steps?: number }
 *   POST /api/simulation/reset   { seed?, scenario_name?, scheduler_name? }
 *   POST /api/simulation/speed   { speed: string }
 *   WS   /ws or /ws/telemetry    -> { event_type: "TELEMETRY", payload: Telemetry }
 */

import axios, { AxiosInstance } from "axios";
import { env } from "../config/env";
import {
  BenchmarkSummary,
  ScenarioItem,
  SchedulerItem,
  SimulationControlRequest,
  SimulationResetRequest,
  SimulationSpeedRequest,
  SimulationStatus,
  Telemetry,
  WaterfallEntry,
} from "../types/domain";
import { enrichTelemetry } from "../services/telemetryEnricher";

class MLApiClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: env.mlApiBaseUrl,
      timeout: env.mlApiTimeoutMs,
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.http.get("/health", { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }

  async getStatus(): Promise<SimulationStatus> {
    const { data } = await this.http.get<SimulationStatus>("/api/status");
    return data;
  }

  async getTelemetry(): Promise<Telemetry> {
    const { data } = await this.http.get<Telemetry>("/api/telemetry");
    return enrichTelemetry(data);
  }

  async getWaterfall(limit = 100): Promise<WaterfallEntry[]> {
    const { data } = await this.http.get<WaterfallEntry[]>("/api/waterfall", {
      params: { limit },
    });
    return data;
  }

  async getScenarios(): Promise<ScenarioItem[]> {
    const { data } = await this.http.get<ScenarioItem[]>("/api/scenarios");
    return data;
  }

  async getSchedulers(): Promise<SchedulerItem[]> {
    const { data } = await this.http.get<SchedulerItem[]>("/api/schedulers");
    return data;
  }

  async getBenchmark(): Promise<BenchmarkSummary> {
    const { data } = await this.http.get<BenchmarkSummary>("/api/benchmark");
    return data;
  }

  async getExport(): Promise<Record<string, unknown>> {
    const { data } = await this.http.get("/api/export");
    return data;
  }

  /** Starts or resumes continuous execution. `steps` limits how many steps to auto-run, omit for indefinite. */
  async startSimulation(request?: SimulationControlRequest): Promise<{ status: string; state: string }> {
    const { data } = await this.http.post("/api/simulation/start", request ?? {});
    return data;
  }

  async pauseSimulation(): Promise<{ status: string; state: string }> {
    const { data } = await this.http.post("/api/simulation/pause");
    return data;
  }

  /** Synchronous, discrete step(s) - returns the resulting telemetry directly. */
  async stepSimulation(request?: SimulationControlRequest): Promise<Telemetry> {
    const { data } = await this.http.post<Telemetry>("/api/simulation/step", request ?? {});
    return enrichTelemetry(data);
  }

  async resetSimulation(
    request?: SimulationResetRequest
  ): Promise<{ status: string; telemetry: Telemetry }> {
    const { data } = await this.http.post("/api/simulation/reset", request ?? {});
    data.telemetry = enrichTelemetry(data.telemetry);
    return data;
  }

  async setSpeed(request: SimulationSpeedRequest): Promise<{ status: string; speed: string }> {
    const { data } = await this.http.post("/api/simulation/speed", request);
    return data;
  }

  /** Their WebSocket base URL, for our WS relay to connect to. */
  get wsUrl(): string {
    const base = env.mlApiBaseUrl.replace(/^http/, "ws");
    return `${base}/ws/telemetry`;
  }
}

export const mlApiClient = new MLApiClient();
