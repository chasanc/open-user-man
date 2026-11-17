-- Create the dedicated PostgreSQL database and demo role.
-- Apply as a superuser against the maintenance database (usually postgres):
--   psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f db/postgres/01_create_database.sql
--
-- Hosted Postgres / Supabase: skip this file. Point DATABASE_URL at the
-- provisioned database and start at 03_create_schema_users.sql.
--
-- Local demo credentials match DATABASE_URL=postgresql://oum:oum@localhost:5432/open_user_db
-- Change the role password before any shared or production use.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'oum') THEN
    CREATE ROLE oum LOGIN PASSWORD 'oum';
  END IF;
END
$$;

SELECT 'CREATE DATABASE open_user_db OWNER oum ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'open_user_db')\gexec

GRANT ALL PRIVILEGES ON DATABASE open_user_db TO oum;
