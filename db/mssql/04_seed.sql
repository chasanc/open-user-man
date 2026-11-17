-- Demo seed for a fresh open_user_db. Apply after 03_create_schema_users.sql:
--   sqlcmd -S localhost -U oum -P oum -d open_user_db -C -b -i db/mssql/04_seed.sql
--
-- Local admin login: username=admin  password=changeme
-- Admin user_key:  df47d4ff-cdb2-4fee-ae68-b0f4bfbf5372
-- password_hash is argon2id (PHC); the salt is inside the string.
-- Ids are fixed GUIDs so the seed is repeatable. The application generates UUID v7 for new rows.

USE [open_user_db];
GO

SET QUOTED_IDENTIFIER ON;
GO

INSERT INTO users.company (id, company_key, name, active) VALUES
  ('01930000-0000-7000-8000-000000000001', N'6146103c-529a-4c8c-93dc-b1e96c678371', N'Default', 1);

INSERT INTO users.[user] (id, company_id, user_key, username, first_name, last_name, email, mobile, password_hash, active) VALUES (
  '01930000-0000-7000-8000-000000000002',
  '01930000-0000-7000-8000-000000000001',
  N'df47d4ff-cdb2-4fee-ae68-b0f4bfbf5372',
  N'admin',
  N'System',
  N'Admin',
  N'admin@localhost',
  NULL,
  N'$argon2id$v=19$m=65536,t=3,p=4$dH9horpWSZ5n6PRUNwuwvg$yKZ5aiv24M1lgMYb0lkwK5DpGzJn5YAeSJ7WgckcDzY',
  1
);

INSERT INTO users.user_group (id, company_id, name, description) VALUES
  ('01930000-0000-7000-8000-000000000003', '01930000-0000-7000-8000-000000000001', N'Admin', N'Has admin privileges'),
  ('01930000-0000-7000-8000-000000000004', '01930000-0000-7000-8000-000000000001', N'Everyone', N'Default group for users');

INSERT INTO users.user_group_member (user_id, group_id) VALUES
  ('01930000-0000-7000-8000-000000000002', '01930000-0000-7000-8000-000000000003');

INSERT INTO users.scope (id, company_id, parent_id, scope_key, name, description) VALUES (
  '01930000-0000-7000-8000-000000000005',
  '01930000-0000-7000-8000-000000000001',
  NULL,
  N'b7cf4551-4bef-4336-8bbc-9b2d55e3bfdb',
  N'Application',
  N'Default location'
);

INSERT INTO users.permission (id, company_id, name, description) VALUES
  ('01930000-0000-7000-8000-000000000006', '01930000-0000-7000-8000-000000000001', N'oum.admin', N'Use the admin UI and manage users, groups, permissions, scopes and grants');

-- admin holds oum.admin company-wide (no scope)
INSERT INTO users.[grant] (id, user_id, group_id, permission_id, scope_id) VALUES
  ('01930000-0000-7000-8000-000000000007', '01930000-0000-7000-8000-000000000002', NULL, '01930000-0000-7000-8000-000000000006', NULL);
GO
