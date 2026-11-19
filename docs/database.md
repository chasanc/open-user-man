# Database

Open User Man stores all data in eight tables inside the `users` schema: `company`, `user`, `user_group`, `user_group_member`, `permission`, `scope`, `grant`, and `audit_log`. There are no stored procedures.

## Choosing a SQL pack

Pick **one** SQL pack matching your database engine:

- [`db/postgres`](../db/postgres) — PostgreSQL / Supabase (primary reference schema)
- [`db/mssql`](../db/mssql) — SQL Server / Azure SQL

Never apply both packs to the same database instance. TypeORM runs with `synchronize: false`, so the API never alters the schema automatically. Whenever you change the SQL schema, apply the updated pack and run `pnpm db:scaffold` to verify that the TypeORM entities match the live `users` tables.

## Schema conventions

- **Database and schema:** The default database name is `open_user_db`, and all tables live in the `users` schema using `snake_case` names.
- **Reserved table names:** `user` and `grant` are reserved SQL keywords, so they are always quoted (`users."user"` and `users."grant"` in PostgreSQL; `users.[user]` and `users.[grant]` in SQL Server).
- **Primary keys:** The application generates UUID v7 strings for all record IDs.
- **Terminology:** Capabilities are stored in `permission` (never `asset`). The `grant` table links a user or a user group to a permission, optionally scoped to a node in the `scope` tree.
- **No legacy upgrade path:** There is no migration script from the older 16-table layout. To reset a development database, run `99_drop.sql`, then re-apply the schema and seed scripts.

## Initial seed data

Both SQL packs seed the same starting records:

- **Company:** `Default`
- **Root scope:** `Application`
- **Admin user:** `admin` / `changeme` (hashed with argon2id), granted the company-wide `oum.admin` permission

Change the seeded admin password before exposing the database or API to a shared network.

## Connecting the API

Configure the database engine and connection string in `apps/api/.env`:

```env
DATABASE_KIND=postgres   # or mssql
DATABASE_URL=postgresql://oum:oum@localhost:5432/open_user_db   # or mssql://...
```

If `DATABASE_KIND` does not match the database server you connect to, the API refuses to start.
