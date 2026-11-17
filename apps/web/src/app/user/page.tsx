import { AppShell } from '@/components/app-shell';
import { UsersView } from '@/components/views';
import { listOf, myCompanyId } from '@/lib/load';
import type { GroupRow, PermissionRow, ScopeRow, UserRow } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

export default async function UserPage() {
  const t = await getTranslations();
  const [users, groups, permissions, scopes, companyId] = await Promise.all([
    listOf<UserRow>('users'),
    listOf<GroupRow>('groups'),
    listOf<PermissionRow>('permissions'),
    listOf<ScopeRow>('scopes'),
    myCompanyId(),
  ]);
  return (
    <AppShell title={t('USER')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('USERS.HINT')}</p>
      <UsersView users={users} groups={groups} permissions={permissions} scopes={scopes} companyId={companyId} />
    </AppShell>
  );
}
