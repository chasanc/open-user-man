import { AppShell } from '@/components/app-shell';
import { ResourcePanel } from '@/components/resource-panel';
import { listOf, myCompanyId } from '@/lib/load';
import type { ScopeRow } from '@/lib/types';
import { getTranslations } from 'next-intl/server';

/** Parents first, children right under them, so the list reads as a tree. */
function inTreeOrder(rows: ScopeRow[]) {
  const children = new Map<string | undefined, ScopeRow[]>();
  for (const row of rows) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  const ordered: ScopeRow[] = [];
  const depth: Record<string, number> = {};
  const walk = (parent: string | undefined, level: number) => {
    for (const row of children.get(parent) ?? []) {
      depth[row.id] = level;
      ordered.push(row);
      walk(row.id, level + 1);
    }
  };
  walk(undefined, 0);
  return { ordered, depth };
}

export default async function ScopePage() {
  const t = await getTranslations();
  const [rows, companyId] = await Promise.all([listOf<ScopeRow>('scopes'), myCompanyId()]);
  const { ordered, depth } = inTreeOrder(rows);
  return (
    <AppShell title={t('SCOPE')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">{t('SCOPES.HINT')}</p>
      <ResourcePanel
        path="/api/v1/scopes"
        rows={ordered}
        indent={depth}
        historyType="scope"
        base={{ companyId }}
        columns={['name', 'reference', 'description', 'active']}
        fields={[
          { key: 'name', label: t('FIELDS.NAME'), required: true },
          {
            key: 'parentId',
            label: t('FIELDS.PARENT'),
            kind: 'select',
            options: ordered.map((s) => ({ value: s.id, label: `${'— '.repeat(depth[s.id])}${s.name}` })),
          },
          { key: 'reference', label: t('FIELDS.REFERENCE') },
          { key: 'description', label: t('FIELDS.DESCRIPTION') },
          { key: 'active', label: t('FIELDS.ACTIVE'), kind: 'checkbox' },
        ]}
      />
    </AppShell>
  );
}
