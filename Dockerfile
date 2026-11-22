# One container for Render: Next.js is the only public port and passes the
# backend routes (next.config.mjs) to FastAPI on 127.0.0.1:8000 inside it.
# See DEPLOY.md.

# ---- 1. Build the Next.js frontend ------------------------------------------
FROM node:24-bookworm-slim AS web
WORKDIR /build
COPY nextjs-frontend/package.json nextjs-frontend/package-lock.json ./
RUN npm ci
COPY nextjs-frontend/ ./
# Rewrite destinations are fixed at build time, so point them at the backend
# inside this container. UI preview is always off in a production build.
ENV API_BASE_URL=http://127.0.0.1:8000 \
    UI_PREVIEW=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 2. Runtime: Python 3.11 (Debian bookworm) + Node 24 ---------------------
FROM node:24-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY source/requirements.txt source/requirements.txt
RUN python3 -m venv /opt/venv \
 && /opt/venv/bin/pip install --no-cache-dir -r source/requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

COPY source/ source/
COPY templates/ templates/
COPY data/ data/
# Next.js standalone server: only the files it needs, small enough for 512 MB.
COPY --from=web /build/.next/standalone/ web/
COPY --from=web /build/.next/static/ web/.next/static/
COPY deploy/start.sh start.sh

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_BASE_URL=http://127.0.0.1:8000 \
    PYTHONUNBUFFERED=1
# Render sets PORT; 10000 is its default.
EXPOSE 10000
CMD ["bash", "start.sh"]
