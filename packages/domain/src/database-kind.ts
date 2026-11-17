export type DatabaseKind = 'postgres' | 'mssql';

export function parseDatabaseKind(value: string | undefined): DatabaseKind {
  if (value === 'postgres' || value === 'mssql') {
    return value;
  }
  throw new Error(
    `DATABASE_KIND must be postgres or mssql, got ${JSON.stringify(value)}`,
  );
}
