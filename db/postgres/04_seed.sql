-- Demo seed for a fresh open_user_db. Apply after 03_create_schema_users.sql:
--   psql -U oum -d open_user_db -v ON_ERROR_STOP=1 -f db/postgres/04_seed.sql
--
-- Local admin login: username=admin  password=changeme
-- Admin user_key:  df47d4ff-cdb2-4fee-ae68-b0f4bfbf5372
-- password_hash is argon2id (PHC); the salt is inside the string.
-- Ids are fixed UUIDs so the seed is repeatable. The application generates UUID v7 for new rows.

INSERT INTO users.company (id, company_key, name, active) VALUES
  ('01930000-0000-7000-8000-000000000001', '6146103c-529a-4c8c-93dc-b1e96c678371', 'Default', true);

INSERT INTO users."user" (id, company_id, user_key, username, first_name, last_name, email, mobile, password_hash, active) VALUES (
  '01930000-0000-7000-8000-000000000002',
  '01930000-0000-7000-8000-000000000001',
  'df47d4ff-cdb2-4fee-ae68-b0f4bfbf5372',
  'admin',
  'System',
  'Admin',
  'admin@localhost',
  NULL,
  '$argon2id$v=19$m=65536,t=3,p=4$dH9horpWSZ5n6PRUNwuwvg$yKZ5aiv24M1lgMYb0lkwK5DpGzJn5YAeSJ7WgckcDzY',
  true
);

INSERT INTO users.user_group (id, company_id, name, description) VALUES
  ('01930000-0000-7000-8000-000000000003', '01930000-0000-7000-8000-000000000001', 'Admin', 'Has admin privileges'),
  ('01930000-0000-7000-8000-000000000004', '01930000-0000-7000-8000-000000000001', 'Everyone', 'Default group for users');

INSERT INTO users.user_group_member (user_id, group_id) VALUES
  ('01930000-0000-7000-8000-000000000002', '01930000-0000-7000-8000-000000000003');

INSERT INTO users.scope (id, company_id, parent_id, scope_key, name, description) VALUES (
  '01930000-0000-7000-8000-000000000005',
  '01930000-0000-7000-8000-000000000001',
  NULL,
  'b7cf4551-4bef-4336-8bbc-9b2d55e3bfdb',
  'Application',
  'Default location'
);

INSERT INTO users.permission (id, company_id, name, description) VALUES
  ('01930000-0000-7000-8000-000000000006', '01930000-0000-7000-8000-000000000001', 'oum.admin', 'Use the admin UI and manage users, groups, permissions, scopes and grants');

-- admin holds oum.admin company-wide (no scope)
INSERT INTO users."grant" (id, user_id, group_id, permission_id, scope_id) VALUES
  ('01930000-0000-7000-8000-000000000007', '01930000-0000-7000-8000-000000000002', NULL, '01930000-0000-7000-8000-000000000006', NULL);
