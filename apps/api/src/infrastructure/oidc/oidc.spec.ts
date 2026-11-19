import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { checked } from '../../application/oidc-clients.service.js';
import { clientPayload, createOidcAdapterClass, revokeOidc } from './oidc-adapter.js';
import { accountClaims, createOidcProvider } from './oidc-provider.js';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Just enough of a TypeORM repository for the adapter: rows keyed by model and id. */
function fakeDb(clients: Row[] = []) {
  const rows: Row[] = [];
  const match = (row: Row, where: Row) => Object.entries(where).every(([key, value]) => row[key] === value);
  const payloadRepo = {
    create: (row: Row) => row,
    save: async (row: Row) => {
      const at = rows.findIndex((r) => r.model === row.model && r.id === row.id);
      if (at >= 0) rows[at] = row;
      else rows.push(row);
    },
    findOne: async ({ where }: { where: Row }) => rows.find((r) => match(r, where)) ?? null,
    delete: async (where: Row) => {
      for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i], where)) rows.splice(i, 1);
    },
    update: async (where: Row, patch: Row) => rows.filter((r) => match(r, where)).forEach((r) => Object.assign(r, patch)),
  };
  const clientRepo = { findOne: async ({ where }: { where: Row }) => clients.find((c) => c.clientId === where.clientId && c.active) ?? null };
  const db = { getRepository: (entity: { name: string }) => (entity.name === 'OidcClientEntity' ? clientRepo : payloadRepo) };
  return { db: db as unknown as DataSource, rows };
}

describe('oidc storage adapter', () => {
  it('stores the account id only for models that belong to a user', async () => {
    const { db, rows } = fakeDb();
    const Adapter = createOidcAdapterClass(db);
    await new Adapter('AccessToken').upsert('t1', { accountId: 'u1', grantId: 'g1' }, 60);
    await new Adapter('Interaction').upsert('i1', { accountId: 'u1', uid: 'x' }, 60);
    expect(rows.find((r) => r.id === 't1')).toMatchObject({ userId: 'u1', grantId: 'g1' });
    expect(rows.find((r) => r.id === 'i1')).toMatchObject({ userId: null, uid: 'x' });
  });

  it('treats an expired row as missing and reports a consumed one with its time', async () => {
    const { db, rows } = fakeDb();
    const Adapter = createOidcAdapterClass(db);
    const code = new Adapter('AuthorizationCode');
    await code.upsert('c1', { accountId: 'u1' }, 60);
    expect(await code.find('c1')).toMatchObject({ accountId: 'u1' });
    await code.consume('c1');
    expect((await code.find('c1'))?.consumed).toBeTypeOf('number');
    rows[0].expiresAt = new Date(Date.now() - 1000);
    expect(await code.find('c1')).toBeUndefined();
  });

  it('revokes every object of a grant', async () => {
    const { db, rows } = fakeDb();
    const Adapter = createOidcAdapterClass(db);
    await new Adapter('AccessToken').upsert('a', { accountId: 'u1', grantId: 'g1' }, 60);
    await new Adapter('RefreshToken').upsert('r', { accountId: 'u1', grantId: 'g1' }, 60);
    await new Adapter('RefreshToken').upsert('other', { accountId: 'u2', grantId: 'g2' }, 60);
    await new Adapter('Grant').revokeByGrantId('g1');
    expect(rows.map((r) => r.id)).toEqual(['other']);
  });

  it('serves a client only while it is active, with its secret hash and scopes', async () => {
    const row = {
      clientId: 'app', active: true, secretHash: 'abc', name: 'App', redirectUris: ['https://a/cb'],
      postLogoutRedirectUris: [], grantTypes: ['authorization_code'], tokenScopes: ['openid', 'email'],
    };
    const Adapter = createOidcAdapterClass(fakeDb([row]).db);
    expect(await new Adapter('Client').find('app')).toMatchObject({
      client_id: 'app', client_secret: 'abc', scope: 'openid email', token_endpoint_auth_method: 'client_secret_basic',
    });
    expect(await new (createOidcAdapterClass(fakeDb([{ ...row, active: false }]).db))('Client').find('app')).toBeUndefined();
    expect(clientPayload(row as never).response_types).toEqual(['code']);
  });
});

