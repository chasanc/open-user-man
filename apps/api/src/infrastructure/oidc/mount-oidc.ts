import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type Provider from 'oidc-provider';
import { DataSource, IsNull } from 'typeorm';
import { AccessService } from '../../application/access.service.js';
import { AuthService } from '../../application/auth.service.js';
import { AppError } from '../../application/errors.js';
import { MfaService } from '../../application/mfa.service.js';
import { LoginRateLimiter } from '../../auth/login-rate-limiter.js';
import { OidcClientEntity } from '../database/entities/oidc-client.entity.js';
import { handleAccountMfa } from './account-mfa.js';
import { escapeHtml, page, readForm, send } from './html.js';
import { purgeExpiredOidc } from './oidc-adapter.js';
import { createOidcProvider } from './oidc-provider.js';

const log = new Logger('Oidc');
const PURGE_EVERY_MS = 10 * 60 * 1000;

function loginForm(action: string, application: string, username: string, error?: string): string {
  return page(
    'Sign in',
    `<p>to continue to ${escapeHtml(application)}</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="${escapeHtml(action)}">
<label>Username<input name="username" value="${escapeHtml(username)}" autocomplete="username" required autofocus></label>
<label>Password<input name="password" type="password" autocomplete="current-password" required></label>
<label>Code (only if two-step verification is on)<input name="code" autocomplete="one-time-code" inputmode="numeric"></label>
<button type="submit">Sign in</button></form>`,
  );
}

/**
 * Mounts the OpenID Connect provider at the issuer's path and serves its sign-in page next to it.
 * Does nothing unless OIDC_ISSUER is set. Call before Nest registers its body parsers and the
 * global rate limiter: the provider reads its own request bodies.
 */
export function mountOidc(app: INestApplication): void {
  const config = app.get(ConfigService);
  const issuer = config.get<string>('oidcIssuer') ?? '';
  if (!issuer) return;
  const cookieKeys = config.getOrThrow<string[]>('oidcCookieKeys');
  const signingKeyPath = config.getOrThrow<string>('oidcSigningKeyPath');
  if (cookieKeys.length === 0 || !signingKeyPath) {
    throw new Error('OIDC_ISSUER is set, so OIDC_COOKIE_KEYS and OIDC_SIGNING_KEY_PATH are required');
  }

  const db = app.get(DataSource, { strict: false });
  const auth = app.get(AuthService, { strict: false });
  const loginLimit = app.get(LoginRateLimiter, { strict: false });
  const access = app.get(AccessService, { strict: false });
  const mfa = app.get(MfaService, { strict: false });
  const provider: Provider = createOidcProvider(
    db,
    {
      issuer,
      cookieKeys,
      signingKeyPath,
      cookieSecure: config.getOrThrow<boolean>('cookieSecure'),
      trustProxy: Boolean(config.getOrThrow('trustProxy')),
      pkceOptional: config.get<boolean>('oidcPkceOptional') === true,
    },
    // The same code behind ListGrantsForUser, so deactivated permissions and groups drop out.
    async (userId) =>
      (await access.listGrantsForUser({ userId }, { source: 'rest' })).map((grant) => ({
        permission: grant.permissionName,
        scope_id: grant.scopeId ?? null,
      })),
  );
  provider.on('server_error', (_ctx, err) => log.error(err.message, err.stack));

  const mountPath = new URL(issuer).pathname.replace(/\/$/, '') || '/';
  const callback = provider.callback();

  app.use(mountPath, async (req: Request, res: Response, next: (err?: unknown) => void) => {
    try {
      if (await handleAccountMfa(req, res, { auth, mfa, loginLimit, db, base: mountPath === '/' ? '' : mountPath })) return;
      const match = /^\/interaction\/([^/?]+)(\/login)?(?:\?.*)?$/.exec(req.url);
      if (!match) {
        // Guessing a client secret shows up as 401 invalid_client; only those count, so busy apps are not slowed.
        if (req.method === 'POST' && /^\/token(?:\?.*)?$/.test(req.url)) {
          const ip = req.ip || req.socket.remoteAddress || 'unknown';
          if (loginLimit.tokenBlocked(ip)) {
            res.statusCode = 429;
            res.setHeader('content-type', 'application/json');
            return res.end('{"error":"too_many_requests"}');
          }
          res.on('finish', () => {
            if (res.statusCode === 401) loginLimit.tokenFailed(ip);
          });
        }
        return callback(req, res);
      }
      const [, uid, isLogin] = match;
      const details = await provider.interactionDetails(req, res);
      if (details.uid === uid && details.prompt.name === 'consent' && details.session?.accountId) {
        // There is no consent screen. A client asking for offline_access must send prompt=consent (OIDC Core 11),
        // so approve what it asked for; the library has already checked those scopes against the client's own.
        const grant = details.grantId
          ? await provider.Grant.find(details.grantId)
          : new provider.Grant({ accountId: details.session.accountId, clientId: String(details.params.client_id) });
        if (!grant) return send(res, 400, page('Cannot sign in', '<p>This sign-in request is not valid. Start again from the application.</p>'));
        const missing = details.prompt.details.missingOIDCScope as string[] | undefined;
        if (missing?.length) grant.addOIDCScope(missing.join(' '));
        const grantId = await grant.save();
        return await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true });
      }
      if (details.uid !== uid || details.prompt.name !== 'login') {
        return send(res, 400, page('Cannot sign in', '<p>This sign-in request is not valid. Start again from the application.</p>'));
      }
      const clientId = typeof details.params.client_id === 'string' ? details.params.client_id : '';
      const client = await db
        .getRepository(OidcClientEntity)
        .findOne({ where: { clientId, active: true, deletedAt: IsNull() } });
      if (!client) return send(res, 400, page('Cannot sign in', '<p>Unknown application.</p>'));
      const action = `${mountPath === '/' ? '' : mountPath}/interaction/${uid}/login`;

      if (req.method === 'GET' && !isLogin) return send(res, 200, loginForm(action, client.name, ''));
      if (req.method !== 'POST' || !isLogin) return send(res, 405, page('Method not allowed', ''));

      const form = await readForm(req);
      const username = form.get('username') ?? '';
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      if (!loginLimit.allow(ip, username)) {
        return send(res, 429, loginForm(action, client.name, username, 'Too many attempts. Try again later.'));
      }
      let accountId: string;
      let amr: string[];
      try {
        // The application belongs to one company, so the sign-in is confined to that company.
        const user = await auth.authenticate(
          { username, password: form.get('password') ?? '', companyId: client.companyId },
          { source: 'rest' },
        );
        accountId = user.id;
        amr = await mfa.gate(user, form.get('code') ?? undefined);
      } catch (err) {
        if (!(err instanceof AppError) || (err.kind !== 'unauthenticated' && err.kind !== 'invalid')) throw err;
        // Only the two-step messages say more than "invalid"; the password was already right there.
        const shown = err.message.startsWith('Two-step') ? err.message : 'Invalid username or password';
        return send(res, 401, loginForm(action, client.name, username, shown));
      }
      await provider.interactionFinished(
        req,
        res,
        { login: { accountId, amr } },
        { mergeWithLastSubmission: false },
      );
    } catch (err) {
      next(err);
    }
  });

  const timer = setInterval(() => {
    purgeExpiredOidc(db).catch((err: Error) => log.warn(`Purging expired OIDC rows failed: ${err.message}`));
  }, PURGE_EVERY_MS);
  timer.unref();
  log.log(`OpenID Connect provider mounted at ${mountPath} (issuer ${issuer})`);
}
