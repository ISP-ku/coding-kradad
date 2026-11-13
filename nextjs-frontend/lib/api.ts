import { PREVIEW } from "./preview";

// Base URL of the FastAPI backend (source/app.py). Set in .env.local.
export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export const loginUrl = (provider: "google" | "google-personal" = "google") =>
  PREVIEW ? `/preview-login?provider=${provider}` : `${API_BASE}/login/${provider}`;

export const logoutUrl = PREVIEW ? "/preview-logout" : `${API_BASE}/logout`;

export type AuthOptions = { local_test_login: boolean; email_code: boolean; personal_google: boolean };
const NO_OPTIONS: AuthOptions = { local_test_login: false, email_code: false, personal_google: false };

/** Which sign-in options the backend offers. Only the backend decides. */
export async function authOptions(): Promise<AuthOptions> {
  if (PREVIEW) return NO_OPTIONS;
  try {
    const response = await fetch(`${API_BASE}/api/auth-options`, { cache: "no-store" });
    if (!response.ok) return NO_OPTIONS;
    const body = await response.json();
    return {
      local_test_login: process.env.NODE_ENV !== "production" && body.local_test_login === true,
      email_code: body.email_code === true,
      personal_google: body.personal_google === true,
    };
  } catch { return NO_OPTIONS; }
}

// Only the backend decides whether local test login is available.
export async function localTestLoginAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || PREVIEW) return false;
  return (await authOptions()).local_test_login;
}
