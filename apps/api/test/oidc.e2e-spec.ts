// End to end against a live API on a SCRATCH database seeded with db/postgres (admin / changeme):
//   OIDC_E2E_BASE_URL=http://localhost:3001 PGHOST=... PGUSER=... PGPASSWORD=... PGDATABASE=... pnpm test:e2e
// (or OIDC_E2E_DATABASE_URL=postgresql://... instead of the PG* variables).
// The API needs OIDC_ISSUER=<base>/oidc, OIDC_COOKIE_KEYS, OIDC_SIGNING_KEY_PATH, TOTP_ENCRYPTION_KEY
// and LOGIN_RATE_LIMIT_MAX=0 (the spec signs in more than 10 times a minute from one address).
// It removes what it creates, but never point it at a database you keep.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { codeFor, stepAt } from '../src/application/totp.js';

const base = process.env.OIDC_E2E_BASE_URL;
// OIDC_E2E_DB=mssql runs the same spec against db/mssql on localhost:1433 (login oum/oum, MSSQL_SERVER/MSSQL_DATABASE to change).
const mssql = process.env.OIDC_E2E_DB === 'mssql';
const dbUrl = mssql ? 'mssql' : (process.env.OIDC_E2E_DATABASE_URL ?? process.env.PGDATABASE); // or PGHOST/PGUSER/PGPASSWORD/PGDATABASE

/** The few statements the spec needs, written for Postgres; the SQL Server wrapper rewrites them. */
function openDb() {
  if (!mssql) {
    const client = new pg.Client(process.env.OIDC_E2E_DATABASE_URL ? { connectionString: dbUrl } : {});
    return {
      connect: () => client.connect() as Promise<void>,
      end: () => client.end() as Promise<void>,
      query: (text: string, params: unknown[] = []) => client.query(text, params) as Promise<{ rows: Array<Record<string, number>> }>,
    };
  }
  let pool: { request(): { input(n: string, v: unknown): unknown; query(t: string): Promise<{ recordset: Array<Record<string, number>> }> } ; close(): Promise<void> };
  return {
    connect: async () => {
      const { default: sql } = await import('mssql');
      pool = (await sql.connect({
        server: process.env.MSSQL_SERVER ?? 'localhost',
        port: 1433,
        user: 'oum',
        password: 'oum',
        database: process.env.MSSQL_DATABASE ?? 'open_user_db',
        options: { trustServerCertificate: true, encrypt: true },
      })) as unknown as typeof pool;
    },
    end: () => pool.close(),
    query: async (text: string, params: unknown[] = []) => {
      const request = pool.request();
      params.forEach((value, i) => request.input(`p${i + 1}`, value));
      const rewritten = text
        .replace(/\$(\d+)/g, '@p$1')
        .replace(/"user"/g, '[user]')
        .replace(/\btrue\b/gi, '1')
        .replace(/\bfalse\b/gi, '0')
        .replace(/now\(\)/gi, 'SYSUTCDATETIME()')
        .replace(/count\(\*\)::int/g, 'count(*)')
        .replace(/payload::text ILIKE/g, 'payload LIKE');
      return { rows: (await request.query(rewritten)).recordset };
    },
  };
}
const COMPANY = '01930000-0000-7000-8000-000000000001';
const REDIRECT = 'http://localhost:9999/cb';
const LOGOUT = 'http://localhost:9999/bye';
const clientId = 'oum-e2e';
const clientSecret = randomBytes(24).toString('hex');
const password = randomBytes(12).toString('hex');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

