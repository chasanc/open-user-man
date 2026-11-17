import { ADMIN_PERMISSION, parseDatabaseKind } from '@oum/domain';

describe('parseDatabaseKind', () => {
  it('accepts postgres and mssql', () => {
    expect(parseDatabaseKind('postgres')).toBe('postgres');
    expect(parseDatabaseKind('mssql')).toBe('mssql');
  });

  it('rejects unknown kinds', () => {
    expect(() => parseDatabaseKind('mysql')).toThrow(/DATABASE_KIND/);
    expect(() => parseDatabaseKind(undefined)).toThrow(/DATABASE_KIND/);
  });
});

describe('ADMIN_PERMISSION', () => {
  it('is the seeded admin permission name', () => {
    expect(ADMIN_PERMISSION).toBe('oum.admin');
  });
});
