# CONTEXT

Contributor and agent glossary for **Open User Man** (`oum`).

## Vocabulary

| Term | Meaning |
| --- | --- |
| Permission | A named capability with a dotted name (`invoice.approve`). Code and SQL say **Permission**, never Asset. |
| Grant | One row that gives a permission to a user **or** a user group, at a scope (or company-wide when the scope is empty). The only place access is recorded. |
| User | A person or service account that signs in. Belongs to one company. |
| UserGroup | A flat set of users. Groups do not nest. |
| Scope | A node in a tree that says where a grant applies: an app part, a customer area, or a place such as a region or building. See [docs/domain.md](docs/domain.md#scopes). Not an OAuth token scope. In code, docs and UI write "token scope" for the OAuth/OpenID meaning (`openid`, `email`, `profile`) and plain Scope for this tree. |
| Company | A tenant |
| Check | The one authorization question: may this user have this permission at this scope? |

UI copy may say "Access rights"; code and SQL say **Permission**. In OAuth/OIDC text always write "token scope" for the OAuth meaning.

## Domain rules

The full text with reasons is in [docs/domain.md](docs/domain.md#rules).

- Deactivate: sets `active = false` and `deleted_at`; the row leaves the lists and can be activated again. Reads exclude deactivated rows unless asked (`includeDeactivated`).
- Remove: permanently deletes a deactivated row that nothing points at. The full row is kept in `audit_log`.
- Sign-in: an active, not-deleted user with a matching password. No login permission. The admin UI additionally needs the `oum.admin` permission, checked like any other.
- Access: a user holds their own grants plus those of every active group they belong to. Groups are flat.
- A grant at a scope also applies to every descendant scope. A grant with no scope applies company-wide. A Check without a scope counts company-wide grants only.
- Grants are allow-only. There are no deny rules.
- Multi-company: filter by `company-key` / JWT company when `MULTI_COMPANY_MODE=true`.
- Passwords: argon2id (the hash string carries its own salt).
- Ids are UUID v7 strings.
- Every change except an insert is written to `users.audit_log` in the same transaction.

## Architecture

- One Nest process: REST on `HTTP_PORT` (default 3001) **and** gRPC on `GRPC_PORT` (default 5581). No second executable.
- Proto (`packages/proto`) is the API type SSOT. SQL packs (`db/postgres`, `db/mssql`) are the schema SSOT. TypeORM `synchronize: false`.
- `DATABASE_KIND` is `postgres` or `mssql` plus one `DATABASE_URL`. Wrong kind vs server is a startup error.
- Next.js talks REST JSON using generated `@oum/proto` interfaces. It does not speak binary protobuf.
- Vercel hosts **web** only. Nest (gRPC) stays on a long-lived host.

## Auth (do not mix secrets)

- `JWT_SECRET`: REST admin session/JWT only. Required; no default in source.
- `GRPC_API_KEY`: integrating apps, metadata `x-api-key` (and `company-key` in multi-company mode). Empty = no check (local). Not TLS.
- `GRPC_TLS`: encrypt gRPC. PEM paths `GRPC_TLS_CA`, `GRPC_TLS_CERT`, `GRPC_TLS_KEY`. Default false.
- Production: TLS **and** API key. Do not reuse `JWT_SECRET` for gRPC.

## Environment

Shared keys live in the repo-root `.env`. API keys live in `apps/api/.env`. Web keys live in `apps/web/.env`. `node scripts/write-local-env.mjs` writes the local defaults. The services exit when a required key is missing from those files:

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
MULTI_COMPANY_MODE=false
RATE_LIMIT_ENABLED=false
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_SECONDS=60
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000

NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_DEFAULT_APP_NAME=OpenUserMan
NEXT_PUBLIC_MULTI_COMPANY_MODE=false
NEXT_PUBLIC_HOME_TITLE=Open User Man
```

## Database packs

8 tables in the `users` schema: `company`, `user`, `user_group`, `user_group_member`, `permission`, `scope`, `grant` and `audit_log`. Golden pack: [`db/postgres`](db/postgres). SQL Server: [`db/mssql`](db/mssql) (same logical schema, dialect types). Never apply both packs to one instance.

- Database: `open_user_db`. Schema: `users`. Snake_case. `users."user"` and `users."grant"` are quoted (reserved).
- Local seed: company `Default`; scope `Application`; user `admin` / `changeme` (argon2id); the `oum.admin` permission granted to admin company-wide. Change the seed password before any real use.
- TypeORM entities live in `apps/api/src/infrastructure/database/entities/` (one folder). `synchronize: false`. `pnpm db:scaffold` checks the live `users` table list against that list.

## Proto (`packages/proto`)

`open-user-management.proto` is the `oum.v1` contract: one gRPC service per resource (`AuthService`, `AccessService`, `UserService`, `UserGroupService`, `PermissionService`, `ScopeService`, `CompanyService`, `GrantService`). Ids are strings, lists are paginated, updates use field masks, errors are gRPC status codes. Generate with `pnpm proto:generate`.

## Runtime pins

- Node 24.21.0 (Active LTS). Not Node 26.
- pnpm 12.4.2.
- NestJS 12.x, Next.js 16.x, React 19.x. No canary/beta/rc/`next` tags.
