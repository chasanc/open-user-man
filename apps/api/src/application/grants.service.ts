import { Injectable } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import type { Grant } from '@oum/proto';
import { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import { PermissionEntity } from '../infrastructure/database/entities/permission.entity.js';
import { ScopeEntity } from '../infrastructure/database/entities/scope.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { UserGroupEntity } from '../infrastructure/database/entities/user-group.entity.js';
import { runAudited } from './audit.js';
import { findPage, optionalUuid, Tenancy, uuidArg, type Page } from './common.js';
import { exists, invalid, notFound } from './errors.js';
import { uuidv7 } from './ids.js';
import { toGrant } from './mappers.js';
import type { ServiceCall } from './service-call.js';

export type CreateGrantInput = {
  userId?: string;
  groupId?: string;
  permissionId: string;
  scopeId?: string;
};

@Injectable()
export class GrantsService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(GrantEntity);
  }

  async create(input: CreateGrantInput, call: ServiceCall): Promise<Grant> {
    const userId = optionalUuid(input.userId, 'user_id');
    const groupId = optionalUuid(input.groupId, 'group_id');
    if ((userId === null) === (groupId === null)) {
      throw invalid('Set exactly one of user_id and group_id');
    }
    const permission = await this.db
      .getRepository(PermissionEntity)
      .findOne({ where: { id: uuidArg(input.permissionId, 'permission_id'), deletedAt: IsNull() } });
    if (!permission) throw notFound('Permission');
    this.tenancy.assertVisible(call, permission.companyId, 'Permission');

    const subject = userId
      ? await this.db.getRepository(UserEntity).findOne({ where: { id: userId, deletedAt: IsNull() } })
      : await this.db.getRepository(UserGroupEntity).findOne({ where: { id: groupId!, deletedAt: IsNull() } });
    if (!subject) throw notFound(userId ? 'User' : 'User group');
    if (subject.companyId !== permission.companyId) {
      throw invalid('The user or group and the permission belong to different companies');
    }

    const scopeId = optionalUuid(input.scopeId, 'scope_id');
    if (scopeId) {
      const scope = await this.db.getRepository(ScopeEntity).findOne({ where: { id: scopeId, deletedAt: IsNull() } });
      if (!scope) throw notFound('Scope');
      if (scope.companyId !== permission.companyId) throw invalid('The scope belongs to another company');
    }

    const duplicate = await this.repo.findOne({
      where: {
        userId: userId ?? IsNull(),
        groupId: groupId ?? IsNull(),
        permissionId: permission.id,
        scopeId: scopeId ?? IsNull(),
      },
    });
    if (duplicate) throw exists('That grant already exists');

    const row = this.repo.create({
      id: uuidv7(),
      userId,
      groupId,
      permissionId: permission.id,
      scopeId,
      createdAt: new Date(),
      createdBy: call.actorUserId ?? null,
    });
    // Inserts are not audited; the grant row carries created_at and created_by itself.
    await runAudited(this.db, call, (manager) => manager.getRepository(GrantEntity).insert(row).then(() => null));
    return toGrant(row, permission.name);
  }

  async delete(id: string, call: ServiceCall): Promise<void> {
    const row = await this.repo.findOne({ where: { id: uuidArg(id, 'id') } });
    if (!row) throw notFound('Grant');
    const permission = await this.db.getRepository(PermissionEntity).findOne({ where: { id: row.permissionId } });
    this.tenancy.assertVisible(call, permission?.companyId ?? '', 'Grant');
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(GrantEntity).delete({ id });
      return {
        entityType: 'grant',
        entityId: id,
        companyId: permission?.companyId ?? null,
        eventType: 'delete',
        payload: {
          before: {
            userId: row.userId,
            groupId: row.groupId,
            permissionId: row.permissionId,
            permission: permission?.name ?? null,
            scopeId: row.scopeId,
          },
        },
      };
    });
  }

  async list(
    request: {
      userId?: string;
      groupId?: string;
      permissionId?: string;
      scopeId?: string;
      pageSize?: number;
      pageToken?: string;
    },
    call: ServiceCall,
  ): Promise<Page<Grant>> {
    const companyId = this.tenancy.filter(call);
    // A grant belongs to the company of its permission.
    const permissionIds = companyId
      ? (await this.db.getRepository(PermissionEntity).find({ where: { companyId }, select: { id: true } })).map(
          (p) => p.id,
        )
      : undefined;
    const wantedPermission = optionalUuid(request.permissionId, 'permission_id');
    const where = {
      ...(request.userId ? { userId: uuidArg(request.userId, 'user_id') } : {}),
      ...(request.groupId ? { groupId: uuidArg(request.groupId, 'group_id') } : {}),
      ...(request.scopeId ? { scopeId: uuidArg(request.scopeId, 'scope_id') } : {}),
      ...(wantedPermission
        ? { permissionId: permissionIds && !permissionIds.includes(wantedPermission) ? In([]) : wantedPermission }
        : permissionIds
          ? { permissionId: In(permissionIds) }
          : {}),
    };
    const page = await findPage(this.repo, where, request);
    const permissions = page.items.length
      ? await this.db
          .getRepository(PermissionEntity)
          .find({ where: { id: In([...new Set(page.items.map((g) => g.permissionId))]) } })
      : [];
    const names = new Map(permissions.map((p) => [p.id, p.name]));
    return {
      items: page.items.map((grant) => toGrant(grant, names.get(grant.permissionId) ?? '')),
      nextPageToken: page.nextPageToken,
    };
  }
}
