import type { DataSource, EntityTarget, ObjectLiteral } from 'typeorm';
import { runAudited, snapshot, type AuditActor, type AuditEntityType } from './audit.js';
import { precondition } from './errors.js';

/** The columns every deactivatable row has. */
export type LifecycleRow = { id: string; active: boolean; deletedAt: Date | null };

type Target = {
  entityType: AuditEntityType;
  /** the company the row belongs to (a company's own id for a company) */
  companyId: string;
  target: EntityTarget<ObjectLiteral>;
};

/**
 * Deactivate (hide, keep the row) or activate (bring it back). Doing either twice changes
 * nothing and writes no audit row.
 */
export async function setLive(db: DataSource, call: AuditActor, t: Target, row: LifecycleRow, live: boolean): Promise<void> {
  if (live === (row.deletedAt === null)) return;
  const patch = live
    ? { active: true, deletedAt: null, updatedAt: new Date() }
    : { active: false, deletedAt: new Date(), updatedAt: new Date() };
  await runAudited(db, call, async (manager) => {
    await manager.getRepository(t.target).update({ id: row.id }, patch);
    return {
      entityType: t.entityType,
      entityId: row.id,
      companyId: t.companyId,
      eventType: live ? 'activate' : 'deactivate',
      payload: {},
    };
  });
}

/**
 * Delete a deactivated row for good. Whatever still points at it blocks the removal (nothing is
 * deleted that was not asked for). The audit row keeps a full snapshot of what was deleted.
 * `dependents` maps a plural noun to how many rows of it still point at this one.
 */
export async function removeRow(
  db: DataSource,
  call: AuditActor,
  t: Target,
  row: LifecycleRow & ObjectLiteral,
  dependents: Record<string, number>,
): Promise<void> {
  if (row.deletedAt === null) throw precondition('Deactivate it first; only a deactivated entry can be removed permanently');
  const used = Object.entries(dependents).filter(([, count]) => count > 0);
  if (used.length > 0) {
    throw precondition(`It is still used by ${used.map(([what, count]) => `${count} ${what}`).join(', ')}; remove those first`);
  }
  await runAudited(db, call, async (manager) => {
    await manager.getRepository(t.target).delete({ id: row.id });
    return {
      entityType: t.entityType,
      entityId: row.id,
      companyId: t.companyId,
      eventType: 'remove',
      payload: { before: snapshot(row) },
    };
  });
}
