#!/bin/sh
# Compose injects configuration as container environment variables.
# The API process only accepts values it has read from .env files, so write
# those files here and then start. A missing required variable exits non-zero.
set -eu

die() {
  echo "api-entrypoint: $*" >&2
  exit 1
}

val() {
  eval "printf '%s' \"\${$1-}\""
}

line() {
  key=$1
  required=$2
  value=$(val "$key")
  if [ "$required" = required ] && [ -z "$value" ]; then
    die "$key is required"
  fi
  printf '%s=%s\n' "$key" "$value"
}

tls=$(val GRPC_TLS)
if [ "$tls" = true ]; then
  cert=$(val GRPC_TLS_CERT)
  key=$(val GRPC_TLS_KEY)
  if [ -z "$cert" ] || [ -z "$key" ]; then
    die "GRPC_TLS=true requires GRPC_TLS_CERT and GRPC_TLS_KEY"
  fi
fi

root=${APP_ROOT:-/app}
mkdir -p "$root/apps/api"
{
  line CORS_ORIGIN required
  line LOG_LEVEL required
  line MULTI_COMPANY_MODE required
} > "$root/.env"

{
  line HTTP_HOST required
  line HTTP_PORT required
  line GRPC_PORT required
  line GRPC_TLS required
  line GRPC_TLS_CA optional
  line GRPC_TLS_CERT optional
  line GRPC_TLS_KEY optional
  line GRPC_TLS_REQUIRE_CLIENT_CERT required
  line GRPC_API_KEY optional
  line DATABASE_KIND required
  line DATABASE_URL required
  line JWT_SECRET required
  line JWT_EXPIRES_IN required
  line COOKIE_SECURE required
  line RATE_LIMIT_ENABLED required
  line RATE_LIMIT_MAX required
  line RATE_LIMIT_WINDOW_SECONDS required
} > "$root/apps/api/.env"

# Set WRITE_ENV_ONLY=1 to stop after the files are written (local checks).
if [ "${WRITE_ENV_ONLY:-}" = 1 ]; then
  exit 0
fi

cd "$root"
exec pnpm --filter @oum/api start:prod
