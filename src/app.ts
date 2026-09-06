import express, { Express } from "express";
import cors from "cors";
import { env } from "./config/env";
import { sessionsRouter } from "./routes/sessionsRoutes";
import { catalogRouter } from "./routes/catalogRoutes";
import { healthRouter } from "./routes/healthRoutes";
import { errorHandler } from "./middleware/errorHandler";

export function createApp(): Express {
  const app = express();

  app.use(cors({ origin: env.frontendOrigin }));
  app.use(express.json());

  app.use("/health", healthRouter);
  app.use("/api", catalogRouter);
  app.use("/sessions", sessionsRouter);

  app.use(errorHandler);

  return app;
}
