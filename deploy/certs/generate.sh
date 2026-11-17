#!/usr/bin/env bash
# Open User Man PKI: a new CA, server and client certificate for local gRPC TLS.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
HOST="${OUM_CERT_HOST:-localhost}"
DAYS="${OUM_CERT_DAYS:-825}"
SERVER="$ROOT/server"
CLIENT="$ROOT/client"

mkdir -p "$SERVER" "$CLIENT"

openssl req -x509 -newkey rsa:2048 -sha256 -days "$DAYS" -nodes \
  -keyout "$SERVER/ca.key" -out "$SERVER/ca.crt" \
  -subj "/O=Open User Man/CN=Open User Man CA"

openssl req -newkey rsa:2048 -nodes \
  -keyout "$SERVER/server.key" -out "$SERVER/server.csr" \
  -subj "/O=Open User Man/CN=${HOST}"

cat > "$SERVER/server.ext" <<EOF
subjectAltName=DNS:localhost,DNS:${HOST},IP:127.0.0.1
extendedKeyUsage=serverAuth
keyUsage=digitalSignature,keyEncipherment
EOF

openssl x509 -req -in "$SERVER/server.csr" \
  -CA "$SERVER/ca.crt" -CAkey "$SERVER/ca.key" -CAcreateserial \
  -out "$SERVER/server.crt" -days "$DAYS" -sha256 -extfile "$SERVER/server.ext"

openssl req -newkey rsa:2048 -nodes \
  -keyout "$CLIENT/client.key" -out "$CLIENT/client.csr" \
  -subj "/O=Open User Man/CN=Open User Man Client"

cat > "$CLIENT/client.ext" <<EOF
extendedKeyUsage=clientAuth
keyUsage=digitalSignature
EOF

openssl x509 -req -in "$CLIENT/client.csr" \
  -CA "$SERVER/ca.crt" -CAkey "$SERVER/ca.key" -CAcreateserial \
  -out "$CLIENT/client.crt" -days "$DAYS" -sha256 -extfile "$CLIENT/client.ext"

cp "$SERVER/ca.crt" "$CLIENT/ca.crt"
rm -f "$SERVER/server.csr" "$CLIENT/client.csr" "$SERVER/server.ext" "$CLIENT/client.ext"

echo "Wrote PEMs under ${SERVER} and ${CLIENT}"
echo "Set GRPC_TLS=true GRPC_TLS_CA=${SERVER}/ca.crt GRPC_TLS_CERT=${SERVER}/server.crt GRPC_TLS_KEY=${SERVER}/server.key"
