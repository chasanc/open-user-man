'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import type { Page, Row } from '@/lib/types';
import { cardClass, fieldClass, primaryClass, secondaryClass } from '@/lib/ui';
import { HistoryPanel } from '@/components/history-panel';

export type Field = {
  key: string;
  label: string;
  /** `list` is one value per line; it is sent as a list of text. */
  kind?: 'text' | 'password' | 'checkbox' | 'select' | 'list';
  required?: boolean;
  /** Only asked when adding (a password; the company). */
  createOnly?: boolean;
  options?: { value: string; label: string }[];
  /** What a new entry starts with (a `select` that is `required` has no empty choice). */
  defaultValue?: string;
  /** Shown when editing, never sent, not asked when adding. */
  readOnly?: boolean;
  /** Lines a new `list` entry starts with. */
  initial?: string[];
};

type Values = Record<string, string | boolean>;

const initial = (fields: Field[], row?: Row): Values =>
  Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.kind === 'checkbox'
        ? row
          ? Boolean(row[f.key])
          : true
        : f.kind === 'list'
          ? ((row?.[f.key] as string[] | undefined) ?? f.initial ?? []).join('\n')
          : String((row?.[f.key] as string | undefined) ?? f.defaultValue ?? ''),
    ]),
  );

/** Empty text becomes "not set"; the API treats a missing field as unchanged on create. */
const toBody = (fields: Field[], values: Values, creating: boolean) =>
  Object.fromEntries(
    fields
      .filter((f) => !f.readOnly && (creating || !f.createOnly))
      .map((f) => [
        f.key,
        f.kind === 'list'
          ? String(values[f.key]).split(/\s+/).filter(Boolean)
          : f.kind === 'checkbox'
            ? values[f.key]
            : values[f.key] === ''
              ? null
              : values[f.key],
      ]),
  );

/**
 * One list and one card that adds or edits: all five admin resources share it.
 * `path` is the REST collection, e.g. /api/v1/users. `detail` renders under the list for the selected row.
 */
