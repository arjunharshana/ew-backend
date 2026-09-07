import { Router } from "express";
import * as sessionsController from "../controllers/sessionsController";

export const sessionsRouter = Router();

sessionsRouter.post("/", sessionsController.startSession);
sessionsRouter.get("/", sessionsController.listSessions);
sessionsRouter.get("/:sessionId", sessionsController.getSession);
sessionsRouter.post("/:sessionId/pause", sessionsController.pauseSession);
sessionsRouter.post("/:sessionId/resume", sessionsController.resumeSession);
sessionsRouter.post("/:sessionId/complete", sessionsController.completeSession);
sessionsRouter.post("/:sessionId/step", sessionsController.stepSession);
sessionsRouter.get("/:sessionId/metrics", sessionsController.getSessionMetrics);
sessionsRouter.get("/:sessionId/history", sessionsController.getSessionHistory);
sessionsRouter.post("/:sessionId/speed", sessionsController.setSpeed);
