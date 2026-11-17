import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRepoRoot, missingEnvKeys } from './load-env.js';

describe('missingEnvKeys', () => {
  it('reports keys that are absent or blank', () => {
    const missing = missingEnvKeys(
      { GRPC_API_KEY: '', HTTP_HOST: '  ' },
      ['GRPC_API_KEY', 'HTTP_HOST', 'JWT_SECRET'],
      new Set(['GRPC_API_KEY']),
    );
    expect(missing).toEqual(['HTTP_HOST', 'JWT_SECRET']);
  });
});

describe('findRepoRoot', () => {
  it('finds this workspace', () => {
    const root = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
    expect(root.endsWith('open-user-man')).toBe(true);
  });
});
