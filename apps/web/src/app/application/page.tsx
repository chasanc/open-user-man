import { AppShell } from '@/components/app-shell';
import { ApplicationsView } from '@/components/application-extras';
import { listOf, myCompanyId } from '@/lib/load';
import type { ApplicationRow } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

export default async function ApplicationPage() {
  const t = await getTranslations();
  const [rows, companyId] = await Promise.all([listOf<ApplicationRow>('applications'), myCompanyId()]);
  return (
    <AppShell title={t('APPLICATION')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('APPLICATIONS.HINT')}</p>
      <ApplicationsView rows={rows} companyId={companyId} />
    </AppShell>
  );
}
