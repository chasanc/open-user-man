'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import { fieldClass, primaryClass, secondaryClass } from '@/lib/ui';

type Status = { enrolled: boolean; pending: boolean; recoveryCodesLeft: number };

/** Two-step verification of one user: set up together with them, confirm, or reset after a lost phone. */
export function MfaPanel({ userId }: { userId: string }) {
  const t = useTranslations();
  const [status, setStatus] = useState<Status | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setSetup(null);
    setCodes([]);
    api<Status>(`/api/v1/users/${userId}/mfa`)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [userId]);

  useEffect(() => {
    api<Status>(`/api/v1/users/${userId}/mfa`)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [userId]);

  async function run(work: () => Promise<void>) {
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('ACTIONS.FAILED'));
    }
  }

  const start = () =>
    run(async () => {
      const out = await api<{ secret: string; otpauthUrl: string }>(`/api/v1/users/${userId}/mfa/enrol`, { method: 'POST' });
      // Drawn in the browser: the secret never goes to a third-party QR service.
      const { default: QRCode } = await import('qrcode');
      setSetup({ ...out, qr: await QRCode.toDataURL(out.otpauthUrl, { margin: 2, width: 200 }) });
      setStatus({ enrolled: false, pending: true, recoveryCodesLeft: 0 });
    });

  function confirm(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const out = await api<{ recoveryCodes: string[] }>(`/api/v1/users/${userId}/mfa/confirm`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setSetup(null);
      setCode('');
      setCodes(out.recoveryCodes);
      setStatus({ enrolled: true, pending: false, recoveryCodesLeft: out.recoveryCodes.length });
    });
  }

  const reset = () =>
    run(async () => {
      if (!window.confirm(t('USERS.MFA_CONFIRM_RESET'))) return;
      await api(`/api/v1/users/${userId}/mfa`, { method: 'DELETE' });
      load();
    });

  if (!status) return null;
  const state = status.enrolled ? t('USERS.MFA_ON') : status.pending ? t('USERS.MFA_PENDING') : t('USERS.MFA_OFF');

  return (
    <section className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="font-semibold">
        {t('USERS.MFA')}: {state}
        {status.enrolled ? ` (${status.recoveryCodesLeft} ${t('USERS.MFA_CODES_LEFT')})` : ''}
      </h2>
      <div className="flex gap-2">
        {!status.enrolled ? (
          <button type="button" onClick={start} className={secondaryClass}>
            {t('USERS.MFA_START')}
          </button>
        ) : null}
        {status.enrolled || status.pending ? (
          <button type="button" onClick={reset} className={secondaryClass}>
            {t('USERS.MFA_RESET')}
          </button>
        ) : null}
      </div>
      {setup ? (
        <form onSubmit={confirm} className="grid gap-2">
          <p>{t('USERS.MFA_SECRET')}</p>
          <p className="font-mono break-all">{setup.secret}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing to optimise */}
          <img src={setup.qr} alt={t('USERS.MFA_QR')} width={200} height={200} className="rounded bg-white" />
          <label className="flex flex-col gap-1">
            {t('USERS.MFA_CODE')}
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className={fieldClass}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <div>
            <button type="submit" className={primaryClass}>
              {t('USERS.MFA_CONFIRM')}
            </button>
          </div>
        </form>
      ) : null}
      {codes.length > 0 ? (
        <div role="status">
          <p>{t('USERS.MFA_RECOVERY')}</p>
          <p className="font-mono">{codes.join('  ')}</p>
        </div>
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
