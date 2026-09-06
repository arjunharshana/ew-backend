import { NextFunction, Request, Response } from "express";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // eslint-disable-next-line no-console
  console.error("[errorHandler]", err);

  if (axiosLikeError(err)) {
    res.status(502).json({
      error: "Upstream ML API error",
      detail: err.message,
    });
    return;
  }

  res.status(500).json({ error: "Internal server error" });
}

function axiosLikeError(err: unknown): err is { message: string; isAxiosError: true } {
  return typeof err === "object" && err !== null && "isAxiosError" in err;
}
