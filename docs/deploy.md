# Deploy

Self-host with Docker Compose. Host the Next.js UI on Vercel if you want; the Nest process (HTTP + gRPC) stays on a long-lived host.

## Docker Compose (primary)

From the repo root:

```bash
pnpm compose:up          # Postgres 16 + api + web
# pnpm compose:up:mssql  # SQL Server instead of Postgres
```

Or:

```bash
docker compose -f deploy/compose/docker-compose.yml --profile postgres up --build
```

| Service | Host ports |
| --- | --- |
| web | `3000` |
| api HTTP / OpenAPI | `3001` (`/api/health`, `/api/docs`) |
| api gRPC | `5581` |
| Postgres (optional publish) | `POSTGRES_HOST_PORT` default `5432` → container `5432` |
| SQL Server (`--profile mssql`) | `MSSQL_HOST_PORT` default `1433` |

If host `5432` is already in use:

```bash
POSTGRES_HOST_PORT=5433 pnpm compose:up
```

Init: Compose applies `db/postgres/02`–`04` (the container already creates `open_user_db`). The MSSQL profile runs `db/mssql/01`–`04` via `deploy/compose/mssql-init.sh`. Never apply both packs to one instance.

Demo login: `admin` / `changeme`. Set a real `JWT_SECRET` before any shared host. Compose sets `COOKIE_SECURE=false` so http://localhost sessions work; set `COOKIE_SECURE=true` behind HTTPS.

Stop:

```bash
pnpm compose:down
```

Compose sets in-network `DATABASE_URL` (`postgres` / `mssql` hostnames). A host `DATABASE_URL` pointing at `localhost` is ignored on purpose. To point Compose at another server, export `OUM_DATABASE_KIND` and `OUM_DATABASE_URL` (container-reachable hostname, not `127.0.0.1`).

## Cloud

- **Web:** Vercel. See [`deploy/vercel/README.md`](../deploy/vercel/README.md). Rewrites `/api/*` to the Nest HTTP origin.
- **API:** Compose, Fly, Railway, Render, or any long-lived container. Publish HTTP `3001` and gRPC `5581`. Not Vercel (needs a persistent gRPC socket).
- **DB:** `db/postgres` on Supabase or any Postgres, **or** `db/mssql` on Azure SQL / SQL Server. Then `DATABASE_KIND` + `DATABASE_URL`.

## TLS and gRPC

```bash
pnpm certs:generate
```

Then `GRPC_TLS=true` and the PEM paths in [`docs/environment.md`](environment.md). Production: TLS **and** `GRPC_API_KEY`. Do not reuse `JWT_SECRET` for gRPC.

## CI

GitHub Actions (`.github/workflows/ci.yml`): lint, unit tests, proto dirty check, branding grep, web build, API smoke on Postgres **and** SQL Server, image builds on push.
