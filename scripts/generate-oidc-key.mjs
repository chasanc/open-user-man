// Writes an ES256 signing key (private JWK, with a key id) for the OpenID provider.
//   node scripts/generate-oidc-key.mjs [path]      default: ./oidc-signing-key.json
// One key per environment. Never reuse JWT_SECRET. Keep the file out of git (*.pem and this name are ignored).
// Rotation: OIDC_SIGNING_KEY_PATH takes a comma-separated list; the first key signs, all are published.
// List the old key first and the new one second, wait for clients to refresh their key set, then swap the order.
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';

const path = process.argv[2] ?? 'oidc-signing-key.json';
if (existsSync(path)) {
  console.error(`${path} exists; refusing to overwrite a signing key.`);
  process.exit(1);
}
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...privateKey.export({ format: 'jwk' }), use: 'sig', alg: 'ES256', kid: randomUUID() };
writeFileSync(path, `${JSON.stringify(jwk, null, 2)}\n`, { mode: 0o600 });
console.log(`wrote ${path} (kid ${jwk.kid})`);