function fromBase32(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A browser: keeps cookies between requests, never follows redirects on its own. */
class Browser {
  jar = new Map<string, string>();
  async call(url: string, init: RequestInit = {}) {
    const cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(url, { redirect: 'manual', ...init, headers: { cookie, ...init.headers } });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      this.jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  /** Follows redirects until the app's redirect URI or the sign-in page. */
  async follow(res: Response): Promise<string> {
    for (let i = 0; i < 10; i += 1) {
      const loc = res.headers.get('location');
      if (!loc) return '';
      const url = loc.startsWith('http') ? loc : new URL(loc, base).href;
      if (url.startsWith(REDIRECT) || url.includes('/interaction/')) return url;
      res = await this.call(url);
    }
    throw new Error('too many redirects');
  }
}

describe.skipIf(!base || !dbUrl)('OpenID Connect provider, two-step verification and revocation', () => {
  const issuer = `${base}/oidc`;
  const db = openDb();
  const users: string[] = [];
  let admin = '';
  const startedAt = new Date();

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: admin },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : {} };
  }

  async function makeUser(name: string): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO users."user" (id, company_id, user_key, username, first_name, last_name, email, password_hash, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'E2E','Tester',$5,$6,true,now(),now())`,
      [id, COMPANY, `KEY-${name}`, name, `${name}@example.test`, await argon2.hash(password)],
    );
    users.push(id);
    return id;
  }

  /** Starts an authorization request in a fresh browser and returns it with the sign-in page URL. */
  async function begin(browser = new Browser()) {
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT,
      scope: 'openid profile',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      state: 's',
    });
    const url = await browser.follow(await browser.call(`${issuer}/auth?${params}`));
    return { browser, verifier, url };
  }

  /** Posts the sign-in form; returns the status and, on success, the tokens. */
  async function signIn(username: string, extra: Record<string, string> = {}, pass = password) {
    const { browser, verifier, url } = await begin();
    const post = await browser.call(`${url}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ username, password: pass, ...extra }),
    });
    if (post.status !== 303 && post.status !== 302) return { status: post.status, html: await post.text() };
    const done = await browser.follow(post);
    const code = new URL(done).searchParams.get('code') ?? '';
    const res = await fetch(`${issuer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic },
      body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier }),
    });
    const tokens = await res.json();
    if (!tokens.id_token) throw new Error(`token endpoint ${res.status}: ${JSON.stringify(tokens)} (redirect ${done})`);
    return { status: post.status, browser, tokens, idClaims: JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()) };
  }

  const userinfo = (accessToken: string) => fetch(`${issuer}/me`, { headers: { authorization: `Bearer ${accessToken}` } });
  const refresh = (token: string) =>
    fetch(`${issuer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basic },
      body: form({ grant_type: 'refresh_token', refresh_token: token }),
    });

  beforeAll(async () => {
    await db.connect();
    await db.query(
      `INSERT INTO users.oidc_client (id, company_id, client_id, secret_hash, name, redirect_uris, post_logout_redirect_uris, token_scopes, grant_types, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'oum e2e',$5,$6,'["openid","profile","email","groups","permissions","offline_access"]','["authorization_code","refresh_token"]',true,now(),now())`,
      [randomUUID(), COMPANY, clientId, sha(clientSecret), JSON.stringify([REDIRECT]), JSON.stringify([LOGOUT])],
    );
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'changeme' }),
    });
    expect(login.status).toBe(200);
    admin = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  });

  afterAll(async () => {
    await db.query('UPDATE users.company SET require_mfa = false WHERE id = $1', [COMPANY]);
    await db.query(
      "DELETE FROM users.audit_log WHERE entity_type = 'company' AND entity_id = $1 AND created_date > $2 AND payload::text ILIKE '%requireMfa%'",
      [COMPANY, startedAt],
    );
    for (const id of users) {
      await db.query('DELETE FROM users.oidc_payload WHERE user_id = $1', [id]);
      await db.query('DELETE FROM users.user_totp WHERE user_id = $1', [id]);
      await db.query("DELETE FROM users.audit_log WHERE entity_id = $1", [id]).catch(() => undefined);
      await db.query('DELETE FROM users."user" WHERE id = $1', [id]);
    }
    await db.query("DELETE FROM users.oidc_payload WHERE model IN ('Session','Interaction','AuthorizationCode','Grant')");
    await db.query('DELETE FROM users.oidc_client WHERE client_id = $1', [clientId]);
    await db.end();
  });

  it('signs in with PKCE, refuses a wrong password and a wrong client secret', async () => {
    const id = await makeUser('e2e-plain');
    const bad = await signIn('e2e-plain', {}, 'not-the-password');
    expect(bad.status).toBe(401);
    const ok = await signIn('e2e-plain');
    expect(ok.idClaims.sub).toBe(id);
    expect(ok.idClaims.amr).toEqual(['pwd']);
    const me = await (await userinfo(ok.tokens.access_token)).json();
    expect(me.preferred_username).toBe('e2e-plain');
    expect(me).toMatchObject({ name: 'E2E Tester', given_name: 'E2E', family_name: 'Tester' });

    const { browser, url } = await begin();
    const post = await browser.call(`${url}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ username: 'e2e-plain', password }),
    });
    const code = new URL(await browser.follow(post)).searchParams.get('code') ?? '';
    const wrong = await fetch(`${issuer}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${clientId}:wrong`).toString('base64')}`,
      },
      body: form({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: 'x'.repeat(50) }),
    });
    expect(wrong.status).toBe(401);
  });

  it('ends tokens at once when the user is deactivated, and when the password changes', async () => {
    const id = await makeUser('e2e-revoke');
    const first = await signIn('e2e-revoke');
    expect((await userinfo(first.tokens.access_token)).status).toBe(200);
    expect((await api('PUT', `/v1/users/${id}/password`, { password: `${password}-new` })).status).toBe(204);
    expect((await userinfo(first.tokens.access_token)).status).toBe(401);
    expect((await refresh(first.tokens.refresh_token)).status).toBeGreaterThanOrEqual(400);

    const second = await signIn('e2e-revoke', {}, `${password}-new`);
    expect((await userinfo(second.tokens.access_token)).status).toBe(200);
    expect((await api('POST', `/v1/users/${id}/deactivate`)).status).toBe(204);
    expect((await userinfo(second.tokens.access_token)).status).toBe(401);
    expect((await refresh(second.tokens.refresh_token)).status).toBeGreaterThanOrEqual(400);
    const left = await db.query('SELECT count(*)::int AS n FROM users.oidc_payload WHERE user_id = $1', [id]);
    expect(left.rows[0].n).toBe(0);
  });

  it('asks for the code once enrolled, refuses replays and reuse, and a reset ends sessions', async () => {
    const id = await makeUser('e2e-mfa');
    const enrol = await api('POST', `/v1/users/${id}/mfa/enrol`);
    expect(enrol.status).toBe(200);
    const secret = fromBase32(enrol.json.secret);
    const confirm = await api('POST', `/v1/users/${id}/mfa/confirm`, { code: codeFor(secret, stepAt(Date.now())) });
    expect(confirm.status).toBe(200);
    const recovery: string[] = confirm.json.recoveryCodes;
    expect(recovery).toHaveLength(10);

    // The confirming code is spent; the next step's code is the one a user would type.
    expect((await signIn('e2e-mfa')).status).toBe(401);
    expect((await signIn('e2e-mfa', { code: '000000' })).status).toBe(401);
    expect((await signIn('e2e-mfa', { code: codeFor(secret, stepAt(Date.now())) })).status).toBe(401);
    const next = await signIn('e2e-mfa', { code: codeFor(secret, stepAt(Date.now()) + 1) });
    expect(next.idClaims.amr).toEqual(['pwd', 'otp']);
    expect((await signIn('e2e-mfa', { code: codeFor(secret, stepAt(Date.now()) + 1) })).status).toBe(401);

    const viaRecovery = await signIn('e2e-mfa', { code: recovery[0].toUpperCase() });
    expect(viaRecovery.idClaims.amr).toEqual(['pwd', 'otp']);
    expect((await signIn('e2e-mfa', { code: recovery[0] })).status).toBe(401);

    expect((await userinfo(next.tokens.access_token)).status).toBe(200);
    expect((await api('DELETE', `/v1/users/${id}/mfa`)).status).toBe(204);
    expect((await userinfo(next.tokens.access_token)).status).toBe(401);
    expect((await signIn('e2e-mfa')).idClaims.amr).toEqual(['pwd']);
  });

  it('lets a user set up two-step verification from the account page, password checked at each step', async () => {
    await makeUser('e2e-self');
    const post = (step: string, fields: Record<string, string>) =>
      fetch(`${issuer}/account/mfa/${step}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form(fields),
      });
    expect((await fetch(`${issuer}/account/mfa`)).status).toBe(200);
    expect((await post('enrol', { username: 'e2e-self', password: 'wrong' })).status).toBe(401);

    const enrol = await post('enrol', { username: 'e2e-self', password });
    expect(enrol.status).toBe(200);
    const html = await enrol.text();
    expect(html).toContain('<svg');
    const secret = fromBase32(/<code>([A-Z2-7]+)<\/code>/.exec(html)![1]);

    expect((await post('confirm', { username: 'e2e-self', password: 'wrong', code: codeFor(secret, stepAt(Date.now())) })).status).toBe(401);
    expect((await post('confirm', { username: 'e2e-self', password, code: '000000' })).status).toBe(400);
    const done = await post('confirm', { username: 'e2e-self', password, code: codeFor(secret, stepAt(Date.now())) });
    expect(done.status).toBe(200);
    expect(await done.text()).toContain('recovery codes');

    expect((await post('enrol', { username: 'e2e-self', password })).status).toBe(409);
    expect((await signIn('e2e-self')).status).toBe(401);
    expect((await signIn('e2e-self', { code: codeFor(secret, stepAt(Date.now()) + 1) })).idClaims.amr).toEqual(['pwd', 'otp']);
  });

  it('ends the session on logout: refresh fails and silent sign-in asks to log in again', async () => {
    await makeUser('e2e-logout');
    const s = await signIn('e2e-logout');
    if (!s.browser) throw new Error('sign-in failed');
    const silent = () =>
      s.browser.call(
        `${issuer}/auth?${new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: REDIRECT,
          scope: 'openid',
          code_challenge: createHash('sha256').update('v'.repeat(43)).digest('base64url'),
          code_challenge_method: 'S256',
          prompt: 'none',
        })}`,
      );
    expect(new URL((await silent()).headers.get('location') ?? '').searchParams.get('code')).toBeTruthy();

    const hint = new URLSearchParams({ id_token_hint: s.tokens.id_token, post_logout_redirect_uri: LOGOUT, state: 'bye' });
    const page = await s.browser.call(`${issuer}/session/end?${hint}`);
    expect(page.status).toBe(200);
    const xsrf = /name="xsrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? '';
    const done = await s.browser.call(`${issuer}/session/end/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form({ xsrf, logout: 'yes' }),
    });
    expect(done.headers.get('location')).toBe(`${LOGOUT}?state=bye`);

    expect((await refresh(s.tokens.refresh_token)).status).toBeGreaterThanOrEqual(400);
    expect(new URL((await silent()).headers.get('location') ?? '').searchParams.get('error')).toBe('login_required');
  });

  it('refuses users without two-step verification when the company requires it', async () => {
    await makeUser('e2e-required');
    expect((await api('PATCH', `/v1/companies/${COMPANY}`, { requireMfa: true })).status).toBe(200);
    const refused = await signIn('e2e-required');
    expect(refused.status).toBe(401);
    expect(refused.html).toContain('Two-step verification is required');
    expect((await api('PATCH', `/v1/companies/${COMPANY}`, { requireMfa: 'yes' })).status).toBe(400);
    expect((await api('PATCH', `/v1/companies/${COMPANY}`, { requireMfa: false })).status).toBe(200);
    expect((await signIn('e2e-required')).status).toBe(303);
  });
});
