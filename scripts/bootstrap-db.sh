#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env ]]; then
  OVERRIDE_POSTGRES_USER="${POSTGRES_USER:-}"
  OVERRIDE_POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
  OVERRIDE_POSTGRES_DB="${POSTGRES_DB:-}"
  OVERRIDE_POSTGRES_HOST="${POSTGRES_HOST:-}"
  OVERRIDE_POSTGRES_PORT="${POSTGRES_PORT:-}"

  # shellcheck disable=SC1091
  source .env

  POSTGRES_USER="${OVERRIDE_POSTGRES_USER:-${POSTGRES_USER:-plansocial}}"
  POSTGRES_PASSWORD="${OVERRIDE_POSTGRES_PASSWORD:-${POSTGRES_PASSWORD:-plansocial}}"
  POSTGRES_DB="${OVERRIDE_POSTGRES_DB:-${POSTGRES_DB:-plansocial}}"
  POSTGRES_HOST="${OVERRIDE_POSTGRES_HOST:-${POSTGRES_HOST:-localhost}}"
  POSTGRES_PORT="${OVERRIDE_POSTGRES_PORT:-${POSTGRES_PORT:-5432}}"
else
  : "${POSTGRES_USER:=plansocial}"
  : "${POSTGRES_PASSWORD:=plansocial}"
  : "${POSTGRES_DB:=plansocial}"
  : "${POSTGRES_HOST:=localhost}"
  : "${POSTGRES_PORT:=5432}"
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  CONN="$DATABASE_URL"
else
  CONN="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v psql >/dev/null 2>&1; then
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/../database/001_init_schema.sql"
  exit 0
fi

# Fallback dentro del contenedor de docker
if docker inspect social-plans-db >/dev/null 2>&1; then
  docker exec -i social-plans-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$SCRIPT_DIR/../database/001_init_schema.sql"
  exit 0
fi

echo "No se encontró cliente psql y el contenedor social-plans-db no está disponible." >&2
exit 1
