import type { Field } from '@/components/resource-panel';
import type { CompanyRow } from '@/lib/types';

/**
 * The Company picker for an add form, and the list column that shows it. Empty with one company:
 * there is nothing to choose, and `base` already carries it. A company cannot be changed later.
 */
export function companyField(companies: CompanyRow[], companyId: string, label: string) {
  const many = companies.length > 1;
  const fields: Field[] = many
    ? [
        {
          key: 'companyId',
          label,
          kind: 'select',
          required: true,
          createOnly: true,
          defaultValue: companyId,
          options: companies.map((c) => ({ value: c.id, label: c.name })),
        },
      ]
    : [];
  return { fields, columns: many ? ['companyId'] : [] };
}