export function ResourcePanel({
  path,
  rows: first,
  fields,
  columns,
  base,
  detail,
  historyType,
  indent,
}: {
  path: string;
  rows: Row[];
  fields: Field[];
  columns: string[];
  /** Sent with every create, such as the company id. */
  base?: Record<string, unknown>;
  detail?: (row: Row) => ReactNode;
  historyType: string;
  /** Depth per row id, for tree-shaped lists. */
  indent?: Record<string, number>;
}) {
  const t = useTranslations();
  const [rows, setRows] = useState(first);
  // One card serves both: `selected` set = editing that row, adding = a new entry, neither = closed.
  const [selected, setSelected] = useState<Row | null>(null);
  const [adding, setAdding] = useState(false);
  const [values, setValues] = useState<Values>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [search, setSearch] = useState('');
  const [secret, setSecret] = useState<{ clientId: string; clientSecret: string } | null>(null);
  // Matches any shown column, so "ali" finds a username, a first name or an email.
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rows.filter((row) => columns.some((c) => String(row[c] ?? '').toLowerCase().includes(needle)))
    : rows;
  const card = useRef<HTMLFormElement>(null);
  const openId = adding ? 'new' : selected?.id;
  // The card opens below the list, so bring it into view when another row or Add is chosen.
  useEffect(() => {
    if (openId) card.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [openId]);
  const [showDeactivated, setShowDeactivated] = useState(false);
  // Ids of the listed rows that are deactivated (listed only when "show deactivated" is on).
  const [gone, setGone] = useState<Set<string>>(new Set());

  const label = (key: string) => fields.find((f) => f.key === key)?.label ?? key;

  /** The list answers only live rows; asking again with includeDeactivated shows which ones are not. */
  async function reload(all: boolean) {
    const live = await fetchAll(false);
    if (!all) {
      setRows(live);
      setGone(new Set());
      return;
    }
    const full = await fetchAll(true);
    const liveIds = new Set(live.map((row) => row.id));
    setRows(full);
    setGone(new Set(full.filter((row) => !liveIds.has(row.id)).map((row) => row.id)));
  }

  /** The API caps a page at 200 rows; follow the token so every record can be searched. */
  async function fetchAll(deactivated: boolean) {
    const items: Row[] = [];
    let token = '';
    do {
      const q = `pageSize=200${deactivated ? '&includeDeactivated=true' : ''}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
      const page = await api<Page<Row>>(`${path}?${q}`);
      items.push(...page.items);
      token = page.nextPageToken;
    } while (token);
    return items;
  }

  async function toggleDeactivated(next: boolean) {
    setShowDeactivated(next);
    await run(async () => {}, next);
  }

  async function run(work: () => Promise<void>, all = showDeactivated) {
    setError('');
    setBusy(true);
    try {
      await work();
      await reload(all);
      setVersion((v) => v + 1);
      return true;
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('ACTIONS.FAILED'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openAdd() {
    setError('');
    setSelected(null);
    setValues(initial(fields));
    setAdding(true);
  }

  function openEdit(row: Row) {
    setError('');
    setAdding(false);
    setSelected(row);
    setValues(initial(fields, row));
  }

  function close() {
    setAdding(false);
    setSelected(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (adding) {
      const ok = await run(async () => {
        const created = await api<Row>(path, {
          method: 'POST',
          body: JSON.stringify({ ...base, ...toBody(fields, values, true) }),
        });
        // An application is created together with its secret, which is shown this once.
        if (typeof created.clientSecret === 'string') {
          setSecret({ clientId: String(created.clientId), clientSecret: created.clientSecret });
        }
      });
      if (ok) close();
      return;
    }
    if (!selected) return;
    await run(async () => {
      const updated = await api<Row>(`${path}/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify(toBody(fields, values, false)),
      });
      setSelected(updated);
    });
  }

  /** deactivate and activate are POST .../:id/<verb>; remove is DELETE .../:id and needs a stronger confirm. */
  async function change(verb: 'deactivate' | 'activate' | 'remove') {
    if (!selected) return;
    if (verb === 'deactivate' && !window.confirm(t('ACTIONS.CONFIRM_DEACTIVATE'))) return;
    if (verb === 'remove' && !window.confirm(t('ACTIONS.CONFIRM_REMOVE'))) return;
    const ok = await run(async () => {
      await (verb === 'remove'
        ? api(`${path}/${selected.id}`, { method: 'DELETE' })
        : api(`${path}/${selected.id}/${verb}`, { method: 'POST' }));
    });
    if (ok) setSelected(null);
  }

  const isGone = Boolean(selected && gone.has(selected.id));

  function input(f: Field, values: Values, set: (v: Values) => void) {
    const value = values[f.key];
    const change = (next: string | boolean) => set({ ...values, [f.key]: next });
    return (
      <label key={f.key} className="flex flex-col gap-1 text-sm">
        {f.kind === 'checkbox' ? null : f.label}
        {f.kind === 'checkbox' ? (
          <span className="flex items-center gap-2 pt-6">
            <input type="checkbox" checked={Boolean(value)} onChange={(e) => change(e.target.checked)} />
            {f.label}
          </span>
        ) : f.kind === 'list' ? (
          <textarea
            className={fieldClass}
            rows={3}
            required={f.required}
            value={String(value)}
            onChange={(e) => change(e.target.value)}
          />
        ) : f.kind === 'select' ? (
          <select className={fieldClass} required={f.required} value={String(value)} onChange={(e) => change(e.target.value)}>
            {f.required ? null : <option value="">{t('ACTIONS.NONE')}</option>}
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={fieldClass}
            type={f.kind === 'password' ? 'password' : 'text'}
            autoComplete={f.kind === 'password' ? 'new-password' : 'off'}
            required={f.required}
            readOnly={f.readOnly}
            value={String(value)}
            onChange={(e) => change(e.target.value)}
          />
        )}
      </label>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-4">
        {adding || selected ? null : (
          <button type="button" onClick={openAdd} className={primaryClass}>
            {t('ACTIONS.ADD')}
          </button>
        )}
        <input
          type="search"
          className={`${fieldClass} max-w-xs`}
          placeholder={t('ACTIONS.SEARCH')}
          aria-label={t('ACTIONS.SEARCH')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showDeactivated}
            disabled={busy}
            onChange={(e) => toggleDeactivated(e.target.checked)}
          />
          {t('ACTIONS.SHOW_DEACTIVATED')}
        </label>
      </div>

      {/* About 10 rows show; the rest scrolls inside the list. */}
      <section className="max-h-[26rem] overflow-auto rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 font-medium">
                  {label(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={() => openEdit(row)}
                className={`cursor-pointer border-b border-zinc-100 dark:border-zinc-900 ${
                  selected?.id === row.id ? 'bg-zinc-100 dark:bg-zinc-900' : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                } ${row.active === false ? 'text-zinc-400' : ''} ${gone.has(row.id) ? 'italic line-through' : ''}`}
              >
                {columns.map((c, i) => (
                  <td key={c} className="px-3 py-2" style={i === 0 ? { paddingLeft: 12 + (indent?.[row.id] ?? 0) * 16 } : undefined}>
                    {typeof row[c] === 'boolean'
                      ? row[c]
                        ? t('YES')
                        : t('NO')
                      : // A select column shows the option's name, not its id (the company).
                        (fields.find((f) => f.key === c)?.options?.find((o) => o.value === row[c])?.label ??
                        String(row[c] ?? ''))}
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={columns.length}>
                  {t('ACTIONS.EMPTY')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      {adding || selected ? (
        <form ref={card} onSubmit={submit} className={`${cardClass} border-2 border-blue-600 ring-4 ring-blue-600/15`}>
          <fieldset disabled={isGone} className="contents">
            {fields.filter((f) => (adding ? !f.readOnly : !f.createOnly)).map((f) => input(f, values, setValues))}
          </fieldset>
          <div className="flex items-end gap-2">
            {adding ? (
              <button type="submit" disabled={busy} className={primaryClass}>
                {t('ACTIONS.ADD')}
              </button>
            ) : isGone ? (
              <>
                <button type="button" onClick={() => change('activate')} disabled={busy} className={primaryClass}>
                  {t('ACTIONS.ACTIVATE')}
                </button>
                <button type="button" onClick={() => change('remove')} disabled={busy} className={secondaryClass}>
                  {t('ACTIONS.REMOVE_PERMANENTLY')}
                </button>
              </>
            ) : (
              <>
                <button type="submit" disabled={busy} className={primaryClass}>
                  {busy ? t('ACTIONS.SAVING') : t('ACTIONS.SAVE')}
                </button>
                <button type="button" onClick={() => change('deactivate')} disabled={busy} className={secondaryClass}>
                  {t('ACTIONS.DEACTIVATE')}
                </button>
              </>
            )}
            <button type="button" onClick={close} className={secondaryClass}>
              {t('ACTIONS.CANCEL')}
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {secret ? (
        <section role="status" className={`${cardClass} border-2 border-amber-500`}>
          <p className="text-sm font-medium">{t('APPLICATIONS.SECRET_ONCE')}</p>
          <p className="font-mono text-sm break-all">
            {t('APPLICATIONS.CLIENT_ID')}: {secret.clientId}
          </p>
          <p className="font-mono text-sm break-all">
            {t('APPLICATIONS.CLIENT_SECRET')}: {secret.clientSecret}
          </p>
          <button type="button" onClick={() => setSecret(null)} className={secondaryClass}>
            {t('APPLICATIONS.DONE')}
          </button>
        </section>
      ) : null}

      {selected ? (
        <>
          {detail?.(selected)}
          <HistoryPanel
            entityType={historyType}
            entityId={selected.id}
            fields={fields.map((f) => ({ key: f.key, label: f.label }))}
            refresh={version}
          />
        </>
      ) : null}
    </div>
  );
}
