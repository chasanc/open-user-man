import { AppShell } from '@/components/app-shell';
import { ResourcePanel } from '@/components/resource-panel';
import { companyField } from '@/lib/company-field';
import { listOf, myCompanyId, pickerCompanies } from '@/lib/load';
import type { PermissionRow } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

export default async function PermissionPage() {
  const t = await getTranslations();
  const [rows, companyId, companies] = await Promise.all([
    listOf<PermissionRow>('permissions'),
    myCompanyId(),
    pickerCompanies(),
  ]);
  const company = companyField(companies, companyId, t('FIELDS.COMPANY_FIELD'));
  return (
    <AppShell title={t('PERMISSION')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('PERMISSIONS.HINT')}</p>
      <ResourcePanel
        path="/api/v1/permissions"
        rows={rows}
        historyType="permission"
        base={{ companyId }}
        columns={[...company.columns, 'name', 'description']}
        fields={[
          ...company.fields,
          { key: 'name', label: t('FIELDS.NAME'), required: true },
          { key: 'description', label: t('FIELDS.DESCRIPTION') },
        ]}
      />
    </AppShell>
  );
}
