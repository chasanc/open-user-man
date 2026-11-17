import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import type { User, UserGroup } from '@oum/proto';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { UserGroupEntity } from '../infrastructure/database/entities/user-group.entity.js';
import { UserGroupMemberEntity } from '../infrastructure/database/entities/user-group-member.entity.js';
import { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import { diffFields, runAudited } from './audit.js';
import { removeRow, setLive } from './lifecycle.js';
import {
  applyPatch,
  findPage,
  optionalText,
  requireCompany,
  requireText,
  Tenancy,
  uuidArg,
  type Page,
} from './common.js';
import { exists, invalid, notFound } from './errors.js';
import { uuidv7 } from './ids.js';
import { toUser, toUserGroup } from './mappers.js';
import type { ServiceCall } from './service-call.js';

const FIELDS = ['name', 'description', 'avatar', 'active'] as const;

export type UserGroupPatch = Partial<Record<(typeof FIELDS)[number], unknown>>;

@Injectable()
export class UserGroupsService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(UserGroupEntity);
  }

  async get(id: string, call: ServiceCall): Promise<UserGroup> {
    return toUserGroup(await this.find(id, call));
  }

  async list(
    request: { companyId?: string; userId?: string; includeDeactivated?: boolean; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<UserGroup>> {
    const companyId = this.tenancy.filter(call, request.companyId);
    const where = {
      ...(request.includeDeactivated ? {} : { deletedAt: IsNull() }),
      ...(companyId ? { companyId: uuidArg(companyId, 'company_id') } : {}),
      ...(request.userId
        ? {
            id: In(
              (
                await this.db
                  .getRepository(UserGroupMemberEntity)
                  .find({ where: { userId: uuidArg(request.userId, 'user_id') } })
              ).map((member) => member.groupId),
            ),
          }
        : {}),
    };
    const page = await findPage(this.repo, where, request);
    return { items: page.items.map(toUserGroup), nextPageToken: page.nextPageToken };
  }

  async create(
    input: { companyId: string; name: string; description?: string; avatar?: Uint8Array },
    call: ServiceCall,
  ): Promise<UserGroup> {
    const company = await requireCompany(this.db, this.tenancy, call, input.companyId);
    const name = requireText(input.name, 'name', 200);
    await this.assertNameFree(company.id, name);
    const now = new Date();
    const row = this.repo.create({
      id: uuidv7(),
      companyId: company.id,
      name,
      description: optionalText(input.description, 'description'),
      avatar: input.avatar?.length ? Buffer.from(input.avatar) : null,
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAudited(this.db, call, (manager) => manager.getRepository(UserGroupEntity).insert(row).then(() => null));
    return toUserGroup(row);
  }

  async update(id: string, patch: UserGroupPatch, call: ServiceCall): Promise<UserGroup> {
    const row = await this.find(id, call);
    const before = Object.assign({}, row);
    applyPatch(row, patch, FIELDS);
    if (patch.name !== undefined) {
      row.name = requireText(patch.name, 'name', 200);
      if (row.name !== before.name) await this.assertNameFree(row.companyId, row.name);
    }
    if (patch.description !== undefined) row.description = optionalText(patch.description, 'description');
    if (patch.avatar !== undefined) {
      const avatar = patch.avatar as Uint8Array | null;
      row.avatar = avatar?.length ? Buffer.from(avatar) : null;
    }
    row.updatedAt = new Date();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(UserGroupEntity).save(row);
      const changes = diffFields(before, row, FIELDS);
      return (
        changes && {
          entityType: 'user_group',
          entityId: id,
          companyId: row.companyId,
          eventType: 'update',
          payload: changes,
        }
      );
    });
    return toUserGroup(row);
  }

  async deactivate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await setLive(this.db, call, this.lifecycle(row), row, false);
  }

  /** Brings a deactivated group back, unless another live group took its name meanwhile. */
  async activate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    if (row.deletedAt !== null) await this.assertNameFree(row.companyId, row.name);
    await setLive(this.db, call, this.lifecycle(row), row, true);
  }

  /** Permanent delete. Only a deactivated group with no members and no grants. */
  async remove(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await removeRow(this.db, call, this.lifecycle(row), row, {
      members: await this.db.getRepository(UserGroupMemberEntity).count({ where: { groupId: id } }),
      grants: await this.db.getRepository(GrantEntity).count({ where: { groupId: id } }),
    });
  }

  private lifecycle(row: UserGroupEntity) {
    return { entityType: 'user_group' as const, companyId: row.companyId, target: UserGroupEntity };
  }

  async addMember(groupId: string, userId: string, call: ServiceCall): Promise<void> {
    const group = await this.find(groupId, call);
    await this.requireMember(group, userId);
    const have = await this.db.getRepository(UserGroupMemberEntity).findOne({ where: { groupId, userId } });
    if (have) return; // adding twice is not an error and changes nothing
    // Adding a link is an insert, which is not audited.
    await this.db.getRepository(UserGroupMemberEntity).insert({ groupId, userId });
  }

  /** Works on a deactivated group too, so its members can be cleared before it is removed. */
  async removeMember(groupId: string, userId: string, call: ServiceCall): Promise<void> {
    const group = await this.find(groupId, call, true);
    uuidArg(userId, 'user_id');
    await runAudited(this.db, call, async (manager) => {
      const result = await manager.getRepository(UserGroupMemberEntity).delete({ groupId, userId });
      if (!result.affected) return null;
      return {
        entityType: 'user_group_member',
        entityId: groupId,
        companyId: group.companyId,
        eventType: 'remove_member',
        payload: { removed: [userId] },
      };
    });
  }

  async listMembers(
    request: { groupId: string; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<User>> {
    const group = await this.find(request.groupId, call);
    const ids = (await this.db.getRepository(UserGroupMemberEntity).find({ where: { groupId: group.id } })).map(
      (member) => member.userId,
    );
    const page = await findPage(this.db.getRepository(UserEntity), { id: In(ids), deletedAt: IsNull() }, request);
    return { items: page.items.map(toUser), nextPageToken: page.nextPageToken };
  }

  /** Replace the groups of one user with exactly `groupIds`. */
  async setUserGroups(userId: string, groupIds: string[], call: ServiceCall): Promise<UserGroup[]> {
    uuidArg(userId, 'user_id');
    // A deactivated user is accepted so its memberships can be cleared before it is removed.
    const user = await this.db.getRepository(UserEntity).findOne({ where: { id: userId } });
    if (!user) throw notFound('User');
    this.tenancy.assertVisible(call, user.companyId, 'User');
    const wanted = [...new Set(groupIds.map((id) => uuidArg(id, 'group_ids')))];
    const groups = wanted.length
      ? await this.repo.find({ where: { id: In(wanted), deletedAt: IsNull() } })
      : [];
    if (groups.length !== wanted.length) throw notFound('User group');
    if (groups.some((group) => group.companyId !== user.companyId)) {
      throw invalid('A user can only join groups of its own company');
    }
    await runAudited(this.db, call, async (manager) => {
      const repo = manager.getRepository(UserGroupMemberEntity);
      const existing = (await repo.find({ where: { userId } })).map((member) => member.groupId);
      const removed = existing.filter((id) => !wanted.includes(id));
      const added = wanted.filter((id) => !existing.includes(id));
      if (removed.length) await repo.delete({ userId, groupId: In(removed) });
      if (added.length) await repo.insert(added.map((groupId) => ({ userId, groupId })));
      if (!removed.length) return null; // only additions: inserts are not audited
      return {
        entityType: 'user_group_member',
        entityId: userId,
        companyId: user.companyId,
        eventType: 'set_user_groups',
        payload: { added, removed },
      };
    });
    return groups.map(toUserGroup);
  }

  private async requireMember(group: UserGroupEntity, userId: string): Promise<void> {
    const user = await this.db
      .getRepository(UserEntity)
      .findOne({ where: { id: uuidArg(userId, 'user_id'), deletedAt: IsNull() } });
    if (!user) throw notFound('User');
    if (user.companyId !== group.companyId) {
      throw invalid('A user can only join groups of its own company');
    }
  }

  private async find(id: string, call: ServiceCall, includeDeactivated = false): Promise<UserGroupEntity> {
    const row = await this.repo.findOne({
      where: { id: uuidArg(id, 'id'), ...(includeDeactivated ? {} : { deletedAt: IsNull() }) },
    });
    if (!row) throw notFound('User group');
    this.tenancy.assertVisible(call, row.companyId, 'User group');
    return row;
  }

  private async assertNameFree(companyId: string, name: string): Promise<void> {
    const taken = await this.repo.findOne({ where: { companyId, name, deletedAt: IsNull() } });
    if (taken) throw exists('A group with this name already exists');
  }
}
