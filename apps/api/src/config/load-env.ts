import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const requiredKeys = [
  'HTTP_HOST',
  'HTTP_PORT',
  'GRPC_PORT',
  'GRPC_TLS',
  'GRPC_TLS_CA',
  'GRPC_TLS_CERT',
  'GRPC_TLS_KEY',
  'GRPC_TLS_REQUIRE_CLIENT_CERT',
  'GRPC_API_KEY',
  'DATABASE_KIND',
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_EXPIRES_IN',
  'COOKIE_SECURE',
  'MULTI_COMPANY_MODE',
  'RATE_LIMIT_ENABLED',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_SECONDS',
  'LOG_LEVEL',
  'CORS_ORIGIN',
] as const;

const allowEmpty = new Set(['GRPC_API_KEY', 'GRPC_TLS_CA', 'GRPC_TLS_CERT', 'GRPC_TLS_KEY']);

const numberKeys = new Set([
  'HTTP_PORT',
  'GRPC_PORT',
  'RATE_LIMIT_MAX',
  'RATE_LIMIT_WINDOW_SECONDS',
]);

// Optional tuning keys with defaults in env.ts. When present they must be numbers.
const optionalNumberKeys = ['LOGIN_RATE_LIMIT_MAX', 'DB_POOL_MAX', 'DB_CONNECT_TIMEOUT_MS'];

export function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Cannot find the repo root from ${start} to load .env`);
}

export function missingEnvKeys(
  source: Record<string, string>,
  keys: readonly string[],
  emptyAllowed: ReadonlySet<string>,
): string[] {
  return keys.filter((key) => {
    if (!(key in source)) return true;
    return source[key].trim() === '' && !emptyAllowed.has(key);
  });
}

function readEnvFiles(paths: string[]): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const path of paths) {
    if (!existsSync(path)) {
      throw new Error(`Missing env file ${path}`);
    }
    Object.assign(merged, parse(readFileSync(path)));
  }
  return merged;
}

let cached: Record<string, string> | undefined;

export function apiEnv(): Record<string, string> {
  if (cached) return cached;
  const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
  const files = [resolve(root, '.env'), resolve(root, 'apps/api/.env')];
  const merged = readEnvFiles(files);
  const missing = missingEnvKeys(merged, requiredKeys, allowEmpty);
  if (missing.length > 0) {
    throw new Error(
      `Missing required variables in ${files.join(' and ')}: ${missing.join(', ')}`,
    );
  }
  if (merged.GRPC_TLS === 'true') {
    const tlsMissing = ['GRPC_TLS_CERT', 'GRPC_TLS_KEY'].filter(
      (key) => merged[key].trim() === '',
    );
    if (tlsMissing.length > 0) {
      throw new Error(
        `GRPC_TLS=true requires ${tlsMissing.join(', ')} in ${files.join(' and ')}`,
      );
    }
  }
  for (const key of numberKeys) {
    if (!Number.isFinite(Number(merged[key]))) {
      throw new Error(`${key} must be a number in ${files.join(' and ')}`);
    }
  }
  for (const key of optionalNumberKeys) {
    if (key in merged && !Number.isFinite(Number(merged[key]))) {
      throw new Error(`${key} must be a number in ${files.join(' and ')}`);
    }
  }
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
  cached = merged;
  return merged;
}
