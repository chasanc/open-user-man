import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  And,
  type DataSource,
  type FindOperator,
  type FindOptionsWhere,
  type Repository,
  type ObjectLiteral,
  IsNull,
  MoreThan,
} from 'typeorm';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import { denied, invalid, notFound } from './errors.js';
import { isUuid, NIL_UUID } from './ids.js';
import { confinedCompany, type ServiceCall } from './service-call.js';

export type Page<T> = { items: T[]; nextPageToken: string };

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export function pageSize(requested?: number): number {
  if (!requested || requested < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(requested, MAX_PAGE_SIZE);
}

/** The page token is the id of the last row; ids are time-ordered UUID v7, so it is a keyset cursor. */
export function afterToken(token?: string): string | undefined {
  if (!token) return undefined;
  if (!isUuid(token)) throw invalid('page_token is not valid');
  return token;
}

/**
 * One page of rows ordered by id. Fetches one extra row to know whether another page exists.
 * `where` may be a list (OR) of conditions; the cursor is added to each.
 */
export async function findPage<T extends ObjectLiteral & { id: string }>(
  repo: Repository<T>,
  where: FindOptionsWhere<T> | FindOptionsWhere<T>[],
  request: { pageSize?: number; pageToken?: string },
): Promise<Page<T>> {
  const size = pageSize(request.pageSize);
  const after = afterToken(request.pageToken);
  const withCursor = (condition: FindOptionsWhere<T>) => {
    if (!after) return condition;
    const existing = (condition as { id?: FindOperator<string> }).id;
    return { ...condition, id: existing ? And(existing, MoreThan(after)) : MoreThan(after) } as FindOptionsWhere<T>;
  };
  const conditions = Array.isArray(where) ? where.map(withCursor) : withCursor(where);
  const rows = await repo.find({
    where: conditions,
    order: { id: 'ASC' } as never,
    take: size + 1,
  });
  const items = rows.slice(0, size);
  return { items, nextPageToken: rows.length > size ? items[items.length - 1].id : '' };
}

/** Apply only the keys present in `patch` (undefined means "not in the update"). */
export function applyPatch<T extends object, K extends keyof T>(
  target: T,
  patch: Partial<Record<K, unknown>>,
  keys: readonly K[],
): void {
  for (const key of keys) {
    if (patch[key] !== undefined) {
      (target as Record<K, unknown>)[key] = patch[key];
    }
  }
}

/** A malformed id would make the database throw; say it is invalid before asking. */
export function uuidArg(value: unknown, field: string): string {
  if (!isUuid(value)) throw invalid(`${field} must be a UUID`);
  return value.toLowerCase();
}

export function optionalUuid(value: unknown, field: string): string | null {
  return value == null || value === '' ? null : uuidArg(value, field);
}

export function requireText(value: unknown, field: string, max?: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalid(`${field} is required`);
  }
  if (max && value.length > max) {
    throw invalid(`${field} is longer than ${max} characters`);
  }
  return value.trim();
}

export function optionalText(value: unknown, field: string, max?: number): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw invalid(`${field} must be text`);
  if (max && value.length > max) throw invalid(`${field} is longer than ${max} characters`);
  return value;
}

/** The live company a new row will belong to; a confined caller can only use its own. */
export async function requireCompany(
  db: DataSource,
  tenancy: Tenancy,
  call: ServiceCall,
  companyId: unknown,
): Promise<CompanyEntity> {
  const id = uuidArg(companyId, 'company_id');
  const company = await db.getRepository(CompanyEntity).findOne({ where: { id, deletedAt: IsNull() } });
  if (!company) throw notFound('Company');
  const confined = tenancy.confined(call);
  if (confined !== undefined && confined !== id) {
    throw denied('The call is confined to another company');
  }
  return company;
}

/** Company confinement for gRPC callers in multi-company mode. REST and single-company calls are not confined. */
@Injectable()
export class Tenancy {
  constructor(private readonly config: ConfigService) {}

  confined(call: ServiceCall): string | undefined {
    return confinedCompany(this.config.getOrThrow<boolean>('multiCompanyMode'), call);
  }

  /** The company a list should be limited to: the confinement, else the requested one. */
  filter(call: ServiceCall, requested?: string | null): string | undefined {
    const confined = this.confined(call);
    if (confined === undefined) return requested || undefined;
    return !requested || requested === confined ? confined : NIL_UUID;
  }

  /** A row of another company does not exist for a confined caller. */
  assertVisible(call: ServiceCall, rowCompanyId: string, what: string): void {
    const confined = this.confined(call);
    if (confined !== undefined && confined !== rowCompanyId) {
      throw notFound(what);
    }
  }
}
