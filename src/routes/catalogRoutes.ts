import { Router } from "express";
import * as catalogController from "../controllers/catalogController";

export const catalogRouter = Router();

catalogRouter.get("/scenarios", catalogController.getScenarios);
catalogRouter.get("/schedulers", catalogController.getSchedulers);
catalogRouter.get("/benchmark", catalogController.getBenchmark);
catalogRouter.get("/telemetry", catalogController.getCurrentTelemetry);
catalogRouter.get("/ml-status", catalogController.getMlStatus);
