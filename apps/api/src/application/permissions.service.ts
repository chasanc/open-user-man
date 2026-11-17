import { Injectable } from '@nestjs/common';
import { DataSource, ILike, IsNull } from 'typeorm';
import type { Permission } from '@oum/proto';
import { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import { PermissionEntity } from '../infrastructure/database/entities/permission.entity.js';
import { diffFields, runAudited } from './audit.js';
import { removeRow, setLive } from './lifecycle.js';
import {
  applyPatch,
  findPage,
  optionalText,
  requireCompany,
  Tenancy,
  uuidArg,
  type Page,
} from './common.js';
import { exists, invalid, notFound } from './errors.js';
import { uuidv7 } from './ids.js';
import { toPermission } from './mappers.js';
import type { ServiceCall } from './service-call.js';

const FIELDS = ['name', 'description'] as const;

export type PermissionPatch = Partial<Record<(typeof FIELDS)[number], unknown>>;

/** Dotted lower-case words, for example "invoice.approve". */
const NAME = /^[a-z0-9][a-z0-9_-]*(\.[a-z0-9][a-z0-9_-]*)*$/;

export function permissionName(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 100 || !NAME.test(value)) {
    throw invalid('name must be dotted lower-case words (a-z, 0-9, _ and -), at most 100 characters');
  }
  return value;
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(PermissionEntity);
  }

  async get(id: string, call: ServiceCall): Promise<Permission> {
    return toPermission(await this.find(id, call));
  }

  async list(
    request: { companyId?: string; query?: string; includeDeactivated?: boolean; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<Permission>> {
    const companyId = this.tenancy.filter(call, request.companyId);
    const base = {
      ...(request.includeDeactivated ? {} : { deletedAt: IsNull() }),
      ...(companyId ? { companyId: uuidArg(companyId, 'company_id') } : {}),
    };
    const q = request.query?.trim();
    const where = q ? { ...base, name: ILike(`%${q.replace(/[%_\\]/g, '\\$&')}%`) } : base;
    const page = await findPage(this.repo, where, request);
    return { items: page.items.map(toPermission), nextPageToken: page.nextPageToken };
  }

  async create(
    input: { companyId: string; name: string; description?: string },
    call: ServiceCall,
  ): Promise<Permission> {
    const company = await requireCompany(this.db, this.tenancy, call, input.companyId);
    const name = permissionName(input.name);
    await this.assertNameFree(company.id, name);
    const now = new Date();
    const row = this.repo.create({
      id: uuidv7(),
      companyId: company.id,
      name,
      description: optionalText(input.description, 'description'),
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAudited(this.db, call, (manager) => manager.getRepository(PermissionEntity).insert(row).then(() => null));
    return toPermission(row);
  }

  async update(id: string, patch: PermissionPatch, call: ServiceCall): Promise<Permission> {
    const row = await this.find(id, call);
    const before = Object.assign({}, row);
    applyPatch(row, patch, FIELDS);
    if (patch.name !== undefined) {
      row.name = permissionName(patch.name);
      if (row.name !== before.name) await this.assertNameFree(row.companyId, row.name);
    }
    if (patch.description !== undefined) row.description = optionalText(patch.description, 'description');
    row.updatedAt = new Date();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(PermissionEntity).save(row);
      const changes = diffFields(before, row, FIELDS);
      return (
        changes && {
          entityType: 'permission',
          entityId: id,
          companyId: row.companyId,
          eventType: 'update',
          payload: changes,
        }
      );
    });
    return toPermission(row);
  }

  /** A deactivated permission stops counting in Check; its grants stay. */
  async deactivate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await setLive(this.db, call, this.lifecycle(row), row, false);
  }

  /** Brings a deactivated permission back, unless another live one took its name meanwhile. */
  async activate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    if (row.deletedAt !== null) await this.assertNameFree(row.companyId, row.name);
    await setLive(this.db, call, this.lifecycle(row), row, true);
  }

  /** Permanent delete. Only a deactivated permission with no grants. */
  async remove(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await removeRow(this.db, call, this.lifecycle(row), row, {
      grants: await this.db.getRepository(GrantEntity).count({ where: { permissionId: id } }),
    });
  }

  private lifecycle(row: PermissionEntity) {
    return { entityType: 'permission' as const, companyId: row.companyId, target: PermissionEntity };
  }

  private async find(id: string, call: ServiceCall, includeDeactivated = false): Promise<PermissionEntity> {
    const row = await this.repo.findOne({
      where: { id: uuidArg(id, 'id'), ...(includeDeactivated ? {} : { deletedAt: IsNull() }) },
    });
    if (!row) throw notFound('Permission');
    this.tenancy.assertVisible(call, row.companyId, 'Permission');
    return row;
  }

  private async assertNameFree(companyId: string, name: string): Promise<void> {
    const taken = await this.repo.findOne({ where: { companyId, name, deletedAt: IsNull() } });
    if (taken) throw exists('A permission with this name already exists');
  }
}
