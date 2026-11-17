# Environment variables

The API and web read dotenv files and exit if a required variable is missing from those files. Shell variables alone are not enough.

Shared values are in the repo-root `.env`. API-only values are in `apps/api/.env`. Web-only values are in `apps/web/.env`. The app file overrides the root file when a name appears in both.

Create the local files with `node scripts/write-local-env.mjs`. They are gitignored. The values below are local defaults (`JWT_SECRET=change-me`, database user `oum`). Replace them before any shared deployment.

`GRPC_API_KEY` may be empty. That disables the gRPC app-key check. It is not `JWT_SECRET`. When `GRPC_TLS=true`, `GRPC_TLS_CERT` and `GRPC_TLS_KEY` must be non-empty.

## Shared (`.env`)

```
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
MULTI_COMPANY_MODE=false
```

## API (`apps/api/.env`)

```
HTTP_HOST=0.0.0.0
HTTP_PORT=3001
GRPC_PORT=5581
GRPC_TLS=false
GRPC_TLS_CA=../../deploy/certs/server/ca.crt
GRPC_TLS_CERT=../../deploy/certs/server/server.crt
GRPC_TLS_KEY=../../deploy/certs/server/server.key
GRPC_TLS_REQUIRE_CLIENT_CERT=false
GRPC_API_KEY=
DATABASE_KIND=postgres
DATABASE_URL=postgresql://oum:oum@localhost:5432/open_user_db
JWT_SECRET=change-me
JWT_EXPIRES_IN=1d
COOKIE_SECURE=false
RATE_LIMIT_ENABLED=false
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_SECONDS=60
```

Optional API tuning. Each key has a default and is not required:

```
LOGIN_RATE_LIMIT_MAX=10
DB_POOL_MAX=20
DB_CONNECT_TIMEOUT_MS=5000
TRUST_PROXY=
```

- `LOGIN_RATE_LIMIT_MAX`: login attempts per IP and per user name in each `RATE_LIMIT_WINDOW_SECONDS` window. It is always on, independent of `RATE_LIMIT_ENABLED`. `0` turns it off. Counting by user name means someone can lock a known account out for one window.
- `DB_POOL_MAX`: connections per API process. Keep it below the database's connection limit divided by the number of API instances (Postgres defaults to 100).
- `DB_CONNECT_TIMEOUT_MS`: Postgres only. How long a query waits for a free connection before it fails. SQL Server uses the driver default.
- `TRUST_PROXY`: set it when the API runs behind a reverse proxy, or every client appears as the proxy's IP and shares one rate-limit bucket. Accepts `true`, a hop count such as `1`, or a name such as `loopback`. Leave it empty when clients connect directly, because a client could then fake its IP with `X-Forwarded-For`.
- `UV_THREADPOOL_SIZE`: this is a process environment variable, not a dotenv key. Argon2 runs on Node's threadpool (4 threads by default), so raise it to the number of CPU cores to hash more passwords in parallel. Each hash uses about 64 MiB. The Compose file leaves it at the default.

## Web (`apps/web/.env`)

```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
API_INTERNAL_URL=http://localhost:3001/api
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_DEFAULT_APP_NAME=OpenUserMan
NEXT_PUBLIC_MULTI_COMPANY_MODE=false
NEXT_PUBLIC_HOME_TITLE=Open User Man
```

Compose (`pnpm compose:up`) does not read the host `.env`. The API entrypoint writes container `.env` files from the Compose environment. Override the database with `OUM_DATABASE_KIND` / `OUM_DATABASE_URL` (see [`docs/deploy.md`](deploy.md)). The web image writes its own `.env` at build time, with `API_INTERNAL_URL=http://api:3001/api`.
