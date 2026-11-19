import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { DataSource, IsNull } from 'typeorm';
import { AuthService } from '../../application/auth.service.js';
import { AppError } from '../../application/errors.js';
import { NIL_UUID } from '../../application/ids.js';
import { MfaService } from '../../application/mfa.service.js';
import { LoginRateLimiter } from '../../auth/login-rate-limiter.js';
import { CompanyEntity } from '../database/entities/company.entity.js';
import { escapeHtml, page, readForm, send } from './html.js';

type Deps = { auth: AuthService; mfa: MfaService; loginLimit: LoginRateLimiter; db: DataSource; base: string };

const ROUTE = /^\/account\/mfa(?:\/(enrol|confirm))?(?:\?.*)?$/;

const field = (label: string, name: string, attrs = '') =>
  `<label>${label}<input name="${name}" ${attrs}></label>`;

function identity(company: string, username: string, password: boolean): string {
  return (
    field('Company key (only if your username exists in more than one company)', 'company', `value="${escapeHtml(company)}"`) +
    field('Username', 'username', `value="${escapeHtml(username)}" autocomplete="username" required`) +
    (password ? field('Password', 'password', 'type="password" autocomplete="current-password" required') : '')
  );
}

const startPage = (base: string, company: string, username: string, error?: string) =>
  page(
    'Set up two-step verification',
    `${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<p>Sign in with your password to add an authenticator app to your account.</p>
<form method="post" action="${escapeHtml(base)}/account/mfa/enrol">${identity(company, username, true)}
<button type="submit">Continue</button></form>`,
  );

function confirmPage(base: string, company: string, username: string, setup?: { secret: string; qr: string }, error?: string) {
  return page(
    'Confirm the code',
    `${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
${
  setup
    ? `<p>Scan the QR code with an authenticator app, or type the key. It is shown only once.</p>
<div>${setup.qr}</div><p><code>${escapeHtml(setup.secret)}</code></p>`
    : '<p>Type the current code from the app you already added.</p>'
}
<form method="post" action="${escapeHtml(base)}/account/mfa/confirm">${identity(company, username, true)}
${field('Code from the app', 'code', 'autocomplete="one-time-code" inputmode="numeric" required autofocus')}
<button type="submit">Confirm</button></form>`,
  );
}

/**
 * Self-service enrolment for people who cannot use the admin UI. There is no session: every step asks for
 * the password again, so nothing is trusted from an earlier request and there is nothing to forge across sites.
 * Returns false when the request is not for this page.
 */
export async function handleAccountMfa(req: Request, res: Response, deps: Deps): Promise<boolean> {
  const match = ROUTE.exec(req.url);
  if (!match) return false;
  const step = match[1];
  const { base } = deps;
  if (req.method === 'GET' && !step) {
    send(res, 200, startPage(base, '', ''));
    return true;
  }
  if (req.method !== 'POST' || !step) {
    send(res, 405, page('Method not allowed', ''));
    return true;
  }

  const form = await readForm(req);
  const username = form.get('username') ?? '';
  const companyKey = form.get('company') ?? '';
  const retry = (status: number, error: string) =>
    send(res, status, step === 'enrol' ? startPage(base, companyKey, username, error) : confirmPage(base, companyKey, username, undefined, error));

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!deps.loginLimit.allow(ip, username)) {
    retry(429, 'Too many attempts. Try again later.');
    return true;
  }
  try {
    // A wrong company key must fail like a wrong password, so it maps to an id nothing can match.
    const company = companyKey
      ? await deps.db.getRepository(CompanyEntity).findOne({ where: { companyKey, active: true, deletedAt: IsNull() } })
      : null;
    const user = await deps.auth.authenticate(
      { username, password: form.get('password') ?? '', ...(companyKey ? { companyId: company?.id ?? NIL_UUID } : {}) },
      { source: 'rest' },
    );
    const call = { source: 'rest' as const, actorUserId: user.id };
    if (step === 'enrol') {
      const { secret, otpauthUrl } = await deps.mfa.enrol(user.id, call);
      const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 2 });
      const qr = svg.replace('<svg ', '<svg width="200" height="200" role="img" aria-label="QR code for the authenticator app" ');
      send(res, 200, confirmPage(base, companyKey, username, { secret, qr }));
    } else {
      const { recoveryCodes } = await deps.mfa.confirm(user.id, form.get('code') ?? '', call);
      send(
        res,
        200,
        page(
          'Two-step verification is on',
          `<p>Keep these recovery codes somewhere safe. They are shown only once and each works one time.</p>
<p><code>${recoveryCodes.map(escapeHtml).join('<br>')}</code></p>`,
        ),
      );
    }
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    // Only after the password was right can a message say more than "invalid".
    if (err.kind === 'unauthenticated') retry(401, 'Invalid username or password');
    else if (err.kind === 'invalid' || err.kind === 'failed_precondition') retry(err.kind === 'invalid' ? 400 : 409, err.message);
    else throw err;
  }
  return true;
}
