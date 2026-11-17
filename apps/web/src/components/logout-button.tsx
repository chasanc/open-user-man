'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';

export function LogoutButton({ className }: { className?: string }) {
  const t = useTranslations();
  const router = useRouter();

  async function onLogout() {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button type="button" onClick={onLogout} className={className}>
      {t('HEADER.LOGOUT')}
    </button>
  );
}
