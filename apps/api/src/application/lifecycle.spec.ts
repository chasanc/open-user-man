import type { DataSource } from 'typeorm';
import { snapshot } from './audit.js';
import { removeRow } from './lifecycle.js';

const call = { source: 'rest' as const };
const target = { entityType: 'scope' as const, companyId: 'c', target: class {} };
const noDb = null as unknown as DataSource; // the guards fire before the database is touched

describe('removeRow guards', () => {
  it('refuses a row that is still live', async () => {
    const row = { id: 'a', active: true, deletedAt: null };
    await expect(removeRow(noDb, call, target, row, {})).rejects.toThrow('Deactivate it first');
  });

  it('names what still points at the row', async () => {
    const row = { id: 'a', active: false, deletedAt: new Date() };
    await expect(removeRow(noDb, call, target, row, { grants: 2, 'child scopes': 0, members: 1 })).rejects.toThrow(
      '2 grants, 1 members',
    );
  });
});

describe('snapshot', () => {
  it('keeps every column but the password hash', () => {
    const at = new Date('2026-01-02T03:04:05Z');
    const out = snapshot({ id: 'a', name: 'x', passwordHash: 'secret', deletedAt: at, avatar: null });
    expect(out).toEqual({ id: 'a', name: 'x', deletedAt: at.toISOString(), avatar: null });
  });
});
