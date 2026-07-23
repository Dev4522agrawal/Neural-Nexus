#!/usr/bin/env bash
# Neural Nexus — put the brain to sleep. Usage: ./scripts/stop.sh
cd "$(dirname "$0")/.."

pkill -f "uvicorn app.main:app" 2>/dev/null && echo "backend stopped"
pkill -f "vite" 2>/dev/null && echo "frontend stopped"
docker compose stop && echo "databases stopped"
echo "🧠 asleep. memories safe."
