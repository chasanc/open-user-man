import { AppShell } from '@/components/app-shell';
import { GroupsView } from '@/components/views';
import { listOf, myCompanyId, pickerCompanies } from '@/lib/load';
import type { GroupRow, PermissionRow, ScopeRow } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

export default async function UserGroupPage() {
  const t = await getTranslations();
  const [groups, permissions, scopes, companyId, companies] = await Promise.all([
    listOf<GroupRow>('groups'),
    listOf<PermissionRow>('permissions'),
    listOf<ScopeRow>('scopes'),
    myCompanyId(),
    pickerCompanies(),
  ]);
  return (
    <AppShell title={t('USERGROUP')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('USERGROUPS.HINT')}</p>
      <GroupsView groups={groups} permissions={permissions} scopes={scopes} companyId={companyId} companies={companies} />
    </AppShell>
  );
}
