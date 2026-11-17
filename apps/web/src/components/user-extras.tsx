'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';
import type { GroupRow, Page, UserRow } from '@/lib/types';
import { fieldClass, primaryClass } from '@/lib/ui';

/** Which groups a user is in, and a way to set the password. */
export function UserExtras({ userId, groups }: { userId: string; groups: GroupRow[] }) {
  const t = useTranslations();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<Page<GroupRow>>(`/api/v1/users/${userId}/groups`)
      .then((page) => setChosen(new Set(page.items.map((g) => g.id))))
      .catch(() => setChosen(new Set()));
  }, [userId]);

  async function attempt(work: () => Promise<void>, done: string) {
    setMessage('');
    try {
      await work();
      setMessage(done);
    } catch (cause) {
      setMessage(cause instanceof ApiError ? cause.message : t('ACTIONS.FAILED'));
    }
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(chosen);
    if (on) next.add(id);
    else next.delete(id);
    setChosen(next);
    void attempt(async () => {
      await api(`/api/v1/users/${userId}/groups`, { method: 'PUT', body: JSON.stringify({ groupIds: [...next] }) });
    }, '');
  }

  function setNewPassword(event: FormEvent) {
    event.preventDefault();
    void attempt(async () => {
      await api(`/api/v1/users/${userId}/password`, { method: 'PUT', body: JSON.stringify({ password }) });
      setPassword('');
    }, t('USERS.PASSWORD_SET'));
  }

  return (
    <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="mb-2 text-sm font-semibold">{t('USERS.GROUPS')}</h2>
        {groups.map((g) => (
          <label key={g.id} className="flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={chosen.has(g.id)} onChange={(e) => toggle(g.id, e.target.checked)} />
            {g.name}
          </label>
        ))}
      </div>
      <form onSubmit={setNewPassword} className="flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          {t('FIELDS.NEW_PASSWORD')}
          <input
            type="password"
            autoComplete="new-password"
            required
            className={fieldClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className={primaryClass}>
          {t('ACTIONS.SAVE')}
        </button>
      </form>
      {message ? <p className="text-sm sm:col-span-2">{message}</p> : null}
    </section>
  );
}

/** The users in a group. Membership is added from the user page. */
export function GroupMembers({ groupId }: { groupId: string }) {
  const t = useTranslations();
  const [members, setMembers] = useState<UserRow[]>([]);
  const load = () =>
    api<Page<UserRow>>(`/api/v1/groups/${groupId}/members?pageSize=200`)
      .then((page) => setMembers(page.items))
      .catch(() => setMembers([]));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="mb-2 text-sm font-semibold">{t('USERGROUPS.MEMBERS')}</h2>
      {members.length === 0 ? <p className="text-sm text-zinc-500">{t('USERGROUPS.NO_MEMBERS')}</p> : null}
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between py-1 text-sm">
          <span>
            {m.firstName} {m.lastName} ({m.username})
          </span>
          <button
            type="button"
            className="text-red-600"
            onClick={() => api(`/api/v1/groups/${groupId}/members/${m.id}`, { method: 'DELETE' }).then(load)}
          >
            {t('ACTIONS.REMOVE')}
          </button>
        </div>
      ))}
    </section>
  );
}
