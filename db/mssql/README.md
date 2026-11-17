# SQL Server pack (`open_user_db`)

Integrator scripts for SQL Server or Azure SQL. This folder is a dialect copy
of the golden PostgreSQL schema. Never apply `db/postgres` to a SQL Server
instance, and never apply this folder to PostgreSQL.

## Apply order (sqlcmd)

```bash
sqlcmd -S localhost -U sa -C -b -i db/mssql/01_create_database.sql
sqlcmd -S localhost -U oum -P oum -d open_user_db -C -b -i db/mssql/03_create_schema_users.sql
sqlcmd -S localhost -U oum -P oum -d open_user_db -C -b -i db/mssql/04_seed.sql
```

`-b` aborts on error (same role as `psql -v ON_ERROR_STOP=1`). `-C` trusts the
server certificate (sqlcmd 18+). Adjust `-S` / credentials for your instance.

Azure SQL / hosted: skip `01_create_database.sql`. Connect to the provisioned
database and run `03` → `04`.
Optional reset (drops `users` only):

```bash
sqlcmd -S localhost -U sa -d open_user_db -C -b -i db/mssql/99_drop.sql
```

Then re-apply `03` and `04`.

## Nest connection

```
DATABASE_KIND=mssql
DATABASE_URL=mssql://oum:oum@localhost:1433/open_user_db
```

`01_create_database.sql` creates login `oum` / password `oum` for local demo only.
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

`users.[user]` and `users.[grant]` are quoted because both are reserved in
SQL Server. Every other identifier is unquoted snake_case. Ids are UUID v7
(`uniqueidentifier`); the seed uses fixed ids. There is no upgrade from the
older layout: re-apply `99`, `03` and `04`.
