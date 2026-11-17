import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { Scope } from '@oum/proto';
import { ScopeEntity } from '../infrastructure/database/entities/scope.entity.js';
import { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import { diffFields, runAudited } from './audit.js';
import { removeRow, setLive } from './lifecycle.js';
import {
  applyPatch,
  findPage,
  optionalText,
  optionalUuid,
  requireCompany,
  requireText,
  Tenancy,
  uuidArg,
  type Page,
} from './common.js';
import { invalid, notFound, precondition } from './errors.js';
import { uuidv7 } from './ids.js';
import { toScope } from './mappers.js';
import type { ServiceCall } from './service-call.js';

const FIELDS = ['parentId', 'scopeKey', 'reference', 'name', 'description', 'active'] as const;

export type ScopePatch = Partial<Record<(typeof FIELDS)[number], unknown>>;

@Injectable()
export class ScopesService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(ScopeEntity);
  }

  async get(id: string, call: ServiceCall): Promise<Scope> {
    return toScope(await this.find(id, call));
  }

  async list(
    request: { companyId?: string; parentId?: string; includeDeactivated?: boolean; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<Scope>> {
    const companyId = this.tenancy.filter(call, request.companyId);
    const page = await findPage(
      this.repo,
      {
        ...(request.includeDeactivated ? {} : { deletedAt: IsNull() }),
        ...(companyId ? { companyId: uuidArg(companyId, 'company_id') } : {}),
        ...(request.parentId ? { parentId: uuidArg(request.parentId, 'parent_id') } : {}),
      },
      request,
    );
    return { items: page.items.map(toScope), nextPageToken: page.nextPageToken };
  }

  async create(
    input: {
      companyId: string;
      parentId?: string;
      scopeKey?: string;
      reference?: string;
      name: string;
      description?: string;
    },
    call: ServiceCall,
  ): Promise<Scope> {
    const company = await requireCompany(this.db, this.tenancy, call, input.companyId);
    const parentId = optionalUuid(input.parentId, 'parent_id');
    if (parentId) await this.requireParent(company.id, parentId);
    const now = new Date();
    const row = this.repo.create({
      id: uuidv7(),
      companyId: company.id,
      parentId,
      scopeKey: input.scopeKey || randomUUID(),
      reference: optionalText(input.reference, 'reference', 100),
      name: requireText(input.name, 'name'),
      description: optionalText(input.description, 'description'),
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAudited(this.db, call, (manager) => manager.getRepository(ScopeEntity).insert(row).then(() => null));
    return toScope(row);
  }

  async update(id: string, patch: ScopePatch, call: ServiceCall): Promise<Scope> {
    const row = await this.find(id, call);
    const before = Object.assign({}, row);
    applyPatch(row, patch, FIELDS);
    if (patch.parentId !== undefined) {
      row.parentId = optionalUuid(patch.parentId, 'parent_id');
      if (row.parentId) {
        await this.requireParent(row.companyId, row.parentId);
        await this.assertNoCycle(id, row.parentId);
      }
    }
    if (patch.name !== undefined) row.name = requireText(patch.name, 'name');
    if (patch.reference !== undefined) row.reference = optionalText(patch.reference, 'reference', 100);
    if (patch.description !== undefined) row.description = optionalText(patch.description, 'description');
    row.updatedAt = new Date();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(ScopeEntity).save(row);
      const changes = diffFields(before, row, FIELDS);
      return (
        changes && {
          entityType: 'scope',
          entityId: id,
          companyId: row.companyId,
          eventType: 'update',
          payload: changes,
        }
      );
    });
    return toScope(row);
  }

  async deactivate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    if (row.deletedAt === null) {
      const child = await this.repo.findOne({ where: { parentId: id, deletedAt: IsNull() } });
      if (child) throw precondition('The scope has children; deactivate or move them first');
    }
    await setLive(this.db, call, this.lifecycle(row), row, false);
  }

  /** Brings a deactivated scope back; its parent must be live. */
  async activate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    if (row.deletedAt !== null && row.parentId) await this.requireParent(row.companyId, row.parentId);
    await setLive(this.db, call, this.lifecycle(row), row, true);
  }

  /** Permanent delete. Only a deactivated scope with no children and no grants. */
  async remove(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await removeRow(this.db, call, this.lifecycle(row), row, {
      'child scopes': await this.repo.count({ where: { parentId: id } }),
      grants: await this.db.getRepository(GrantEntity).count({ where: { scopeId: id } }),
    });
  }

  private lifecycle(row: ScopeEntity) {
    return { entityType: 'scope' as const, companyId: row.companyId, target: ScopeEntity };
  }

  private async requireParent(companyId: string, parentId: string): Promise<void> {
    const parent = await this.repo.findOne({ where: { id: parentId, deletedAt: IsNull() } });
    if (!parent) throw notFound('Parent scope');
    if (parent.companyId !== companyId) throw invalid('The parent scope belongs to another company');
  }

  /** Walk up from the new parent; reaching the scope itself would make a loop. */
  private async assertNoCycle(id: string, parentId: string): Promise<void> {
    let current: string | null = parentId;
    for (let depth = 0; current && depth < 1000; depth += 1) {
      if (current === id) throw invalid('A scope cannot be moved under itself');
      const next: ScopeEntity | null = await this.repo.findOne({ where: { id: current } });
      current = next?.parentId ?? null;
    }
  }

  private async find(id: string, call: ServiceCall, includeDeactivated = false): Promise<ScopeEntity> {
    const row = await this.repo.findOne({
      where: { id: uuidArg(id, 'id'), ...(includeDeactivated ? {} : { deletedAt: IsNull() }) },
    });
    if (!row) throw notFound('Scope');
    this.tenancy.assertVisible(call, row.companyId, 'Scope');
    return row;
  }
}
