#!/usr/bin/env bash
set -euo pipefail

HOST="${MSSQL_HOST:-mssql}"
SA_PASSWORD="${MSSQL_SA_PASSWORD:?MSSQL_SA_PASSWORD is required}"
OUM_PASSWORD="${MSSQL_OUM_PASSWORD:-oum}"
SQLCMD="${SQLCMD:-/opt/mssql-tools18/bin/sqlcmd}"
SCRIPTS="${SCRIPTS:-/scripts}"

wait_for_sql() {
  local i=0
  until "$SQLCMD" -C -S "$HOST" -U sa -P "$SA_PASSWORD" -Q "SELECT 1" -b -o /dev/null; do
    i=$((i + 1))
    if [ "$i" -ge 60 ]; then
      echo "SQL Server at ${HOST} did not become ready" >&2
      exit 1
    fi
    sleep 2
  done
}

already_seeded() {
  "$SQLCMD" -C -S "$HOST" -U oum -P "$OUM_PASSWORD" -d open_user_db -h -1 -W -b \
    -Q "SET NOCOUNT ON; SELECT TOP (1) user_name FROM users.[user] WHERE user_name = N'admin';" \
    2>/dev/null | grep -q admin
}

wait_for_sql
"$SQLCMD" -C -S "$HOST" -U sa -P "$SA_PASSWORD" -b -i "${SCRIPTS}/01_create_database.sql"

if already_seeded; then
  echo "open_user_db already seeded"
  exit 0
fi

"$SQLCMD" -C -S "$HOST" -U oum -P "$OUM_PASSWORD" -d open_user_db -b -i "${SCRIPTS}/03_create_schema_users.sql"
"$SQLCMD" -C -S "$HOST" -U oum -P "$OUM_PASSWORD" -d open_user_db -b -i "${SCRIPTS}/04_seed.sql"
echo "open_user_db MSSQL pack applied"
