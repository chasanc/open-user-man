import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell';

export default async function AboutPage() {
  const t = await getTranslations();
  return (
    <AppShell title={t('ABOUT')}>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {t('ABOUT_PAGE.BODY')}
      </p>
    </AppShell>
  );
}
