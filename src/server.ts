import http from "http";
import { createApp } from "./app";
import { env } from "./config/env";
import { initSchema } from "./db/database";
import { attachWsServer } from "./services/wsRelay";

// Safety net: an unhandled promise rejection anywhere (a missed try/catch
// around an mlClient call, for example) crashes the whole Node process by
// default. Log it instead of dying - a single bad upstream call should
// degrade one request, not take down every session/connection.
process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[unhandledRejection]", reason);
});

initSchema();

const app = createApp();
const server = http.createServer(app);

attachWsServer(server);

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] EW Scheduler backend listening on port ${env.port}`);
  // eslint-disable-next-line no-console
  console.log(`[server] Frontend WebSocket available at ws://localhost:${env.port}/ws`);
  // eslint-disable-next-line no-console
  console.log(`[server] Relaying upstream telemetry from ${env.mlApiBaseUrl}`);
});