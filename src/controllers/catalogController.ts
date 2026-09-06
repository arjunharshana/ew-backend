import { NextFunction, Request, Response } from "express";
import { mlClient } from "../clients/mlClientProvider";

// Every handler here calls out to the ML API, which can fail (404, timeout,
// connection refused, etc). Express 4 does NOT automatically catch promise
// rejections thrown inside async route handlers - an uncaught rejection here
// becomes an unhandled rejection at the process level, which crashes the
// entire Node process by default. try/catch + next(err) routes the failure
// to errorHandler.ts instead, so one bad upstream call returns a clean 502
// to that one request instead of taking the whole server down.

export async function getScenarios(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await mlClient.getScenarios());
  } catch (err) {
    next(err);
  }
}

export async function getSchedulers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await mlClient.getSchedulers());
  } catch (err) {
    next(err);
  }
}

export async function getBenchmark(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await mlClient.getBenchmark());
  } catch (err) {
    next(err);
  }
}

export async function getCurrentTelemetry(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await mlClient.getTelemetry());
  } catch (err) {
    next(err);
  }
}

export async function getMlStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json(await mlClient.getStatus());
  } catch (err) {
    next(err);
  }
}