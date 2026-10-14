import { PREVIEW } from "./preview";

// Base URL of the FastAPI backend (source/app.py). Set in .env.local.
export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export const loginUrl = (provider: "google" = "google") =>
  PREVIEW ? `/preview-login?provider=${provider}` : `${API_BASE}/login/${provider}`;

export const logoutUrl = PREVIEW ? "/preview-logout" : `${API_BASE}/logout`;

// Only the backend decides whether local test login is available.
export async function localTestLoginAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || PREVIEW) return false;
  try {
    const response = await fetch(`${API_BASE}/api/auth-options`, { cache: "no-store" });
    return response.ok && (await response.json()).local_test_login === true;
  } catch { return false; }
}
