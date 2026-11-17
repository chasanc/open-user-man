-- Optional reset. Apply against open_user_db, then re-run 03 and 04:
--   sqlcmd -S localhost -U sa -d open_user_db -C -b -i db/mssql/99_drop.sql
--
-- SQL Server has no DROP SCHEMA CASCADE; tables are dropped in FK-safe order.
--
-- To drop the database itself (sysadmin, connected to master, not open_user_db):
--   ALTER DATABASE open_user_db SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
--   DROP DATABASE open_user_db;

USE [open_user_db];
GO

DROP TABLE IF EXISTS users.[grant];
DROP TABLE IF EXISTS users.user_group_member;
DROP TABLE IF EXISTS users.permission;
DROP TABLE IF EXISTS users.scope;
DROP TABLE IF EXISTS users.user_group;
DROP TABLE IF EXISTS users.[user];
DROP TABLE IF EXISTS users.company;
DROP TABLE IF EXISTS users.audit_log;
GO

DROP SCHEMA IF EXISTS users;
GO
