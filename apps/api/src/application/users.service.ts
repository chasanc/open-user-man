import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, ILike, IsNull } from 'typeorm';
import type { User } from '@oum/proto';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import { UserGroupMemberEntity } from '../infrastructure/database/entities/user-group-member.entity.js';
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
import { toUser } from './mappers.js';
import { PasswordService } from './password.service.js';
import type { ServiceCall } from './service-call.js';

// Never list passwordHash here: these fields are copied into the audit log.
const FIELDS = ['username', 'firstName', 'lastName', 'email', 'mobile', 'avatar', 'active'] as const;

export type UserPatch = Partial<Record<(typeof FIELDS)[number], unknown>>;

export type CreateUserInput = {
  companyId: string;
  userKey?: string;
  username: string;
  firstName: string;
  lastName: string;
  email?: string;
  mobile?: string;
  avatar?: Uint8Array;
  password: string;
};

export const MIN_PASSWORD_LENGTH = 8;

export function checkPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw invalid(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return password;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
    private readonly passwords: PasswordService,
  ) {}

  private get repo() {
    return this.db.getRepository(UserEntity);
  }

  async get(ref: { id?: string; userKey?: string }, call: ServiceCall): Promise<User> {
    return toUser(await this.find(ref, call));
  }

  async list(
    request: { companyId?: string; query?: string; includeDeactivated?: boolean; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<User>> {
    const companyId = this.tenancy.filter(call, request.companyId);
    const base = { ...(request.includeDeactivated ? {} : { deletedAt: IsNull() }), ...(companyId ? { companyId: uuidArg(companyId, 'company_id') } : {}) };
    const q = request.query?.trim();
    const where = q
      ? (['username', 'firstName', 'lastName', 'email'] as const).map((field) => ({
          ...base,
          [field]: ILike(`%${q.replace(/[%_\\]/g, '\\$&')}%`),
        }))
      : base;
    const page = await findPage(this.repo, where, request);
    return { items: page.items.map(toUser), nextPageToken: page.nextPageToken };
  }

  async create(input: CreateUserInput, call: ServiceCall): Promise<User> {
    const company = await requireCompany(this.db, this.tenancy, call, input.companyId);
    const username = requireText(input.username, 'username', 200);
    const password = checkPassword(input.password);
    await this.assertUsernameFree(company.id, username);
    const now = new Date();
    const row = this.repo.create({
      id: uuidv7(),
      companyId: company.id,
      userKey: input.userKey || randomUUID(),
      username,
      firstName: requireText(input.firstName, 'first_name'),
      lastName: requireText(input.lastName, 'last_name'),
      email: optionalText(input.email, 'email', 256),
      mobile: optionalText(input.mobile, 'mobile', 25),
      avatar: input.avatar?.length ? Buffer.from(input.avatar) : null,
      passwordHash: await this.passwords.hash(password),
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAudited(this.db, call, (manager) => manager.getRepository(UserEntity).insert(row).then(() => null));
    return toUser(row);
  }

  async update(id: string, patch: UserPatch, call: ServiceCall): Promise<User> {
    const row = await this.find({ id }, call);
    const before = Object.assign({}, row);
    applyPatch(row, patch, FIELDS);
    if (patch.username !== undefined) {
      row.username = requireText(patch.username, 'username', 200);
      if (row.username !== before.username) await this.assertUsernameFree(row.companyId, row.username);
    }
    if (patch.firstName !== undefined) row.firstName = requireText(patch.firstName, 'first_name');
    if (patch.lastName !== undefined) row.lastName = requireText(patch.lastName, 'last_name');
    if (patch.email !== undefined) row.email = optionalText(patch.email, 'email', 256);
    if (patch.mobile !== undefined) row.mobile = optionalText(patch.mobile, 'mobile', 25);
    if (patch.avatar !== undefined) {
      const avatar = patch.avatar as Uint8Array | null;
      row.avatar = avatar?.length ? Buffer.from(avatar) : null;
    }
    row.updatedAt = new Date();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(UserEntity).save(row);
      const changes = diffFields(before, row, FIELDS);
      return (
        changes && {
          entityType: 'user',
          entityId: id,
          companyId: row.companyId,
          eventType: 'update',
          payload: changes,
        }
      );
    });
    return toUser(row);
  }

  async deactivate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find({ id }, call, true);
    await setLive(this.db, call, this.lifecycle(row), row, false);
  }

  /** Brings a deactivated user back, unless another live user took its username meanwhile. */
  async activate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find({ id }, call, true);
    if (row.deletedAt !== null) await this.assertUsernameFree(row.companyId, row.username);
    await setLive(this.db, call, this.lifecycle(row), row, true);
  }

  /** Permanent delete. Only a deactivated user with no grants and no group memberships. */
  async remove(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find({ id }, call, true);
    await removeRow(this.db, call, this.lifecycle(row), row, {
      grants: await this.db.getRepository(GrantEntity).count({ where: { userId: id } }),
      'group memberships': await this.db.getRepository(UserGroupMemberEntity).count({ where: { userId: id } }),
    });
  }

  private lifecycle(row: UserEntity) {
    return { entityType: 'user' as const, companyId: row.companyId, target: UserEntity };
  }

  async setPassword(id: string, password: string, call: ServiceCall): Promise<void> {
    const row = await this.find({ id }, call);
    const passwordHash = await this.passwords.hash(checkPassword(password));
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(UserEntity).update({ id }, { passwordHash, updatedAt: new Date() });
      // The payload names the event only; no password data goes into the audit log.
      return { entityType: 'user', entityId: id, companyId: row.companyId, eventType: 'set_password', payload: {} };
    });
  }

  private async find(
    ref: { id?: string; userKey?: string },
    call: ServiceCall,
    includeDeactivated = false,
  ): Promise<UserEntity> {
    if (!ref.id && !ref.userKey) throw notFound('User');
    const live = includeDeactivated ? {} : { deletedAt: IsNull() };
    const row = await this.repo.findOne({
      where: ref.id ? { id: uuidArg(ref.id, 'id'), ...live } : { userKey: ref.userKey, ...live },
    });
    if (!row) throw notFound('User');
    this.tenancy.assertVisible(call, row.companyId, 'User');
    return row;
  }

  private async assertUsernameFree(companyId: string, username: string): Promise<void> {
    const taken = await this.repo.findOne({ where: { companyId, username, deletedAt: IsNull() } });
    if (taken) throw exists('username is already in use');
  }
}
