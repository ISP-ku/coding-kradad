#!/usr/bin/env bash
# Start FastAPI (private) and Next.js (public), and stop the container if
# either one exits, so Render restarts it instead of serving half an app.
set -u

# One worker: 512 MB on Render's free plan, and roster seeding runs at import.
python -m uvicorn app:app --app-dir /app/source --host 127.0.0.1 --port 8000 --workers 1 &
backend=$!

# Open the public port only once the backend answers. Render sends the first
# request as soon as the port is open (e.g. when a sleeping free service
# wakes), and it would fail if FastAPI were still starting.
for _ in $(seq 1 240); do
  (exec 3<>/dev/tcp/127.0.0.1/8000) 2>/dev/null && break
  kill -0 "$backend" 2>/dev/null || { echo "The backend failed to start." >&2; exit 1; }
  sleep 0.5
done

# Docker sets HOSTNAME to the container id; the Next.js server listens on it.
HOSTNAME=0.0.0.0 PORT="${PORT:-10000}" node /app/web/server.js &

wait -n
echo "A server stopped; exiting so the platform restarts the container." >&2
exit 1
