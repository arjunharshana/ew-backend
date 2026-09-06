import { Telemetry } from "../types/domain";

const confidenceCache = new Map<number, number>();

export function enrichTelemetry(telemetry: Telemetry): Telemetry {
  const { primary_prediction, system_status, recent_timeline } = telemetry;
  
  if (primary_prediction && primary_prediction.q_values && primary_prediction.q_values.length > 0) {
    const qVals = primary_prediction.q_values;
    const n = qVals.length;
    const mean = qVals.reduce((a, b) => a + b, 0) / n;
    const variance = qVals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    const maxQ = Math.max(...qVals);
    
    // Only calculate if qVals have variance, else it's likely a baseline
    if (std > 0 || maxQ > 0) {
        const z = (maxQ - mean) / (2.0 * Math.max(std, 1e-4));
        let confidence = z;
        if (confidence < 0.15) confidence = 0.15;
        if (confidence > 0.98) confidence = 0.98;
        
        const confidencePct = Math.round(confidence * 1000) / 10;
        
        // Cache the calculated confidence for this step
        confidenceCache.set(system_status.step, confidencePct);
        
        // Override primary prediction
        primary_prediction.confidence_pct = confidencePct;
        if (confidencePct >= 75) {
          primary_prediction.confidence_level = "HIGH";
        } else if (confidencePct >= 45) {
          primary_prediction.confidence_level = "MEDIUM";
        } else {
          primary_prediction.confidence_level = "LOW";
        }
    }
  }

  // Backfill timeline entries with cached confidences
  if (recent_timeline && Array.isArray(recent_timeline)) {
    recent_timeline.forEach(entry => {
      if (confidenceCache.has(entry.step)) {
        entry.confidence_pct = confidenceCache.get(entry.step)!;
      }
    });
  }

  // Clean up cache to prevent memory leak
  if (confidenceCache.size > 200) {
    const minStep = Math.max(...Array.from(confidenceCache.keys())) - 100;
    for (const key of confidenceCache.keys()) {
      if (key < minStep) {
        confidenceCache.delete(key);
      }
    }
  }

  return telemetry;
}
