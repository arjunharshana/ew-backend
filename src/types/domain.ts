/**
 * Domain types matching the ML team's ACTUAL, confirmed FastAPI service
 * (app/api/routes.py, app/api/schemas.py, app/services/simulation_service.py
 * in Rishant's repo, V4.0 Hybrid production build).
 *
 * IMPORTANT ARCHITECTURAL NOTE: their service holds ONE global simulation
 * at a time (single `service` singleton, single env/scheduler/state) - it
 * is NOT a per-run REST resource like `POST /runs` creating independent
 * run N. There's one simulation clock; you start/pause/step/reset it, and
 * `latest_telemetry` always reflects "the current state of the one running
 * simulation." Your Node backend's job is to:
 *   1. Wrap this stateful control-panel API behind whatever multi-run /
 *      history / persistence semantics your frontend actually wants.
 *   2. Fan out their single WebSocket stream to your own connected clients.
 *   3. Persist telemetry snapshots over time into your own DB, since their
 *      service only keeps short ring buffers in memory (150 waterfall
 *      entries, 25 timeline entries) and nothing survives a restart.
 */

// ---- Simulation lifecycle (their state machine) ----

export type SimState = "IDLE" | "RUNNING" | "PAUSED";

export type SpeedMultiplier = "0.25x" | "0.5x" | "1x" | "2x" | "5x" | "max";

export interface SimulationStatus {
  state: SimState;
  time_step: number;
  simulation_time_s: number;
  scenario_name: string;
  scheduler_name: string;
  scheduler_type: string;
  speed: string;
  seed: number;
  version: string;
}

export interface ScenarioItem {
  id: string;
  name: string;
  category?: string;
  filename: string;
  description?: string;
  path?: string;
  total_steps?: number | null;
}

export interface SchedulerItem {
  id: string;
  name: string;
  category: string;
  description: string;
  benchmark_ir_pct: number;
  overall_ir: string;
  rank: number;
  is_production: boolean;
  is_proposed: boolean;
  badge: string;
}

// ---- Telemetry payload (the actual shape of GET /api/telemetry and the WS "TELEMETRY" event) ----

export interface TelemetrySystemStatus {
  state: SimState;
  step: number;
  simulation_time_s: number;
  scenario_name: string;
  scheduler_name: string;
  scheduler_type: string;
  version: string;
  seed: number;
}

export interface QRankingEntry {
  rank: number;
  bin: number;
  frequency_mhz: number;
  q_value: number;
  share_pct: number;
}

export interface PrimaryPrediction {
  current_scan_bin: number;
  current_scan_mhz: number;
  predicted_next_bin: number;
  predicted_next_mhz: number;
  confidence_pct: number;
  confidence_level: "HIGH" | "MEDIUM" | "LOW";
  top_predictions: QRankingEntry[];
  q_values: number[];
}

export interface DetectorStatus {
  detected: boolean;
  last_detection_bin: number | null;
  last_detection_mhz: number | null;
  signal_power_dbm: number | null;
  status_label: "SIGNAL DETECTED" | "NO SIGNAL";
  receiver_bandwidth_mhz: number;
  sensitivity_dbm: number;
}

/** These ARE the problem statement's figures of merit, computed by them, not you. */
export interface PerformanceMetrics {
  interception_ratio_pct: number;
  detection_rate_pct: number; // this is Pd expressed as %
  scan_efficiency_pct: number;
  total_opportunities: number;
  intercepted_opportunities: number;
  total_detections: number;
  total_scans: number;
}

export interface ArbitrationInfo {
  mode: string; // e.g. "DDQN_EXPLOIT", "WHITTLE_INDEX", "EMPIRICAL_MARKOV"
  ddqn_weight_pct: number;
  ca_weight_pct: number;
  surprise: number;
  consistency: number;
  explanation: string; // human-readable "why this scan" rationale
}

export interface LatencyInfo {
  step_latency_ms: number;
  budget_ms: number;
  status: "WITHIN BUDGET (< 10 ms)" | "EXCEEDS BUDGET";
}

export interface NeuralModelInfo {
  architecture: string;
  status: "PRETRAINED" | "LOADED" | "BASELINE_MODEL";
  mode: "FROZEN_INFERENCE" | "ZERO_SHOT_POLICY";
  runtime_training: string;
  checkpoint_name: string;
  checkpoint_path: string | null;
  checkpoint_sha256: string | null;
  checkpoint_fingerprint: string | null;
  is_pretrained: boolean;
}

export interface TimelineEntry {
  step: number;
  simulation_time_s: number;
  scanned_bin: number;
  scanned_mhz: number;
  predicted_bin: number;
  predicted_mhz: number;
  detected: boolean;
  detected_mhz: number | null;
  signal_power_dbm: number | null;
  confidence_pct: number;
  arbitration_mode: string;
}

export interface GroundTruthEmitterSnapshot {
  id: string;
  frequency_mhz: number;
  power_dbm: number;
}

/** Ground truth is present here ONLY for visualization/eval - never fed back as scheduler input. */
export interface WaterfallEntry {
  step: number;
  scanned_mhz: number;
  predicted_mhz: number;
  detected: boolean;
  detected_mhz: number | null;
  ground_truth: GroundTruthEmitterSnapshot[];
}

/** The full, real telemetry payload - GET /api/telemetry response and WS "TELEMETRY" event payload. */
export interface Telemetry {
  system_status: TelemetrySystemStatus;
  primary_prediction: PrimaryPrediction;
  detector: DetectorStatus;
  performance: PerformanceMetrics;
  arbitration: ArbitrationInfo;
  latency: LatencyInfo;
  neural_model: NeuralModelInfo;
  bands_mhz: number[];
  recent_timeline: TimelineEntry[]; // most recent first, up to 25
  waterfall_events: WaterfallEntry[]; // up to 150
}

// ---- WebSocket envelope (their actual event shape) ----

export interface MLWsEvent {
  event_type: "TELEMETRY";
  payload: Telemetry;
}

// ---- Control request bodies (what we send TO their API) ----

export interface SimulationControlRequest {
  steps?: number;
}

export interface SimulationResetRequest {
  seed?: number;
  scenario_name?: string;
  scheduler_name?: string;
}

export interface SimulationSpeedRequest {
  speed: SpeedMultiplier;
}

// ---- Benchmark data (GET /api/benchmark - static comparison table) ----

export interface BenchmarkSchedulerEntry {
  id: string;
  name: string;
  role: string;
  architecture: string;
  overall_ir_pct: number;
  rank: number;
  badge: string;
  offline_trained: boolean;
  runtime_training: boolean;
}

export interface BenchmarkSummary {
  schedulers: BenchmarkSchedulerEntry[];
  scenario_breakdown: Array<Record<string, string | number>>;
}

// ---- Our own layer's types (what OUR backend adds on top) ----

/**
 * A "watched session" our backend tracks - a period during which we were
 * capturing their global simulation's telemetry, e.g. for a specific
 * scenario/scheduler run the frontend user initiated. This is OUR
 * abstraction, not theirs - it's how we give the frontend "runs" and
 * history even though their service itself has no concept of parallel runs.
 */
export type SessionStatus = "idle" | "running" | "paused" | "completed";

export interface Session {
  sessionId: string;
  scenarioName: string;
  schedulerName: string;
  seed: number;
  status: SessionStatus;
  createdAt: string;
  completedAt?: string;
}
