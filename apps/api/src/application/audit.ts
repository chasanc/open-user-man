import { In, type DataSource, type EntityManager, type EntityTarget, type ObjectLiteral } from 'typeorm';
import { exists } from './errors.js';
import { AuditLogEntity } from '../infrastructure/database/entities/audit-log.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';

/** Who made a change. A ServiceCall already has this shape. */
export type AuditActor = { source: 'rest' | 'grpc'; actorUserId?: string };

export type AuditEntityType =
  | 'user'
  | 'user_group'
  | 'company'
  | 'scope'
  | 'permission'
  | 'grant'
  | 'user_group_member'
  | 'oidc_client';

export type AuditEntry = {
  entityType: AuditEntityType;
  entityId: string;
  /** null when the caller does not know it (link changes) */
  companyId?: string | null;
  eventType: string;
  payload: Record<string, unknown>;
};

export type HistoryEntryDto = {
  auditLogId: number;
  createdDate: string;
  eventType: string;
  changedBy: string | null;
  source: string;
  payload: Record<string, unknown>;
};

/**
 * Run `work` and write the audit entries it returns in the same transaction, so a change
 * is never saved without its audit row and an audit failure rolls the change back.
 * Inserts are never audited: return null (or nothing) when there is nothing to record.
 */
export async function runAudited(
  dataSource: DataSource,
  call: AuditActor,
  work: (manager: EntityManager) => Promise<AuditEntry | AuditEntry[] | null | void>,
): Promise<void> {
  try {
    await dataSource.transaction(async (manager) => {
      const result = await work(manager);
      const entries = result ? (Array.isArray(result) ? result : [result]) : [];
      for (const entry of entries) {
        await manager.getRepository(AuditLogEntity).save({
          companyId: entry.companyId ?? null,
          entityType: entry.entityType,
          entityId: entry.entityId,
          eventType: entry.eventType,
          actorUserId: call.actorUserId ?? null,
          source: call.source,
          payload: entry.payload,
          createdDate: new Date(),
        });
      }
    });
  } catch (error) {
    // Two writers can pass a pre-check together; the unique index is the final word.
    const code = (error as { code?: string; number?: number }).code;
    const number = (error as { number?: number }).number;
    if (code === '23505' || number === 2601 || number === 2627) {
      throw exists('That value is already in use');
    }
    throw error;
  }
}

function same(a: unknown, b: unknown): boolean {
  if (Buffer.isBuffer(a) || Buffer.isBuffer(b)) {
    return Buffer.compare(Buffer.from((a as Buffer) ?? []), Buffer.from((b as Buffer) ?? [])) === 0;
  }
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() === new Date(b as Date).getTime();
  }
  return (a ?? null) === (b ?? null);
}

function shown(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return value.length > 0 ? '(image)' : null;
  }
  return value ?? null;
}

/**
 * `{ before, after }` for the listed fields that differ, or null when nothing differs.
 * Only list fields that are safe to keep: never a password hash or salt.
 */
export function diffFields<T extends object>(
  before: T,
  after: T,
  keys: readonly (keyof T & string)[],
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const out = { before: {} as Record<string, unknown>, after: {} as Record<string, unknown> };
  let changed = false;
  for (const key of keys) {
    if (!same(before[key], after[key])) {
      out.before[key] = shown(before[key]);
      out.after[key] = shown(after[key]);
      changed = true;
    }
  }
  return changed ? out : null;
}

/** The listed fields of `row` as a plain object, for a delete entry's `before`. */
export function pickFields<T extends object>(row: T, keys: readonly (keyof T & string)[]) {
  return Object.fromEntries(keys.map((key) => [key, shown(row[key])])) as Record<string, unknown>;
}

/** Every column of `row` for a remove entry, so the history survives the row. Secrets are left out. */
export function snapshot(row: object): Record<string, unknown> {
  const secret = new Set(['passwordHash', 'secretHash']);
  return Object.fromEntries(
    Object.entries(row)
      .filter(([key]) => !secret.has(key))
      .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : shown(value)]),
  );
}

/**
 * Replace the links of one owner (for example the groups of a user) and audit what was
 * removed. A change that only adds links is an insert and writes no audit row.
 */
export async function replaceLinks(
  dataSource: DataSource,
  call: AuditActor,
  p: {
    target: EntityTarget<ObjectLiteral>;
    /** column property of the owner, for example { userId } */
    owner: Record<string, string>;
    /** column property of the linked side, for example 'userGroupId' */
    linkKey: string;
    ids: string[];
    keepOld: boolean;
    entry: { entityType: AuditEntityType; entityId: string; companyId?: string | null; eventType: string };
  },
): Promise<void> {
  await runAudited(dataSource, call, async (manager) => {
    const repo = manager.getRepository(p.target);
    const existing = await repo.find({ where: p.owner });
    const existingIds = existing.map((row) => String(row[p.linkKey]));
    if (!p.keepOld && existing.length > 0) {
      await repo.remove(existing);
    }
    const have = new Set(p.keepOld ? existingIds : []);
    const wanted = new Set(p.ids.filter(Boolean));
    for (const id of wanted) {
      if (!have.has(id)) {
        await repo.save({ ...p.owner, [p.linkKey]: id });
      }
    }
    const added = [...wanted].filter((id) => !existingIds.includes(id));
    const removed = p.keepOld ? [] : existingIds.filter((id) => !wanted.has(id));
    if (removed.length === 0) {
      return null;
    }
    return { ...p.entry, payload: { link: p.linkKey, added, removed } };
  });
}

/** Audit rows of one entity, newest first, with the actors' user names. */
export async function listAudit(
  dataSource: DataSource,
  entityType: AuditEntityType,
  entityId: string,
): Promise<HistoryEntryDto[]> {
  const rows = await dataSource.getRepository(AuditLogEntity).find({
    where: { entityType, entityId },
    order: { auditLogId: 'DESC' },
    take: 100,
  });
  const actorIds = [...new Set(rows.map((row) => row.actorUserId).filter((id) => id !== null))];
  const actors = actorIds.length
    ? await dataSource.getRepository(UserEntity).find({
        where: { id: In(actorIds) },
        select: { id: true, username: true },
      })
    : [];
  const names = new Map(actors.map((actor) => [actor.id, actor.username]));
  return rows.map((row) => ({
    auditLogId: Number(row.auditLogId),
    createdDate: row.createdDate.toISOString(),
    eventType: row.eventType,
    changedBy: row.actorUserId ? (names.get(row.actorUserId) ?? null) : null,
    source: row.source,
    payload: row.payload,
  }));
}
