-- Optional reset. Apply against open_user_db, then re-run 03 and 04:
--   psql -U postgres -d open_user_db -v ON_ERROR_STOP=1 -f db/postgres/99_drop.sql
--
-- To drop the database itself (superuser, connected to postgres, not open_user_db):
--   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
--     WHERE datname = 'open_user_db' AND pid <> pg_backend_pid();
--   DROP DATABASE IF EXISTS open_user_db;

DROP SCHEMA IF EXISTS users CASCADE;