describe('revokeOidc', () => {
  function manager(userIds: string[]) {
    const deleted: Row[] = [];
    const manager = {
      getRepository: (entity: { name: string }) =>
        entity.name === 'UserEntity'
          ? { find: async () => userIds.map((id) => ({ id })) }
          : { delete: async (where: Row) => void deleted.push(where) },
    };
    return { manager: manager as unknown as EntityManager, deleted };
  }

  it('deletes by one user id, or by every user of a company', async () => {
    const one = manager([]);
    await revokeOidc(one.manager, { userId: 'u1' });
    expect(one.deleted[0].userId.value).toEqual(['u1']);
    const all = manager(['u1', 'u2']);
    await revokeOidc(all.manager, { companyId: 'c1' });
    expect(all.deleted[0].userId.value).toEqual(['u1', 'u2']);
  });

  it('does nothing for a company without users', async () => {
    const none = manager([]);
    await revokeOidc(none.manager, { companyId: 'c1' });
    expect(none.deleted).toHaveLength(0);
  });
});

describe('accountClaims', () => {
  const user = { id: 'u1', firstName: 'Ada', lastName: 'Lovelace', username: 'ada', userKey: 'K1', email: null };
  const company = { id: 'c1', companyKey: 'acme', name: 'Acme' };
  const never = async () => {
    throw new Error('looked up without the scope');
  };

  it('maps the profile and leaves groups and permissions unread unless granted', async () => {
    const claims = await accountClaims(user, company, 'openid profile', never, never);
    expect(claims).toEqual({
      sub: 'u1', name: 'Ada Lovelace', given_name: 'Ada', family_name: 'Lovelace', preferred_username: 'ada',
      user_key: 'K1', company: { id: 'c1', key: 'acme', name: 'Acme' },
    });
  });

  it('adds email when the user has one, and groups and permissions when granted', async () => {
    const claims = await accountClaims({ ...user, email: 'a@x.test' }, company, 'openid groups permissions', async () => ['g'], async () => [
      { permission: 'p', scope_id: null },
    ]);
    expect(claims).toMatchObject({ email: 'a@x.test', groups: ['g'], permissions: [{ permission: 'p', scope_id: null }] });
  });
});

describe('client confinement', () => {
  const base = { name: 'App', redirectUris: ['https://a.test/cb'], postLogoutRedirectUris: [], tokenScopes: ['openid'], grantTypes: ['authorization_code'] };

  it('accepts https, and http only on a local host', () => {
    expect(checked({ redirectUris: ['http://localhost:3000/cb', 'http://127.0.0.1/cb'] }, base).redirectUris).toHaveLength(2);
    expect(() => checked({ redirectUris: ['http://app.test/cb'] }, base)).toThrow('https');
    expect(() => checked({ redirectUris: ['https://a.test/cb#x'] }, base)).toThrow('fragment');
    expect(() => checked({ redirectUris: [] }, base)).toThrow('at least one');
  });

  it('refuses scopes and grants oum does not offer, and keeps openid and the code grant', () => {
    expect(() => checked({ tokenScopes: ['openid', 'admin'] }, base)).toThrow('cannot contain');
    expect(() => checked({ tokenScopes: ['email'] }, base)).toThrow('openid');
    expect(() => checked({ grantTypes: ['implicit'] }, base)).toThrow('cannot contain');
    expect(() => checked({ grantTypes: ['refresh_token'] }, base)).toThrow('authorization_code');
  });
});

describe('POST to the authorization endpoint', () => {
  const keyPath = join(mkdtempSync(join(tmpdir(), 'oum-key-')), 'key.json');
  writeFileSync(keyPath, JSON.stringify({ ...generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ format: 'jwk' }), kid: 't', use: 'sig', alg: 'ES256' }));

  async function status(issuer: string): Promise<number> {
    const provider = createOidcProvider(
      fakeDb().db,
      { issuer, cookieKeys: ['k'], signingKeyPath: keyPath, cookieSecure: false, trustProxy: true },
      async () => [],
    );
    const server = createServer(provider.callback());
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/auth`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-forwarded-proto': 'https' },
        body: 'client_id=none',
      });
      return res.status;
    } finally {
      server.close();
    }
  }

  it('is accepted for an https issuer and not routed for an http one', async () => {
    expect(await status('https://oum.test/oidc')).not.toBe(404);
    expect(await status('http://localhost:3001/oidc')).toBe(404);
  });
});
