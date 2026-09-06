/**
 * mockMlApiClient.ts
 *
 * Stand-in for mlApiClient with the SAME method signatures and SAME
 * response shapes as the real service (per Telemetry/SimulationStatus in
 * types/domain.ts). Lets you build/test your Node backend and frontend
 * when Rishant's laptop/server isn't reachable, without changing any
 * downstream code. Not a real simulator - just enough fake data to
 * exercise every field the real payload has.
 */

import {
  BenchmarkSummary,
  ScenarioItem,
  SchedulerItem,
  SimState,
  SimulationControlRequest,
  SimulationResetRequest,
  SimulationSpeedRequest,
  SimulationStatus,
  Telemetry,
  WaterfallEntry,
} from "../types/domain";

const NUM_BANDS = 30;
const BANDS_MHZ = Array.from({ length: NUM_BANDS }, (_, i) => 100 + i * 20);

class MockMLApiClient {
  private state: SimState = "IDLE";
  private step = 0;
  private scenarioName = "1_Seen_Structure";
  private schedulerName = "hybrid_v4";
  private seed = 42;
  private waterfallHistory: WaterfallEntry[] = [];

  async healthCheck(): Promise<boolean> {
    return true;
  }

  async getStatus(): Promise<SimulationStatus> {
    return {
      state: this.state,
      time_step: this.step,
      simulation_time_s: this.step * 0.1,
      scenario_name: this.scenarioName,
      scheduler_name: "V4.0 Hybrid (mock)",
      scheduler_type: this.schedulerName,
      speed: "1x",
      seed: this.seed,
      version: "4.0-mock",
    };
  }

  async getTelemetry(): Promise<Telemetry> {
    return this.buildTelemetry();
  }

  async getWaterfall(limit = 100): Promise<WaterfallEntry[]> {
    return this.waterfallHistory.slice(-limit);
  }

  async getScenarios(): Promise<ScenarioItem[]> {
    return [
      { id: "1_Seen_Structure", name: "1 Seen Structure", category: "Canonical Benchmark Suite", filename: "1_Seen_Structure.canonical" },
      { id: "7_Random_Hopping", name: "7 Random Hopping", category: "Canonical Benchmark Suite", filename: "7_Random_Hopping.canonical" },
      { id: "8_Periodic_Burst", name: "8 Periodic Burst", category: "Canonical Benchmark Suite", filename: "8_Periodic_Burst.canonical" },
    ];
  }

  async getSchedulers(): Promise<SchedulerItem[]> {
    return [
      {
        id: "hybrid_v4",
        name: "V4.0 Hybrid (mock)",
        category: "Proposed System",
        description: "Mock stand-in for the real scheduler.",
        benchmark_ir_pct: 35.19,
        overall_ir: "35.19%",
        rank: 1,
        is_production: true,
        is_proposed: true,
        badge: "MOCK",
      },
    ];
  }

  async getBenchmark(): Promise<BenchmarkSummary> {
    return { schedulers: [], scenario_breakdown: [] };
  }

  async getExport(): Promise<Record<string, unknown>> {
    return { mission_report: { title: "Mock export" } };
  }

  async startSimulation(_request?: SimulationControlRequest): Promise<{ status: string; state: string }> {
    this.state = "RUNNING";
    return { status: "started", state: this.state };
  }

  async pauseSimulation(): Promise<{ status: string; state: string }> {
    this.state = "PAUSED";
    return { status: "paused", state: this.state };
  }

  async stepSimulation(request?: SimulationControlRequest): Promise<Telemetry> {
    const count = request?.steps ?? 1;
    for (let i = 0; i < count; i++) {
      this.step += 1;
      const telem = this.buildTelemetry();
      this.waterfallHistory.push(telem.waterfall_events[telem.waterfall_events.length - 1]);
      if (this.waterfallHistory.length > 150) this.waterfallHistory.shift();
    }
    return this.buildTelemetry();
  }

  async resetSimulation(
    request?: SimulationResetRequest
  ): Promise<{ status: string; telemetry: Telemetry }> {
    this.step = 0;
    this.state = "IDLE";
    if (request?.seed !== undefined) this.seed = request.seed;
    if (request?.scenario_name) this.scenarioName = request.scenario_name;
    if (request?.scheduler_name) this.schedulerName = request.scheduler_name;
    this.waterfallHistory = [];
    return { status: "reset", telemetry: this.buildTelemetry() };
  }

  async setSpeed(_request: SimulationSpeedRequest): Promise<{ status: string; speed: string }> {
    return { status: "updated", speed: _request.speed };
  }

  get wsUrl(): string {
    return "ws://mock-ml-client-no-real-socket";
  }

  private buildTelemetry(): Telemetry {
    const currentBin = this.step % NUM_BANDS;
    const detected = pseudoRandom(this.step) > 0.7;

    return {
      system_status: {
        state: this.state,
        step: this.step,
        simulation_time_s: this.step * 0.1,
        scenario_name: this.scenarioName,
        scheduler_name: "V4.0 Hybrid (mock)",
        scheduler_type: this.schedulerName,
        version: "4.0-mock",
        seed: this.seed,
      },
      primary_prediction: {
        current_scan_bin: currentBin,
        current_scan_mhz: BANDS_MHZ[currentBin],
        predicted_next_bin: (currentBin + 1) % NUM_BANDS,
        predicted_next_mhz: BANDS_MHZ[(currentBin + 1) % NUM_BANDS],
        confidence_pct: 60,
        confidence_level: "MEDIUM",
        top_predictions: [],
        q_values: [],
      },
      detector: {
        detected,
        last_detection_bin: detected ? currentBin : null,
        last_detection_mhz: detected ? BANDS_MHZ[currentBin] : null,
        signal_power_dbm: detected ? -60 : null,
        status_label: detected ? "SIGNAL DETECTED" : "NO SIGNAL",
        receiver_bandwidth_mhz: 20,
        sensitivity_dbm: -90,
      },
      performance: {
        interception_ratio_pct: 25,
        detection_rate_pct: 30,
        scan_efficiency_pct: 28,
        total_opportunities: this.step,
        intercepted_opportunities: Math.floor(this.step * 0.25),
        total_detections: Math.floor(this.step * 0.3),
        total_scans: this.step,
      },
      arbitration: {
        mode: "MOCK_MODE",
        ddqn_weight_pct: 70,
        ca_weight_pct: 30,
        surprise: 0,
        consistency: 0.5,
        explanation: "Mock telemetry - not a real scheduler decision.",
      },
      latency: {
        step_latency_ms: 1.0,
        budget_ms: 10.0,
        status: "WITHIN BUDGET (< 10 ms)",
      },
      neural_model: {
        architecture: "Mock",
        status: "BASELINE_MODEL",
        mode: "ZERO_SHOT_POLICY",
        runtime_training: "N/A (Mock)",
        checkpoint_name: "N/A (Mock)",
        checkpoint_path: null,
        checkpoint_sha256: null,
        checkpoint_fingerprint: null,
        is_pretrained: false,
      },
      bands_mhz: BANDS_MHZ,
      recent_timeline: [],
      waterfall_events: [
        {
          step: this.step,
          scanned_mhz: BANDS_MHZ[currentBin],
          predicted_mhz: BANDS_MHZ[(currentBin + 1) % NUM_BANDS],
          detected,
          detected_mhz: detected ? BANDS_MHZ[currentBin] : null,
          ground_truth: detected ? [{ id: "mock_emitter", frequency_mhz: BANDS_MHZ[currentBin], power_dbm: -50 }] : [],
        },
      ],
    };
  }
}

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

export const mockMlApiClient = new MockMLApiClient();
