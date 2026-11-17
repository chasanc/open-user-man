import '../../config/env.js';
import { DataSource } from 'typeorm';
import { parseDatabaseKind } from '@oum/domain';
import { typeOrmEntities } from './entities/index.js';
import { createTypeOrmOptions } from './typeorm.options.js';

const expected = [
  'users.audit_log',
  'users.company',
  'users.grant',
  'users.permission',
  'users.scope',
  'users.user',
  'users.user_group',
  'users.user_group_member',
] as const;

async function scaffold(): Promise<void> {
  const kind = parseDatabaseKind(process.env.DATABASE_KIND);
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for pnpm db:scaffold');
  }

  const nestOptions = createTypeOrmOptions({ kind, url });
  const dataSource = new DataSource({
    type: kind,
    url,
    entities: [...typeOrmEntities],
    synchronize: false,
    extra: nestOptions.extra,
  });

  await dataSource.initialize();
  try {
    const rows = (await dataSource.query(
      `SELECT table_schema AS schema, table_name AS name
       FROM information_schema.tables
       WHERE table_schema IN ('users')
         AND table_type = 'BASE TABLE'
       ORDER BY table_schema, table_name`,
    )) as Array<{ schema: string; name: string }>;

    const found = rows.map((row) => `${row.schema}.${row.name}`);
    const missing = expected.filter((name) => !found.includes(name));
    const extra = found.filter(
      (name) => !expected.includes(name as (typeof expected)[number]),
    );

    if (missing.length > 0 || extra.length > 0) {
      throw new Error(
        `Schema drift vs TypeORM entities. missing=${missing.join(',')} extra=${extra.join(',')}`,
      );
    }

    console.log(
      `db:scaffold ok (${kind}): ${found.length} tables match entities.`,
    );
    console.log(
      'Entities are committed mirrors of db/postgres and db/mssql. Do not overwrite services.',
    );
  } finally {
    await dataSource.destroy();
  }
}

await scaffold();
