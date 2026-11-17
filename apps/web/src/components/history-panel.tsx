'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@/lib/api';

type Values = Record<string, string | number | boolean | null>;
type Payload = {
  before?: Values;
  after?: Values;
  added?: unknown[];
  removed?: unknown[];
  [key: string]: unknown;
};
type Entry = {
  auditLogId: number | string;
  createdDate: string;
  eventType: string;
  changedBy: string | null;
  source: string;
  payload: Payload | null;
};

/**
 * Audit log of the selected entity, newest first.
 * `fields` names the columns worth showing by label; `refresh` is any value
 * that changes after a save, so the list reloads.
 */
export function HistoryPanel({
  entityType,
  entityId,
  fields,
  refresh,
}: {
  entityType: string;
  entityId: number | string | null;
  fields: { key: string; label: string }[];
  refresh: unknown;
}) {
  const t = useTranslations('HISTORY');
  const locale = useLocale();
  const [loaded, setLoaded] = useState<{ url: string; entries: Entry[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const url =
    entityId === null
      ? null
      : `/api/v1/audit-log?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`;

  useEffect(() => {
    if (!url) {
      return;
    }
    let current = true;
    api<{ entries: Entry[] }>(url)
      .then((data) => {
        if (current) {
          setLoaded({ url, entries: data.entries ?? [] });
          setFailed(false);
        }
      })
      .catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [url, refresh]);

  // Rows loaded for another selection must not show under this one.
  const shown = url && loaded?.url === url ? loaded.entries : [];

  function eventLabel(type: string) {
    const labels: Record<string, string> = {
      create: t('CREATE'),
      update: t('UPDATE'),
      delete: t('DELETE'),
      deactivate: t('DEACTIVATE'),
      activate: t('ACTIVATE'),
      remove: t('REMOVE'),
      add_member: t('ADD_MEMBER'),
      remove_member: t('REMOVE_MEMBER'),
      set_password: t('SET_PASSWORD'),
      set_user_groups: t('SET_USER_GROUPS'),
    };
    return labels[type] ?? type;
  }

  function show(key: string, value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '∅';
    }
    return String(value);
  }

  function details(entry: Entry) {
    const payload = entry.payload;
    if (!payload) {
      return null;
    }
    const lines: string[] = [];
    const before = payload.before ?? {};
    const after = payload.after;
    for (const key of Object.keys(before)) {
      const label = fields.find((field) => field.key === key)?.label ?? key;
      lines.push(
        after
          ? `${label}: ${show(key, before[key])} → ${show(key, after[key])}`
          : `${label}: ${show(key, before[key])}`,
      );
    }
    if (payload.added?.length) {
      lines.push(`+ ${payload.added.join(', ')}`);
    }
    if (payload.removed?.length) {
      lines.push(`− ${payload.removed.join(', ')}`);
    }
    return lines.map((line) => <div key={line}>{line}</div>);
  }

  return (
    <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">
        {t('TITLE')}
      </h2>
      {!url ? (
        <p className="px-3 py-6 text-sm text-zinc-500">{t('SELECT')}</p>
      ) : failed ? (
        <p className="px-3 py-6 text-sm text-red-600">{t('FAILED')}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
            <tr>
              <th className="px-3 py-2 font-medium">{t('WHEN')}</th>
              <th className="px-3 py-2 font-medium">{t('BY')}</th>
              <th className="px-3 py-2 font-medium">{t('CHANGE')}</th>
              <th className="px-3 py-2 font-medium">{t('DETAILS')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((entry) => (
              <tr
                key={entry.auditLogId}
                className="border-b border-zinc-100 align-top dark:border-zinc-900"
              >
                <td className="whitespace-nowrap px-3 py-2">
                  {new Date(entry.createdDate).toLocaleString(locale)}
                </td>
                <td className="px-3 py-2">{entry.changedBy ?? t('UNKNOWN')}</td>
                <td className="px-3 py-2">{eventLabel(entry.eventType)}</td>
                <td className="px-3 py-2">{details(entry)}</td>
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={4}>
                  {t('EMPTY')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </section>
  );
}
