#!/usr/bin/env bash
# Per-boot runtime initialization: start PostgreSQL and ensure the app role/db exist.
# Safe to run repeatedly.
set -euo pipefail

echo "[start] Starting PostgreSQL..."
PG_VER="$(ls /etc/postgresql 2>/dev/null | sort -n | tail -n1 || true)"
if [ -z "${PG_VER:-}" ]; then
  echo "[start] PostgreSQL is not installed; run the install step first." >&2
  exit 1
fi

# Start the cluster if it is not already accepting connections (idempotent).
if ! pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  sudo pg_ctlcluster "$PG_VER" main start || true
fi

# Wait for readiness over the TCP socket the app uses.
for _ in $(seq 1 30); do
  if pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then break; fi
  sleep 1
done
if ! pg_isready -q -h 127.0.0.1 -p 5432 2>/dev/null; then
  echo "[start] PostgreSQL did not become ready on 127.0.0.1:5432." >&2
  exit 1
fi

# Ensure the application role and database exist (idempotent).
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='user'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE \"user\" LOGIN PASSWORD 'password';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='portfolio_db'" | grep -q 1; then
  sudo -u postgres createdb -O "user" portfolio_db
fi

echo "[start] PostgreSQL ready; role 'user' and database 'portfolio_db' ensured."
