'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import { ResourcePanel } from '@/components/resource-panel';
import { secondaryClass } from '@/lib/ui';
import type { ApplicationRow } from '@/lib/types';

export function ApplicationsView({ rows, companyId }: { rows: ApplicationRow[]; companyId: string }) {
  const t = useTranslations();
  return (
    <ResourcePanel
      path="/api/v1/applications"
      rows={rows}
      historyType="oidc_client"
      base={{ companyId }}
      columns={['name', 'clientId']}
      fields={[
        { key: 'name', label: t('FIELDS.NAME'), required: true },
        { key: 'clientId', label: t('APPLICATIONS.CLIENT_ID_LABEL'), readOnly: true },
        { key: 'redirectUris', label: t('APPLICATIONS.REDIRECT_URIS'), kind: 'list', required: true },
        { key: 'postLogoutRedirectUris', label: t('APPLICATIONS.LOGOUT_URIS'), kind: 'list' },
        {
          key: 'tokenScopes',
          label: t('APPLICATIONS.SCOPES'),
          kind: 'list',
          initial: ['openid', 'profile', 'email'],
        },
        {
          key: 'grantTypes',
          label: t('APPLICATIONS.GRANTS'),
          kind: 'list',
          initial: ['authorization_code', 'refresh_token'],
        },
      ]}
      detail={(row) => <ApplicationExtras id={row.id} />}
    />
  );
}

/** Replaces an application's secret. The new one is shown once; the old one stops working at once. */
export function ApplicationExtras({ id }: { id: string }) {
  const t = useTranslations();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  async function rotate() {
    if (!window.confirm(t('APPLICATIONS.CONFIRM_ROTATE'))) return;
    setError('');
    try {
      const out = await api<{ clientSecret: string }>(`/api/v1/applications/${id}/rotate-secret`, { method: 'POST' });
      setSecret(out.clientSecret);
    } catch (cause) {
      setSecret('');
      setError(cause instanceof ApiError ? cause.message : t('ACTIONS.FAILED'));
    }
  }

  return (
    <section className="grid gap-2 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <button type="button" onClick={rotate} className={secondaryClass}>
          {t('APPLICATIONS.ROTATE')}
        </button>
      </div>
      {secret ? (
        <p role="status" className="font-mono break-all">
          {t('APPLICATIONS.SECRET_ONCE')} {secret}
        </p>
      ) : null}
      {error ? <p className="text-red-600">{error}</p> : null}
    </section>
  );
}
