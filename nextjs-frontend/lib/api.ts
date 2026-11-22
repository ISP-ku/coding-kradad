import { PREVIEW } from "./preview";

// Where this server reaches the FastAPI backend (source/app.py). Set in
// .env.local. Server-side only: the browser always uses this site's own
// address, and next.config.mjs passes those routes on to the backend.
export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export const loginUrl = (provider: "google" | "google-personal" = "google") =>
  PREVIEW ? `/preview-login?provider=${provider}` : `/login/${provider}`;

export const logoutUrl = PREVIEW ? "/preview-logout" : "/logout";

export type AuthOptions = { local_test_login: boolean; password: boolean; personal_google: boolean };
const NO_OPTIONS: AuthOptions = { local_test_login: false, password: false, personal_google: false };

/** Which sign-in options the backend offers. Only the backend decides. */
export async function authOptions(): Promise<AuthOptions> {
  if (PREVIEW) return NO_OPTIONS;
  try {
    const response = await fetch(`${API_BASE}/api/auth-options`, { cache: "no-store" });
    if (!response.ok) return NO_OPTIONS;
    const body = await response.json();
    return {
      local_test_login: process.env.NODE_ENV !== "production" && body.local_test_login === true,
      password: body.password === true,
      personal_google: body.personal_google === true,
    };
  } catch { return NO_OPTIONS; }
}

// Only the backend decides whether local test login is available.
export async function localTestLoginAvailable(): Promise<boolean> {
  if (process.env.NODE_ENV === "production" || PREVIEW) return false;
  return (await authOptions()).local_test_login;
}
