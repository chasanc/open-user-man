'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import type { GrantRow, Page, PermissionRow, ScopeRow } from '@/lib/types';
import { fieldClass, primaryClass, secondaryClass } from '@/lib/ui';

/**
 * What a user or group holds. A user's list is the effective one (own grants plus their
 * groups'); only the user's own grants can be removed here.
 */
export function GrantsEditor({
  subject,
  permissions,
  scopes,
  groupNames,
}: {
  subject: { userId: string } | { groupId: string };
  permissions: PermissionRow[];
  scopes: ScopeRow[];
  groupNames: Record<string, string>;
}) {
  const t = useTranslations('GRANTS');
  const tActions = useTranslations('ACTIONS');
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [permissionId, setPermissionId] = useState('');
  const [scopeId, setScopeId] = useState('');
  const [error, setError] = useState('');

  const isUser = 'userId' in subject;
  const id = isUser ? subject.userId : subject.groupId;
  const listUrl = isUser ? `/api/v1/users/${id}/grants` : `/api/v1/grants?groupId=${id}&pageSize=200`;

  const load = useCallback(async () => {
    try {
      setGrants((await api<Page<GrantRow>>(listUrl)).items);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'error');
    }
  }, [listUrl]);

  useEffect(() => {
    let live = true;
    api<Page<GrantRow>>(listUrl)
      .then((page) => live && setGrants(page.items))
      .catch((cause) => live && setError(cause instanceof ApiError ? cause.message : 'error'));
    return () => {
      live = false;
    };
  }, [listUrl]);

  async function act(work: () => Promise<unknown>) {
    setError('');
    try {
      await work();
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'error');
    }
  }

  const add = (event: FormEvent) => {
    event.preventDefault();
    return act(() =>
      api('/api/v1/grants', {
        method: 'POST',
        body: JSON.stringify({ ...subject, permissionId, scopeId: scopeId || undefined }),
      }),
    );
  };

  const scopeName = (scope?: string) => (scope ? (scopes.find((s) => s.id === scope)?.name ?? scope) : t('COMPANY_WIDE'));

  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">{t('TITLE')}</h2>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
          <tr>
            <th className="px-3 py-2 font-medium">{t('PERMISSION')}</th>
            <th className="px-3 py-2 font-medium">{t('SCOPE')}</th>
            {isUser ? <th className="px-3 py-2 font-medium">{t('SOURCE')}</th> : null}
            <th />
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.id} className="border-b border-zinc-100 dark:border-zinc-900">
              <td className="px-3 py-2">{g.permissionName}</td>
              <td className="px-3 py-2">{scopeName(g.scopeId)}</td>
              {isUser ? (
                <td className="px-3 py-2">
                  {g.groupId ? `${t('GROUP')}: ${groupNames[g.groupId] ?? g.groupId}` : t('DIRECT')}
                </td>
              ) : null}
              <td className="px-3 py-2 text-right">
                {g.groupId && isUser ? null : (
                  <button type="button" className={secondaryClass} onClick={() => act(() => api(`/api/v1/grants/${g.id}`, { method: 'DELETE' }))}>
                    {tActions('REMOVE')}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {grants.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-zinc-500" colSpan={4}>
                {t('EMPTY')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <select required className={fieldClass} value={permissionId} onChange={(e) => setPermissionId(e.target.value)}>
          <option value="">{t('PICK_PERMISSION')}</option>
          {permissions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className={fieldClass} value={scopeId} onChange={(e) => setScopeId(e.target.value)}>
          <option value="">{t('COMPANY_WIDE')}</option>
          {scopes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="submit" className={primaryClass}>
          {t('ADD')}
        </button>
      </form>
      {error ? <p className="px-3 pb-3 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}
