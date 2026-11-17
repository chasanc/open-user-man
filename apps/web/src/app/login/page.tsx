import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell';
import { LoginForm } from '@/components/login-form';

export default async function LoginPage() {
  const t = await getTranslations();
  return (
    <AppShell title={t('LOGIN')}>
      <p className="mb-6 max-w-md text-sm text-zinc-600 dark:text-zinc-400">
        {t('LOGINS.HINT')}
      </p>
      <LoginForm />
    </AppShell>
  );
}
