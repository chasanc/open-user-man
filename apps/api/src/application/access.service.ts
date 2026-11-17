import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import type { CheckResponse, Grant } from '@oum/proto';
import { databaseKindFromEnv } from '../infrastructure/database/column-types.js';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import { PermissionEntity } from '../infrastructure/database/entities/permission.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { UserGroupEntity } from '../infrastructure/database/entities/user-group.entity.js';
import { UserGroupMemberEntity } from '../infrastructure/database/entities/user-group-member.entity.js';
import { Tenancy } from './common.js';
import { invalid, notFound } from './errors.js';
import { isUuid } from './ids.js';
import { toGrant } from './mappers.js';
import type { ServiceCall } from './service-call.js';

export type CheckInput = { userId?: string; userKey?: string; permission: string; scopeId?: string };

// The scope and its active, not-deleted ancestors. The walk stops at an inactive or deleted
// scope, so disabling a scope also cuts off the grants that would flow down through it.
const CHAIN_POSTGRES = `
  WITH RECURSIVE chain(id, parent_id) AS (
    SELECT id, parent_id FROM users.scope
     WHERE id = $1 AND company_id = $2 AND active AND deleted_at IS NULL
    UNION
    SELECT s.id, s.parent_id FROM users.scope s JOIN chain c ON s.id = c.parent_id
     WHERE s.company_id = $2 AND s.active AND s.deleted_at IS NULL
  )
  SELECT id FROM chain`;

const CHAIN_MSSQL = `
  WITH chain(id, parent_id, depth) AS (
    SELECT id, parent_id, 0 FROM users.scope
     WHERE id = @0 AND company_id = @1 AND active = 1 AND deleted_at IS NULL
    UNION ALL
    SELECT s.id, s.parent_id, c.depth + 1 FROM users.scope s JOIN chain c ON s.id = c.parent_id
     WHERE s.company_id = @1 AND s.active = 1 AND s.deleted_at IS NULL
  )
  SELECT id, depth FROM chain ORDER BY depth OPTION (MAXRECURSION 1000)`;

@Injectable()
export class AccessService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  /** May this user have this permission at this scope? Unknown or inactive things answer "no". */
  async check(input: CheckInput, call: ServiceCall): Promise<CheckResponse> {
    const denied: CheckResponse = { allowed: false };
    if (!input.permission) throw invalid('permission is required');
    const user = await this.liveUser(input, call);
    if (!user) return denied;
    const permission = await this.db
      .getRepository(PermissionEntity)
      .findOne({ where: { companyId: user.companyId, name: input.permission, deletedAt: IsNull(), active: true } });
    if (!permission) return denied;

    let chain: string[] = [];
    if (input.scopeId) {
      if (!isUuid(input.scopeId)) throw invalid('scope_id must be a UUID');
      chain = await this.scopeChain(input.scopeId.toLowerCase(), user.companyId);
      if (chain.length === 0) return denied;
    }
    const grants = await this.grantsOf(user.id, { permissionId: permission.id });
    const best = pickBest(grants, chain);
    return best ? { allowed: true, matchedGrant: toGrant(best, permission.name) } : denied;
  }

  async batchCheck(inputs: CheckInput[], call: ServiceCall): Promise<CheckResponse[]> {
    if (inputs.length > 100) throw invalid('At most 100 checks per call');
    const results: CheckResponse[] = [];
    for (const input of inputs) {
      results.push(await this.check(input, call));
    }
    return results;
  }

  /** Every grant the user holds, directly and through active groups; optionally only those that apply at a scope. */
  async listGrantsForUser(
    input: { userId?: string; userKey?: string; scopeId?: string },
    call: ServiceCall,
  ): Promise<Grant[]> {
    const user = await this.liveUser(input, call);
    if (!user) throw notFound('User');
    let grants = await this.grantsOf(user.id, {});
    if (input.scopeId) {
      if (!isUuid(input.scopeId)) throw invalid('scope_id must be a UUID');
      const chain = new Set(await this.scopeChain(input.scopeId.toLowerCase(), user.companyId));
      grants = grants.filter((grant) => grant.scopeId === null || chain.has(grant.scopeId));
    }
    const names = await this.permissionNames(grants.map((grant) => grant.permissionId));
    return grants.map((grant) => toGrant(grant, names.get(grant.permissionId) ?? ''));
  }

  /** An active, not-deleted user of an active company. Anything else holds nothing. */
  private async liveUser(
    ref: { userId?: string; userKey?: string },
    call: ServiceCall,
  ): Promise<UserEntity | null> {
    if (ref.userId && !isUuid(ref.userId)) throw invalid('user_id must be a UUID');
    if (!ref.userId && !ref.userKey) throw invalid('user_id or user_key is required');
    const user = await this.db.getRepository(UserEntity).findOne({
      where: ref.userId
        ? { id: ref.userId.toLowerCase(), deletedAt: IsNull(), active: true }
        : { userKey: ref.userKey, deletedAt: IsNull(), active: true },
    });
    if (!user) return null;
    const confined = this.tenancy.confined(call);
    if (confined !== undefined && confined !== user.companyId) return null;
    const company = await this.db
      .getRepository(CompanyEntity)
      .findOne({ where: { id: user.companyId, deletedAt: IsNull(), active: true } });
    return company ? user : null;
  }

  /** The user's own grants plus those of every active group they belong to. */
  private async grantsOf(userId: string, filter: { permissionId?: string }): Promise<GrantEntity[]> {
    const memberships = await this.db.getRepository(UserGroupMemberEntity).find({ where: { userId } });
    const groups = memberships.length
      ? await this.db.getRepository(UserGroupEntity).find({
          where: { id: In(memberships.map((m) => m.groupId)), deletedAt: IsNull(), active: true },
          select: { id: true },
        })
      : [];
    const base = filter.permissionId ? { permissionId: filter.permissionId } : {};
    return this.db.getRepository(GrantEntity).find({
      where: [
        { ...base, userId },
        ...(groups.length ? [{ ...base, groupId: In(groups.map((g) => g.id)) }] : []),
      ],
      order: { id: 'ASC' },
    });
  }

  /** Scope ids from the scope up to the root, nearest first. Empty when the scope is unusable. */
  private async scopeChain(scopeId: string, companyId: string): Promise<string[]> {
    const mssql = databaseKindFromEnv() === 'mssql';
    const rows = (await this.db.query(mssql ? CHAIN_MSSQL : CHAIN_POSTGRES, [scopeId, companyId])) as {
      id: string;
    }[];
    return rows.map((row) => row.id.toLowerCase());
  }

  private async permissionNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db.getRepository(PermissionEntity).find({ where: { id: In([...new Set(ids)]) } });
    return new Map(rows.map((row) => [row.id, row.name]));
  }
}

/** Prefer a direct grant over a group grant, then the nearest scope, then company-wide. */
function pickBest(grants: GrantEntity[], chain: string[]): GrantEntity | undefined {
  const rank = (grant: GrantEntity): number => {
    if (grant.scopeId === null) return chain.length;
    return chain.indexOf(grant.scopeId);
  };
  return grants
    .filter((grant) => grant.scopeId === null || chain.includes(grant.scopeId))
    .sort(
      (a, b) =>
        Number(b.userId !== null) - Number(a.userId !== null) || rank(a) - rank(b) || a.id.localeCompare(b.id),
    )[0];
}
