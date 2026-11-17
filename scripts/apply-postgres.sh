#!/usr/bin/env bash
set -euo pipefail

HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-5432}"
USER="${PGUSER:-oum}"
PASSWORD="${PGPASSWORD:-oum}"
DB="${PGDATABASE:-open_user_db}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

export PGPASSWORD="$PASSWORD"
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/db/postgres/03_create_schema_users.sql"
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/db/postgres/04_seed.sql"
