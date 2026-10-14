// Forward /api/* from the browser to the FastAPI backend, so the browser only
// ever talks to this Next.js origin (no CORS setup, and the session cookie is
// passed along automatically).
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE}/api/:path*` }];
  },
};

export default nextConfig;
