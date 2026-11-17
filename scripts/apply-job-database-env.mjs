import { readFileSync, writeFileSync } from 'node:fs';

const path = 'apps/api/.env';
let text = readFileSync(path, 'utf8');
for (const key of ['DATABASE_KIND', 'DATABASE_URL', 'JWT_SECRET']) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required to update ${path}`);
  }
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!pattern.test(text)) {
    throw new Error(`${key} is missing from ${path}`);
  }
  text = text.replace(pattern, `${key}=${value}`);
}
writeFileSync(path, text);
