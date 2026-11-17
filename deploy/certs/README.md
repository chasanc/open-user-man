# Certificates

Generate a new CA + server + client PEM trio with OpenSSL (`./generate.sh`).
`.key` files are gitignored.

```bash
pnpm certs:generate
# or: bash deploy/certs/generate.sh
```

Optional `OUM_CERT_HOST` (SAN/CN, default `localhost`) and `OUM_CERT_DAYS` (default 825).

## Use

- `GRPC_TLS=false` — insecure (local default).
- `GRPC_TLS=true` — load `GRPC_TLS_CA`, `GRPC_TLS_CERT`, `GRPC_TLS_KEY`.
- Optional mTLS: `GRPC_TLS_REQUIRE_CLIENT_CERT=true` and the client PEMs under `deploy/certs/client/`.

Production: TLS **and** `GRPC_API_KEY`. The PEMs encrypt the wire; the API key identifies the integrating app.
