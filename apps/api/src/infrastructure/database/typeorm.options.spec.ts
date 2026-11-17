import { createTypeOrmOptions } from './typeorm.options.js';

describe('createTypeOrmOptions', () => {
  it('requires DATABASE_URL', () => {
    expect(() =>
      createTypeOrmOptions({ kind: 'postgres', url: '' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('disables synchronize', () => {
    const options = createTypeOrmOptions({
      kind: 'postgres',
      url: 'postgresql://oum:oum@localhost:5432/open_user_db',
    });
    expect(options.synchronize).toBe(false);
    expect(options.type).toBe('postgres');
  });

  it('applies the pool size and a postgres connect timeout', () => {
    const pg = createTypeOrmOptions({
      kind: 'postgres',
      url: 'postgresql://x',
      poolMax: 30,
      connectTimeoutMs: 4000,
    }) as { poolSize?: number; connectTimeoutMS?: number };
    expect(pg.poolSize).toBe(30);
    expect(pg.connectTimeoutMS).toBe(4000);
    const ms = createTypeOrmOptions({ kind: 'mssql', url: 'mssql://x', poolMax: 30 });
    expect((ms as { pool?: { max?: number } }).pool?.max).toBe(30);
  });
});
