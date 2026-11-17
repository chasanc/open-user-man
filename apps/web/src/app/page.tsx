import { getTranslations } from 'next-intl/server';
import { AppShell } from '@/components/app-shell';

export default async function Home() {
  const t = await getTranslations();
  return (
    <AppShell title={t('PRODUCT')}>
      <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
        {t('HOMEPAGE.INTRO')}
      </p>
      <h2 className="mt-8 text-sm font-semibold">{t('HOMEPAGE.FEATURES')}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>{t('HOMEPAGE.FEATURE_USERS')}</li>
        <li>{t('HOMEPAGE.FEATURE_RIGHTS')}</li>
        <li>{t('HOMEPAGE.FEATURE_SCOPES')}</li>
        <li>{t('HOMEPAGE.FEATURE_OVERVIEW')}</li>
      </ul>
    </AppShell>
  );
}
