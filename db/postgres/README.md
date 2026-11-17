# PostgreSQL pack (`open_user_db`)

Integrator scripts for PostgreSQL or Supabase. This folder is the golden schema.
SQL Server is a later dialect copy of the same logical model — never apply
`db/mssql` to a PostgreSQL instance, and never apply this folder to SQL Server.

## Apply order (psql)

```bash
psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/postgres/01_create_database.sql
psql -U oum -d open_user_db -v ON_ERROR_STOP=1 -f db/postgres/03_create_schema_users.sql
psql -U oum -d open_user_db -v ON_ERROR_STOP=1 -f db/postgres/04_seed.sql
```

Hosted Postgres / Supabase: skip `01_create_database.sql`. Connect to the
provisioned database and run `03` → `04`.
Optional reset (drops `users` only):

```bash
psql -U postgres -d open_user_db -v ON_ERROR_STOP=1 -f db/postgres/99_drop.sql
```

Then re-apply `03` and `04`.

## Nest connection

```
DATABASE_KIND=postgres
DATABASE_URL=postgresql://oum:oum@localhost:5432/open_user_db
```

`01_create_database.sql` creates role `oum` / password `oum` for local demo only.
Change that password before any shared host.

## Demo admin

| Field | Value |
| --- | --- |
| `username` | `admin` |
| password | `changeme` |
| `user_key` | `df47d4ff-cdb2-4fee-ae68-b0f4bfbf5372` |
| `password_hash` | argon2id PHC string (`$argon2id$v=19$m=65536,t=3,p=4$...`) |

The salt lives inside the PHC string. The admin console also requires the
seeded company-wide `oum.admin` grant.

`users."user"` and `users."grant"` are quoted because both are reserved in
PostgreSQL. Every other identifier is unquoted snake_case. Ids are UUID v7; the
seed uses fixed ids. There is no upgrade from the older layout: re-apply `99`,
`03` and `04`.
