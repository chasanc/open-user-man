#!/usr/bin/env bash
set -euo pipefail

BASE="${SMOKE_BASE_URL:-http://127.0.0.1:3001}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

health="$(curl -sS -f "${BASE}/api/health")"
echo "$health" | grep -q '"status":"ok"'
echo "health ok"

login="$(curl -sS -f -c "$COOKIE_JAR" -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"changeme"}' \
  "${BASE}/api/auth/login")"
echo "$login" | grep -q '"username":"admin"'
echo "login ok"

users="$(curl -sS -f -b "$COOKIE_JAR" "${BASE}/api/v1/users")"
echo "$users" | grep -q '"username":"admin"'
echo "users ok"

groups="$(curl -sS -f -b "$COOKIE_JAR" "${BASE}/api/v1/groups")"
echo "$groups" | grep -q '"items"'
echo "groups ok"

perms="$(curl -sS -f -b "$COOKIE_JAR" "${BASE}/api/v1/permissions?query=oum.admin")"
echo "$perms" | grep -q '"name":"oum.admin"'
echo "permissions ok"
