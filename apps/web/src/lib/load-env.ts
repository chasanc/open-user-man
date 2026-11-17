import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const requiredKeys = [
  'NEXT_PUBLIC_API_URL',
  'API_INTERNAL_URL',
  'NEXT_PUBLIC_DEFAULT_LOCALE',
  'NEXT_PUBLIC_DEFAULT_APP_NAME',
  'NEXT_PUBLIC_MULTI_COMPANY_MODE',
  'NEXT_PUBLIC_HOME_TITLE',
] as const;

function findRepoRoot(start: string): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Cannot find the repo root from ${start} to load .env`);
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

export function webEnv(): Record<string, string> {
  if (cached) return cached;
  const starts = [process.cwd()];
  try {
    starts.unshift(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // next.config loaders may not expose import.meta.url
  }
  let root: string | undefined;
  for (const start of starts) {
    try {
      root = findRepoRoot(start);
      break;
    } catch {
      root = undefined;
    }
  }
  if (!root) {
    throw new Error('Cannot find the repo root to load .env');
  }
  const files = [resolve(root, '.env'), resolve(root, 'apps/web/.env')];
  const merged = readEnvFiles(files);
  const missing = requiredKeys.filter(
    (key) => !(key in merged) || merged[key].trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(
      `Missing required variables in ${files.join(' and ')}: ${missing.join(', ')}`,
    );
  }
  for (const [key, value] of Object.entries(merged)) {
    process.env[key] = value;
  }
  cached = merged;
  return merged;
}

webEnv();
