'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ApiError, api } from '@/lib/api';

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const [userName, setUserName] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: userName, password }),
      });
      router.push('/');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t('LOGINS.FAILED'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-sm flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        {t('LOGINS.USERNAME')}
        <input
          name="userName"
          autoComplete="username"
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t('LOGINS.PASSWORD')}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          required
        />
      </label>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? t('LOGINS.PENDING') : t('LOGINS.LOGIN')}
      </button>
    </form>
  );
}
