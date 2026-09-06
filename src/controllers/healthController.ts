import { Request, Response } from "express";
import { mlClient } from "../clients/mlClientProvider";

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const mlApiReachable = await mlClient.healthCheck();
  res.json({
    status: "ok",
    mlApiReachable,
    timestamp: new Date().toISOString(),
  });
}
