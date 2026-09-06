/**
 * Exercises the real code path: sessionManager -> mlClient (mock) -> DB.
 * Run with: npx tsx src/scripts/smokeTest.ts
 */

import { initSchema } from "../db/database";
import * as sessionManager from "../services/sessionManager";
import * as sessionRepo from "../db/sessionRepository";
import { mlClient } from "../clients/mlClientProvider";

async function main() {
  initSchema();

  console.log("Starting session...");
  const session = await sessionManager.startSession("1_Seen_Structure", "hybrid_v4", 42);
  console.log("Session created:", session);

  console.log("\nStepping simulation 20 times (mock mode - manual step + record)...");
  for (let i = 0; i < 20; i++) {
    const telemetry = await mlClient.stepSimulation({ steps: 1 });
    sessionManager.recordTelemetry(session.sessionId, telemetry);
  }

  const metrics = sessionRepo.getSessionMetrics(session.sessionId);
  console.log("\nLatest performance metrics:", metrics);

  const history = sessionRepo.getTelemetryHistory(session.sessionId);
  console.log(`\nSnapshots recorded: ${history.length}`);
  console.log("First snapshot system_status:", history[0]?.system_status);
  console.log("Last snapshot system_status:", history[history.length - 1]?.system_status);

  console.log("\nCompleting session...");
  await sessionManager.completeSession(session.sessionId);
  const finalSession = sessionRepo.getSession(session.sessionId);
  console.log("Final session state:", finalSession);

  console.log("\nTrying to start a second session while one is active (should fail if not completed)...");
  try {
    await sessionManager.startSession("7_Random_Hopping", "hybrid_v4");
    console.log("Second session started (expected, since first was completed).");
  } catch (err) {
    console.log("Blocked as expected:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
