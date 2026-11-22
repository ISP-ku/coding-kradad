// The browser only ever talks to this Next.js site. Every backend route it
// needs is passed through to FastAPI here, so there is no CORS setup and the
// backend's session cookie is set on this site's own address. That is what
// lets one public address serve both apps in production (see DEPLOY.md).
// Server-side code calls API_BASE directly (lib/backend.ts).
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

const BACKEND_PATHS = [
  "/api/:path*",
  "/login/:provider",          // start Google sign-in
  "/callback/:provider",       // Google sends the user back here
  "/logout",
  "/password-login",           // the password sign-in form posts here
  "/local-test-login",         // development only; the backend refuses it in production
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // A self-contained server in .next/standalone, small enough for a 512 MB
  // container (see the Dockerfile). `npm run dev` works as before.
  output: "standalone",
  async rewrites() {
    return BACKEND_PATHS.map((path) => ({ source: path, destination: `${API_BASE}${path}` }));
  },
};

export default nextConfig;
