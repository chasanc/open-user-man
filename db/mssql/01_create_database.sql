-- Create the dedicated SQL Server database and demo login.
-- Apply as a sysadmin against master:
--   sqlcmd -S localhost -U sa -C -b -i db/mssql/01_create_database.sql
--
-- Azure SQL / hosted: skip this file. Point DATABASE_URL at the
-- provisioned database and start at 03_create_schema_users.sql.
--
-- Local demo credentials match DATABASE_URL=mssql://oum:oum@localhost:1433/open_user_db
-- Change the login password before any shared or production use.
-- CHECK_POLICY is off only so the local demo password can match Postgres.

USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'oum')
BEGIN
  CREATE LOGIN [oum] WITH PASSWORD = N'oum', CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'open_user_db')
BEGIN
  CREATE DATABASE [open_user_db];
END
GO

USE [open_user_db];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'oum')
BEGIN
  CREATE USER [oum] FOR LOGIN [oum];
END
GO

ALTER ROLE [db_owner] ADD MEMBER [oum];
GO
