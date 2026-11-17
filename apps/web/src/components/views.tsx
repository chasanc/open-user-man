'use client';

import { useTranslations } from 'next-intl';
import type { GroupRow, PermissionRow, ScopeRow, UserRow } from '@/lib/types';
import { GrantsEditor } from '@/components/grants-editor';
import { ResourcePanel } from '@/components/resource-panel';
import { GroupMembers, UserExtras } from '@/components/user-extras';

type Lookups = { permissions: PermissionRow[]; scopes: ScopeRow[]; groups: GroupRow[]; companyId: string };

export function UsersView({ users, permissions, scopes, groups, companyId }: Lookups & { users: UserRow[] }) {
  const t = useTranslations('FIELDS');
  const groupNames = Object.fromEntries(groups.map((g) => [g.id, g.name]));
  return (
    <ResourcePanel
      path="/api/v1/users"
      rows={users}
      historyType="user"
      base={{ companyId }}
      columns={['username', 'firstName', 'lastName', 'email', 'active']}
      fields={[
        { key: 'username', label: t('USERNAME'), required: true },
        { key: 'firstName', label: t('FIRST_NAME'), required: true },
        { key: 'lastName', label: t('LAST_NAME'), required: true },
        { key: 'email', label: t('EMAIL') },
        { key: 'mobile', label: t('MOBILE') },
        { key: 'password', label: t('PASSWORD'), kind: 'password', required: true, createOnly: true },
        { key: 'active', label: t('ACTIVE'), kind: 'checkbox' },
      ]}
      detail={(row) => (
        <>
          <UserExtras userId={row.id} groups={groups} />
          <GrantsEditor subject={{ userId: row.id }} permissions={permissions} scopes={scopes} groupNames={groupNames} />
        </>
      )}
    />
  );
}

export function GroupsView({ groups, permissions, scopes, companyId }: Lookups) {
  const t = useTranslations('FIELDS');
  return (
    <ResourcePanel
      path="/api/v1/groups"
      rows={groups}
      historyType="user_group"
      base={{ companyId }}
      columns={['name', 'description', 'active']}
      fields={[
        { key: 'name', label: t('NAME'), required: true },
        { key: 'description', label: t('DESCRIPTION') },
        { key: 'active', label: t('ACTIVE'), kind: 'checkbox' },
      ]}
      detail={(row) => (
        <>
          <GroupMembers groupId={row.id} />
          <GrantsEditor subject={{ groupId: row.id }} permissions={permissions} scopes={scopes} groupNames={{}} />
        </>
      )}
    />
  );
}
