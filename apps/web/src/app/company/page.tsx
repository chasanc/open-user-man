import { notFound } from 'next/navigation';
import { AppShell, multiCompany } from '@/components/app-shell';
import { ResourcePanel } from '@/components/resource-panel';
import { listOf } from '@/lib/load';
import type { CompanyRow } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

export default async function CompanyPage() {
  if (!multiCompany()) notFound();
  const t = await getTranslations();
  const rows = await listOf<CompanyRow>('companies');
  return (
    <AppShell title={t('COMPANY')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('COMPANIES.HINT')}</p>
      <ResourcePanel
        path="/api/v1/companies"
        rows={rows}
        historyType="company"
        columns={['name', 'companyKey', 'email', 'active']}
        fields={[
          { key: 'name', label: t('FIELDS.NAME'), required: true },
          { key: 'email', label: t('FIELDS.EMAIL') },
          { key: 'contactPerson', label: t('FIELDS.CONTACT') },
          { key: 'contactPhone', label: t('FIELDS.PHONE') },
          { key: 'active', label: t('FIELDS.ACTIVE'), kind: 'checkbox' },
          { key: 'requireMfa', label: t('FIELDS.REQUIRE_MFA'), kind: 'checkbox' },
        ]}
      />
    </AppShell>
  );
}
