# Deployment

You can self-host the full stack with Docker Compose or run the API and web console separately in the cloud. If you host the Next.js admin console on Vercel, the NestJS API still needs a long-lived host because it serves a persistent gRPC socket.

## Docker Compose (recommended for self-hosting)

From the repository root, start PostgreSQL 16, the API, and the web console:

```bash
pnpm compose:up
```

To run SQL Server instead of PostgreSQL:

```bash
pnpm compose:up:mssql
```

You can also invoke Docker Compose directly:

```bash
docker compose -f deploy/compose/docker-compose.yml --profile postgres up --build
```

### Exposed ports

| Service | Host port | Notes |
| --- | --- | --- |
| Web console | `3000` | Next.js admin UI |
| API HTTP / OpenAPI | `3001` | Health check at `/api/health`, docs at `/api/docs` |
| API gRPC | `5581` | `oum.v1` services |
| PostgreSQL (`--profile postgres`) | `5432` | Override with `POSTGRES_HOST_PORT` |
| SQL Server (`--profile mssql`) | `1433` | Override with `MSSQL_HOST_PORT` |

If port `5432` is already in use on your machine, override the host port:

```bash
POSTGRES_HOST_PORT=5433 pnpm compose:up
```

### Database initialization

- The **PostgreSQL** profile applies `db/postgres/02` through `04` automatically (the Postgres container creates `open_user_db` on startup).
- The **SQL Server** profile runs `db/mssql/01` through `04` via `deploy/compose/mssql-init.sh`.

Never apply both SQL packs to the same database instance.

The seeded admin account is `admin` / `changeme`. Change the password and set a strong `JWT_SECRET` before exposing the stack on a shared network. Compose sets `COOKIE_SECURE=false` so sessions work over `http://localhost`; switch to `COOKIE_SECURE=true` once you serve behind HTTPS.

To stop and remove the containers:

```bash
pnpm compose:down
```

### Pointing Compose at an external database

By default, Compose configures `DATABASE_URL` to use the internal container hostnames (`postgres` or `mssql`) and intentionally ignores any host `DATABASE_URL` pointing to `localhost`. To connect to an external database server instead, export `OUM_DATABASE_KIND` and `OUM_DATABASE_URL` using a hostname reachable from inside the container (not `127.0.0.1`).

## Cloud deployment

- **Web console:** Deploy to Vercel (see [`deploy/vercel/README.md`](../deploy/vercel/README.md)), which rewrites `/api/*` to your NestJS HTTP origin, or run it as a container alongside the API.
- **API:** Deploy on Docker Compose, AWS, GCP, Fly.io, Railway, Render, or any long-lived container platform. Expose HTTP (`3001`) and gRPC (`5581`). Vercel cannot host the API because gRPC requires a long-lived socket.
- **Database:** Apply `db/postgres` to Supabase or any managed PostgreSQL instance, **or** apply `db/mssql` to SQL Server / Azure SQL. Then set `DATABASE_KIND` and `DATABASE_URL`.

### Enabling SSO and two-step verification in containers

The API container reads these optional variables from the environment (Compose passes them through from your shell). Leave them empty to keep SSO and two-step verification disabled.

| Variable | Purpose |
| --- | --- |
| `OIDC_ISSUER` | Public HTTPS URL ending in `/oidc`. Leaving it empty keeps SSO off. |
| `OIDC_COOKIE_KEYS` | Comma-separated random strings for signing provider cookies. |
| `OIDC_SIGNING_KEY_JSON` | Full JSON output from `node scripts/generate-oidc-key.mjs`. The container entrypoint writes this to a private file so you do not need to mount a volume. Use `OIDC_SIGNING_KEY_PATH` instead if you mount your own file. |
| `TOTP_ENCRYPTION_KEY` | 32 or more random characters. Never change it after users have enrolled. |
| `TRUST_PROXY` | Set to `1` when running behind a single load balancer or reverse proxy. |

Store all four secrets in your cloud secret manager rather than baking them into the container image or plain-text task definitions.

### AWS and GCP (Terraform examples)

Run the API container behind an HTTPS load balancer. Starting-point Terraform configurations are available in [`deploy/terraform/aws`](../deploy/terraform/aws) and [`deploy/terraform/gcp`](../deploy/terraform/gcp). Both pass `terraform validate` but have not been applied to a live cloud account, so review them before applying.

| Component | AWS | GCP |
| --- | --- | --- |
| **API container** | ECS on Fargate or EKS | Cloud Run (HTTP only), or GKE / Compute Engine VM if you also need gRPC |
| **Database** | RDS for PostgreSQL | Cloud SQL for PostgreSQL |
| **Secrets** | AWS Secrets Manager injected into task `secrets` | GCP Secret Manager injected into the pod or VM |
| **HTTPS frontend** | ALB with an ACM certificate (`TRUST_PROXY=1`) | HTTPS load balancer with a managed certificate (`TRUST_PROXY=1`) |
| **gRPC (`5581`)** | ALB target group with gRPC protocol, or an internal NLB | GKE internal load balancer, or private VPC networking |
| **Web console** | Separate ECS service or Vercel | Separate GKE workload or Vercel |

**AWS Terraform notes:** The example provisions an ECS service, an RDS PostgreSQL database, an HTTPS ALB, encrypted CloudWatch logs, and a Secrets Manager secret holding the four SSO values. It expects an existing VPC and ACM certificate. After the first `terraform apply`, run `db/postgres/03` and `04` against the `db_address` output from inside the VPC, then point DNS at `alb_dns_name`. Store your Terraform state in an encrypted bucket because it contains generated secrets.

**GCP Terraform notes:** The example provisions a Cloud Run service, a private Cloud SQL PostgreSQL 16 instance, and one Secret Manager entry per secret. It expects an existing VPC network, subnet, and pushed container image. After the first `terraform apply`, run `db/postgres/03` and `04` against `db_private_ip` from inside the VPC (for example, using the Cloud SQL Auth Proxy with `--private-ip` from a VM), then map your custom domain and set `oidc_issuer`. Store your Terraform state in an encrypted bucket.

### Operational notes

- **Cloud Run and gRPC:** Cloud Run only exposes a single port per service, so the GCP example serves HTTP only. If you need gRPC alongside HTTP, use GKE or a Compute Engine VM.
- **Database migrations:** Apply the SQL scripts in `db/postgres` (or `db/mssql`) manually or via a one-off job before starting the API for the first time. The API never runs schema migrations automatically.
- **Health checks:** Point your load balancer health check at `GET /api/health` on port `3001`.
- **Securing gRPC:** Keep gRPC clients on a private network whenever possible. When gRPC traffic crosses an untrusted network, enable both TLS and `GRPC_API_KEY`.
- **Running multiple API instances:** Point all instances at the same database and configure the same OIDC signing key and cookie keys. Note that per-IP rate limits are tracked in memory per process rather than shared across instances. Keep `DB_POOL_MAX × instance count` below your database's connection limit.

## Generating TLS certificates for gRPC

Generate local development certificates with:

```bash
pnpm certs:generate
```

Then enable `GRPC_TLS=true` and configure the PEM paths listed in [docs/environment.md](environment.md). In production, use both TLS and `GRPC_API_KEY`, and never reuse `JWT_SECRET` for gRPC.

## Continuous integration

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs linting, unit tests, a protobuf drift check, a web production build, end-to-end API and smoke tests against both PostgreSQL and SQL Server, and Docker image builds on push.
