import { describe, expect, it } from 'vitest';
import { AppError } from './errors.js';
import { isUuid, uuidv7 } from './ids.js';
import { permissionName } from './permissions.service.js';
import { maskedPatch, maskPaths, toWire } from '../grpc/grpc-support.js';

describe('uuidv7', () => {
  it('is a version 7 uuid', () => {
    const id = uuidv7();
    expect(isUuid(id)).toBe(true);
    expect(id[14]).toBe('7');
    expect('89ab').toContain(id[19]);
  });

  it('sorts by creation time', () => {
    expect(uuidv7(1_000) < uuidv7(2_000)).toBe(true);
  });

  it('rejects non-uuids', () => {
    expect(isUuid('nope')).toBe(false);
    expect(isUuid(7)).toBe(false);
  });
});

describe('permissionName', () => {
  it.each(['oum.admin', 'invoice.approve', 'a', 'x-y.z_1'])('accepts %s', (name) => {
    expect(permissionName(name)).toBe(name);
  });

  it.each(['', 'Bad Name', '.lead', 'trail.', 'a..b', 'UPPER'])('rejects %j', (name) => {
    expect(() => permissionName(name)).toThrow(AppError);
  });
});

describe('toWire', () => {
  it('turns dates into timestamps and drops undefined', () => {
    const out = toWire({ at: new Date(1_500), gone: undefined, nested: [{ at: new Date(2_000) }] });
    expect(out).toEqual({
      at: { seconds: 1, nanos: 500_000_000 },
      nested: [{ at: { seconds: 2, nanos: 0 } }],
    });
  });

  it('leaves buffers alone', () => {
    const avatar = Buffer.from([1, 2]);
    expect(toWire({ avatar }).avatar).toBe(avatar);
  });
});

describe('maskedPatch', () => {
  it('reads both mask shapes', () => {
    expect(maskPaths(['a'])).toEqual(['a']);
    expect(maskPaths({ paths: ['a'] })).toEqual(['a']);
    expect(maskPaths(undefined)).toEqual([]);
  });

  it('copies only masked fields, in camelCase', () => {
    const patch = maskedPatch({ firstName: 'A', lastName: 'B' }, { paths: ['first_name'] }, ['firstName', 'lastName']);
    expect(patch).toEqual({ firstName: 'A' });
  });

  it('treats a missing masked active as false', () => {
    expect(maskedPatch({}, ['active'], ['active'])).toEqual({ active: false });
  });

  it('rejects an empty mask and unknown fields', () => {
    expect(() => maskedPatch({}, [], ['name'])).toThrow(AppError);
    expect(() => maskedPatch({ id: 'x' }, ['id'], ['name'])).toThrow(AppError);
  });
});
