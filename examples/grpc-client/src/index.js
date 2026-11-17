// oum gRPC client in Node. Runs the shared integration flow and exits non-zero on failure.
//   GRPC_TARGET (127.0.0.1:5581), GRPC_API_KEY, OUM_COMPANY_KEY, OUM_USER (admin), OUM_PASSWORD (changeme)
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { credentials, loadPackageDefinition, Metadata } from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';

const protoDir = join(dirname(fileURLToPath(import.meta.url)), '../../../packages/proto');
const definition = loadSync(join(protoDir, 'open-user-management.proto'), {
  includeDirs: [protoDir],
  enums: String,
  defaults: false,
  oneofs: true,
});
const oum = loadPackageDefinition(definition).oum.v1;
const target = process.env.GRPC_TARGET ?? '127.0.0.1:5581';
const channel = credentials.createInsecure();
const client = (name) => new oum[name](target, channel);

const metadata = new Metadata();
if (process.env.GRPC_API_KEY) metadata.set('x-api-key', process.env.GRPC_API_KEY);
if (process.env.OUM_COMPANY_KEY) metadata.set('company-key', process.env.OUM_COMPANY_KEY);

const call = (service, method, request) =>
  new Promise((resolve, reject) =>
    service[method](request, metadata, (error, reply) => (error ? reject(new Error(`${method}: ${error.details}`)) : resolve(reply))),
  );

const NAMES = ['oum.admin', 'data.create', 'data.update', 'data.delete'];

async function run() {
  const auth = client('AuthService');
  const access = client('AccessService');
  const users = client('UserService');
  const permissions = client('PermissionService');

  // 1. Authenticate: wrong credentials come back as UNAUTHENTICATED.
  const user = await call(auth, 'Authenticate', {
    username: process.env.OUM_USER ?? 'admin',
    password: process.env.OUM_PASSWORD ?? 'changeme',
  });
  console.log(`ok authenticate: ${user.username} (id ${user.id})`);

  // 2. May this user do something? Authentication alone grants nothing.
  const check = await call(access, 'Check', { userId: user.id, permission: NAMES[0] });
  console.log(`ok check: ${NAMES[0]} = ${check.allowed}`);

  // 3. Everything the user holds, directly and through groups.
  const grants = await call(access, 'ListGrantsForUser', { userId: user.id });
  console.log(`ok grants: ${(grants.grants ?? []).length}`);

  // 4. List users.
  const list = await call(users, 'ListUsers', { companyId: user.companyId, pageSize: 100 });
  console.log(`ok users: ${(list.users ?? []).length}`);

  // 5. Make sure the permissions exist.
  const created = [];
  for (const name of NAMES) {
    const found = await call(permissions, 'ListPermissions', { companyId: user.companyId, query: name, pageSize: 100 });
    if ((found.permissions ?? []).some((p) => p.name === name)) continue;
    await call(permissions, 'CreatePermission', { companyId: user.companyId, name });
    created.push(name);
  }
  console.log(`ok bootstrap: created ${created.length} (${created.join(', ')})`);
}

run().catch((error) => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
