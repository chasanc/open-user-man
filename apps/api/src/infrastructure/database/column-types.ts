import type { ColumnOptions } from 'typeorm';
import { parseDatabaseKind, type DatabaseKind } from '@oum/domain';

export function databaseKindFromEnv(): DatabaseKind {
  return parseDatabaseKind(process.env.DATABASE_KIND);
}

export function textColumn(extra: ColumnOptions = {}): ColumnOptions {
  const mssql = databaseKindFromEnv() === 'mssql';
  return {
    type: mssql ? 'nvarchar' : 'text',
    ...(mssql ? { length: 'max' } : {}),
    ...extra,
  };
}

export function varcharColumn(
  length: number,
  extra: ColumnOptions = {},
): ColumnOptions {
  const mssql = databaseKindFromEnv() === 'mssql';
  return {
    type: mssql ? 'nvarchar' : 'varchar',
    length,
    ...extra,
  };
}

export function boolColumn(extra: ColumnOptions = {}): ColumnOptions {
  return {
    type: databaseKindFromEnv() === 'mssql' ? 'bit' : 'boolean',
    ...extra,
  };
}

export function binaryColumn(extra: ColumnOptions = {}): ColumnOptions {
  const mssql = databaseKindFromEnv() === 'mssql';
  return {
    type: mssql ? 'varbinary' : 'bytea',
    ...(mssql ? { length: 'max' } : {}),
    ...extra,
  };
}

export function dateColumn(extra: ColumnOptions = {}): ColumnOptions {
  return {
    type: databaseKindFromEnv() === 'mssql' ? 'datetime2' : 'timestamptz',
    ...extra,
  };
}

/** SQL Server returns GUIDs in upper case; ids are lower-case strings everywhere in code. */
const lowerCase = {
  to: (value: unknown) => value,
  from: (value: unknown) => (typeof value === 'string' ? value.toLowerCase() : value),
};

// The result is used for both @Column and @PrimaryColumn; only the nullable flag differs.
type UuidColumn<T> = Omit<ColumnOptions, 'nullable'> &
  (T extends { nullable: true } ? { nullable: true } : { nullable?: undefined });

export function uuidColumn<T extends ColumnOptions = object>(extra: T = {} as T): UuidColumn<T> {
  return {
    type: databaseKindFromEnv() === 'mssql' ? 'uniqueidentifier' : 'uuid',
    transformer: lowerCase,
    ...extra,
  } as UuidColumn<T>;
}
