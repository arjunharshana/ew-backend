import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(required("PORT", "4000"), 10),
  nodeEnv: required("NODE_ENV", "development"),
  mlApiBaseUrl: required("ML_API_BASE_URL", "http://localhost:8000"),
  mlApiTimeoutMs: parseInt(required("ML_API_TIMEOUT_MS", "5000"), 10),
  dbPath: required("DB_PATH", "./data/ew_scheduler.db"),
  frontendOrigin: required("FRONTEND_ORIGIN", "http://localhost:5173"),
};
