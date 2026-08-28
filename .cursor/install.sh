#!/usr/bin/env bash
# Idempotent repository bootstrap for the portfolio tracker + paper day-trading system.
# - Installs PostgreSQL (system dependency) if missing.
# - Installs backend and frontend Node dependencies.
# - Creates backend/.env from the template if absent.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[install] Ensuring PostgreSQL is installed..."
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    postgresql postgresql-contrib
fi

echo "[install] Installing backend dependencies..."
( cd backend && if [ -f package-lock.json ]; then npm ci; else npm install; fi )

echo "[install] Installing frontend dependencies..."
( cd frontend && if [ -f package-lock.json ]; then npm ci; else npm install; fi )

echo "[install] Ensuring backend/.env exists..."
if [ ! -f backend/.env ]; then
  cp backend/.env_template backend/.env
  echo "[install] Created backend/.env from template (fill in real API keys as needed)."
fi

echo "[install] Done."
