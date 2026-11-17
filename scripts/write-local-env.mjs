import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const files = {
  '.env': `CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
MULTI_COMPANY_MODE=false
`,
  'apps/api/.env': `HTTP_HOST=0.0.0.0
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
RATE_LIMIT_ENABLED=false
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_SECONDS=60
`,
  'apps/web/.env': `NEXT_PUBLIC_API_URL=http://localhost:3001/api
API_INTERNAL_URL=http://localhost:3001/api
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_DEFAULT_APP_NAME=OpenUserMan
NEXT_PUBLIC_MULTI_COMPANY_MODE=false
NEXT_PUBLIC_HOME_TITLE=Open User Man
`,
};

for (const [relativePath, contents] of Object.entries(files)) {
  const path = resolve(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  console.log(`wrote ${relativePath}`);
}
