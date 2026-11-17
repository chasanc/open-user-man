#!/usr/bin/env bash
# oum REST integration flow with curl and a bearer token. Needs curl and jq.
#   OUM_URL (http://127.0.0.1:3001/api), OUM_USER (admin), OUM_PASSWORD (changeme)
# Prints one line per step and exits non-zero on failure.
set -euo pipefail

base="${OUM_URL:-http://127.0.0.1:3001/api}"
names=(oum.admin data.create data.update data.delete)

fail() { echo "FAIL $*" >&2; exit 1; }

# 1. Token. Needs a valid password and oum.admin; send it as Authorization: Bearer.
body=$(jq -n --arg u "${OUM_USER:-admin}" --arg p "${OUM_PASSWORD:-changeme}" '{username:$u,password:$p}')
token=$(curl -sf -X POST "$base/auth/token" -H 'Content-Type: application/json' -d "$body" | jq -er .accessToken) \
  || fail "token: bad credentials or missing oum.admin"
api() { curl -sf -H "Authorization: Bearer $token" -H 'Content-Type: application/json' "$@"; }

me=$(api "$base/auth/me") || fail "me"
user_id=$(jq -er '.id' <<<"$me")
company_id=$(jq -er '.companyId' <<<"$me")
echo "ok token: ${OUM_USER:-admin} (id $user_id)"

# 2. May this user do it? Authentication alone grants nothing.
allowed=$(api -X POST "$base/v1/check" -d "$(jq -n --arg u "$user_id" --arg p "${names[0]}" '{userId:$u,permission:$p}')" | jq -er .allowed) \
  || fail "check"
echo "ok check: ${names[0]} = $allowed"

# 3. Everything the user holds, directly and through groups.
echo "ok grants: $(api "$base/v1/users/$user_id/grants" | jq '.items | length')"

# 4. List users.
echo "ok users: $(api "$base/v1/users" | jq '.items | length')"

# 5. Make sure the permissions exist.
created=()
for name in "${names[@]}"; do
  found=$(api -G "$base/v1/permissions" --data-urlencode "query=$name" | jq --arg n "$name" '[.items[] | select(.name==$n)] | length') \
    || fail "bootstrap $name"
  if [ "$found" -eq 0 ]; then
    api -X POST "$base/v1/permissions" -d "$(jq -n --arg c "$company_id" --arg n "$name" '{companyId:$c,name:$n}')" >/dev/null \
      || fail "bootstrap $name"
    created+=("$name")
  fi
done
list=""
for name in "${created[@]}"; do list="${list:+$list, }$name"; done
echo "ok bootstrap: created ${#created[@]} ($list)"
