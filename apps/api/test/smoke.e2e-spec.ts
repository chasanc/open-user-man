// Runs against a live API on a freshly seeded database: SMOKE_BASE_URL=http://localhost:3001 pnpm test:e2e
// It removes what it creates (deactivate, then remove permanently), but a failed run can leave rows
// behind, so still never point it at a database you keep.
const base = process.env.SMOKE_BASE_URL;

type Json = Record<string, any>;

async function call(method: string, path: string, body?: unknown, cookie = '') {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { res, json: (text ? JSON.parse(text) : {}) as Json };
}

describe.skipIf(!base)('HTTP smoke against a running API', () => {
  let cookie = '';
  let company = '';
  const made: string[] = [];
  const memberOf = { group: '', user: '' };

  const create = async (path: string, body: unknown) => {
    const { res, json } = await call('POST', `/v1${path}`, body, cookie);
    expect(res.status).toBe(201);
    made.unshift(`${path}/${json.id}`);
    return json.id as string;
  };

  beforeAll(async () => {
    const login = await call('POST', '/auth/login', { username: 'admin', password: 'changeme' });
    expect(login.res.status).toBe(200);
    cookie = (login.res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    company = login.json.companyId;
  });

  afterAll(async () => {
    // Newest first. Grants are deleted outright; everything else is deactivated, then removed for good.
    await call('DELETE', `/v1/groups/${memberOf.group}/members/${memberOf.user}`, undefined, cookie);
    for (const path of made) {
      if (!path.startsWith('/grants/')) await call('POST', `/v1${path}/deactivate`, undefined, cookie);
      await call('DELETE', `/v1${path}`, undefined, cookie);
    }
  });

  it('serves health', async () => {
    const { res, json } = await call('GET', '/health');
    expect(res.ok).toBe(true);
    expect(json.name).toBe('Open User Man');
  });

  it('rejects a wrong password and a missing token', async () => {
    expect((await call('POST', '/auth/login', { username: 'admin', password: 'no' })).res.status).toBe(401);
    expect((await call('GET', '/v1/users')).res.status).toBe(401);
  });

  it('answers Check through groups and the scope tree', async () => {
    const permission = await create('/permissions', { companyId: company, name: 'smoke.approve' });
    const hq = await create('/scopes', { companyId: company, name: 'HQ' });
    const branch = await create('/scopes', { companyId: company, name: 'Branch', parentId: hq });
    const desk = await create('/scopes', { companyId: company, name: 'Desk', parentId: branch });
    const user = await create('/users', {
      companyId: company, username: 'smoke-alice', firstName: 'A', lastName: 'A', password: 'correct horse',
    });
    const group = await create('/groups', { companyId: company, name: 'Smoke approvers' });
    await call('PUT', `/v1/groups/${group}/members/${user}`, undefined, cookie);
    Object.assign(memberOf, { group, user });
    const check = async (scopeId?: string) =>
      (await call('POST', '/v1/check', { userId: user, permission: 'smoke.approve', scopeId }, cookie)).json.allowed;

    expect(await check(desk)).toBe(false);
    await create('/grants', { groupId: group, permissionId: permission, scopeId: branch });
    expect(await check(desk)).toBe(true);
    expect(await check(branch)).toBe(true);
    expect(await check(hq)).toBe(false);
    expect(await check()).toBe(false);

    await call('PATCH', `/v1/scopes/${branch}`, { active: false }, cookie);
    expect(await check(desk)).toBe(false);
    await call('PATCH', `/v1/scopes/${branch}`, { active: true }, cookie);

    // a deactivated permission stops counting; activating it brings the grant back
    await call('POST', `/v1/permissions/${permission}/deactivate`, undefined, cookie);
    expect(await check(desk)).toBe(false);
    await call('POST', `/v1/permissions/${permission}/activate`, undefined, cookie);
    expect(await check(desk)).toBe(true);

    // removing needs a deactivated row
    expect((await call('DELETE', `/v1/scopes/${desk}`, undefined, cookie)).res.status).toBe(412);

    // a user without oum.admin signs in nowhere
    expect((await call('POST', '/auth/login', { username: 'smoke-alice', password: 'correct horse' })).res.status).toBe(403);
  });
});
