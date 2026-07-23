#!/usr/bin/env bash
# Neural Nexus — one-command start. Usage: ./scripts/start.sh
set -e
cd "$(dirname "$0")/.."

echo "🧠 Neural Nexus — starting…"

# 1. Docker must be running
if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker isn't running. Open Docker Desktop, wait for the whale, then re-run."
  open -a Docker 2>/dev/null || true
  exit 1
fi

# 2. Databases
docker compose up -d
echo "⏳ waiting for databases…"
until docker exec nexus-postgres pg_isready -U nexus -d nexus >/dev/null 2>&1; do sleep 1; done
until curl -sf http://localhost:7474 >/dev/null 2>&1; do sleep 1; done
echo "✅ databases up"

# 3. Ollama (local brain) — start if installed but not running
if command -v ollama >/dev/null 2>&1; then
  if ! curl -sf http://localhost:11434/api/tags >/dev/null 2>&1; then
    echo "⏳ starting ollama…"
    nohup ollama serve >/tmp/nexus-ollama.log 2>&1 &
    sleep 2
  fi
  echo "✅ ollama up"
fi

# 4. Backend
if ! curl -sf http://localhost:8000/api/health >/dev/null 2>&1; then
  echo "⏳ starting backend…"
  (cd backend && source .venv/bin/activate && nohup uvicorn app.main:app --port 8000 >/tmp/nexus-backend.log 2>&1 &)
  until curl -sf http://localhost:8000/api/health >/dev/null 2>&1; do sleep 1; done
fi
echo "✅ backend up"

# 5. Frontend — build once so the backend can serve it at :8000 (single address).
#    Rebuilds only when source is newer than the last build.
NEED_BUILD=0
if [ ! -f frontend/dist/index.html ]; then
  NEED_BUILD=1
elif [ -n "$(find frontend/src frontend/index.html frontend/package.json -newer frontend/dist/index.html 2>/dev/null)" ]; then
  NEED_BUILD=1
fi
if [ "$NEED_BUILD" = "1" ]; then
  echo "⏳ building UI…"
  (cd frontend && npm run build >/tmp/nexus-frontend-build.log 2>&1) \
    || { echo "❌ UI build failed — see /tmp/nexus-frontend-build.log"; exit 1; }
fi
echo "✅ UI built (served by backend at :8000)"

open http://localhost:8000 2>/dev/null || true
echo "🧠 Neural Nexus is awake → http://localhost:8000"
echo "   logs: /tmp/nexus-backend.log"
echo "   stop: ./scripts/stop.sh"
