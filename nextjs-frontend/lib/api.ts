import { PREVIEW } from "./preview";

// Base URL of the FastAPI backend (source/app.py). Set in .env.local.
export const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

export const loginUrl = (provider: string) =>
  PREVIEW ? `/preview-login?provider=${provider}` : `${API_BASE}/login/${provider}`;

export const logoutUrl = PREVIEW ? "/preview-logout" : `${API_BASE}/logout`;
