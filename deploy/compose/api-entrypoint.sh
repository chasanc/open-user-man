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

# Cloud secret stores hand a container environment variables, not files. Put the
# OpenID signing key (the JSON from scripts/generate-oidc-key.mjs) in
# OIDC_SIGNING_KEY_JSON and it is written to a private file the API can read.
if [ -n "$(val OIDC_SIGNING_KEY_JSON)" ] && [ -z "$(val OIDC_SIGNING_KEY_PATH)" ]; then
  OIDC_SIGNING_KEY_PATH=${OIDC_KEY_FILE:-/tmp/oidc-signing-key.json}
  (umask 077 && printf '%s' "$(val OIDC_SIGNING_KEY_JSON)" > "$OIDC_SIGNING_KEY_PATH")
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
  # Empty OIDC_ISSUER keeps single sign-on off; empty TOTP_ENCRYPTION_KEY refuses enrolment.
  line TRUST_PROXY optional
  line OIDC_ISSUER optional
  line OIDC_COOKIE_KEYS optional
  line OIDC_SIGNING_KEY_PATH optional
  line TOTP_ENCRYPTION_KEY optional
} > "$root/apps/api/.env"

# Set WRITE_ENV_ONLY=1 to stop after the files are written (local checks).
if [ "${WRITE_ENV_ONLY:-}" = 1 ]; then
  exit 0
fi

# Same as `pnpm --filter @oum/api start:prod`, without pnpm: the image runs as a user that cannot fetch it.
cd "$root/apps/api"
exec node dist/main
