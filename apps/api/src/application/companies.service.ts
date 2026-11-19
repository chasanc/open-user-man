import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { Company } from '@oum/proto';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import { PermissionEntity } from '../infrastructure/database/entities/permission.entity.js';
import { ScopeEntity } from '../infrastructure/database/entities/scope.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { UserGroupEntity } from '../infrastructure/database/entities/user-group.entity.js';
import { diffFields, runAudited } from './audit.js';
import { applyPatch, findPage, optionalText, requireText, Tenancy, uuidArg, type Page } from './common.js';
import { denied, invalid, notFound, precondition } from './errors.js';
import { uuidv7 } from './ids.js';
import { removeRow, setLive } from './lifecycle.js';
import { toCompany } from './mappers.js';
import type { ServiceCall } from './service-call.js';

const FIELDS = ['name', 'email', 'contactPerson', 'contactPhone', 'active', 'requireMfa'] as const;

export type CompanyPatch = Partial<Record<(typeof FIELDS)[number], unknown>>;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(CompanyEntity);
  }

  async get(ref: { id?: string; companyKey?: string }, call: ServiceCall): Promise<Company> {
    const row = await this.find(ref, call);
    return toCompany(row);
  }

  async list(
    request: { includeDeactivated?: boolean; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<Company>> {
    const confined = this.tenancy.confined(call);
    const page = await findPage(
      this.repo,
      { ...(request.includeDeactivated ? {} : { deletedAt: IsNull() }), ...(confined ? { id: confined } : {}) },
      request,
    );
    return { items: page.items.map(toCompany), nextPageToken: page.nextPageToken };
  }

  async create(
    input: { companyKey?: string; name: string; email?: string; contactPerson?: string; contactPhone?: string },
    call: ServiceCall,
  ): Promise<Company> {
    if (this.tenancy.confined(call) !== undefined) {
      throw denied('A company-confined caller cannot create companies');
    }
    const now = new Date();
    const row = this.repo.create({
      id: uuidv7(),
      companyKey: input.companyKey || randomUUID(),
      name: requireText(input.name, 'name'),
      email: optionalText(input.email, 'email', 256),
      contactPerson: optionalText(input.contactPerson, 'contact_person'),
      contactPhone: optionalText(input.contactPhone, 'contact_phone'),
      active: true,
      requireMfa: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const taken = await this.repo.findOne({ where: { companyKey: row.companyKey, deletedAt: IsNull() } });
    if (taken) throw precondition('company_key is already in use');
    await runAudited(this.db, call, (manager) => manager.getRepository(CompanyEntity).insert(row).then(() => null));
    return toCompany(row);
  }

  async update(id: string, patch: CompanyPatch, call: ServiceCall): Promise<Company> {
    const row = await this.find({ id }, call);
    const before = Object.assign({}, row);
    if (patch.requireMfa !== undefined && typeof patch.requireMfa !== 'boolean') {
      throw invalid('requireMfa must be true or false');
    }
    applyPatch(row, patch, FIELDS);
    if (patch.name !== undefined) row.name = requireText(patch.name, 'name');
    if (patch.email !== undefined) row.email = optionalText(patch.email, 'email', 256);
    row.updatedAt = new Date();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(CompanyEntity).save(row);
      const changes = diffFields(before, row, FIELDS);
      return changes && { entityType: 'company', entityId: id, companyId: id, eventType: 'update', payload: changes };
    });
    return toCompany(row);
  }

  async deactivate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.findForChange(id, call);
    await setLive(this.db, call, this.lifecycle(row), row, false);
  }

  async activate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.findForChange(id, call);
    await setLive(this.db, call, this.lifecycle(row), row, true);
  }

  /** Permanent delete. Only a deactivated company with nothing in it. */
  async remove(id: string, call: ServiceCall): Promise<void> {
    const row = await this.findForChange(id, call);
    const where = { companyId: id };
    await removeRow(this.db, call, this.lifecycle(row), row, {
      users: await this.db.getRepository(UserEntity).count({ where }),
      groups: await this.db.getRepository(UserGroupEntity).count({ where }),
      permissions: await this.db.getRepository(PermissionEntity).count({ where }),
      scopes: await this.db.getRepository(ScopeEntity).count({ where }),
    });
  }

  private lifecycle(row: CompanyEntity) {
    return { entityType: 'company' as const, companyId: row.id, target: CompanyEntity, revoke: { companyId: row.id } };
  }

  /** Deactivate, activate and remove work on deactivated rows too, and are not for confined callers. */
  private async findForChange(id: string, call: ServiceCall): Promise<CompanyEntity> {
    if (this.tenancy.confined(call) !== undefined) {
      throw denied('A company-confined caller cannot deactivate, activate or remove companies');
    }
    return this.find({ id }, call, true);
  }

  private async find(
    ref: { id?: string; companyKey?: string },
    call: ServiceCall,
    includeDeactivated = false,
  ): Promise<CompanyEntity> {
    if (!ref.id && !ref.companyKey) throw notFound('Company');
    if (ref.id) ref = { id: uuidArg(ref.id, 'id') };
    const live = includeDeactivated ? {} : { deletedAt: IsNull() };
    const row = await this.repo.findOne({
      where: ref.id ? { id: ref.id, ...live } : { companyKey: ref.companyKey, ...live },
    });
    if (!row) throw notFound('Company');
    this.tenancy.assertVisible(call, row.id, 'Company');
    return row;
  }
}
