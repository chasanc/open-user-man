import { Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import type { User } from '@oum/proto';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { AccessService } from './access.service.js';
import { Tenancy } from './common.js';
import { invalid, unauthenticated } from './errors.js';
import { toUser } from './mappers.js';
import { PasswordService } from './password.service.js';
import type { ServiceCall } from './service-call.js';

export const ADMIN_PERMISSION = 'oum.admin';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DataSource,
    private readonly passwords: PasswordService,
    private readonly access: AccessService,
    private readonly tenancy: Tenancy,
  ) {}

  /**
   * Sign-in: an active, not-deleted user of an active company with the right password.
   * Every failure gives the same answer so callers cannot learn which part was wrong.
   */
  async authenticate(
    input: { username?: string; userKey?: string; password: string; companyId?: string },
    call: ServiceCall,
  ): Promise<User> {
    if (!(input.username || input.userKey) || !input.password) {
      throw invalid('username (or user_key) and password are required');
    }
    const who = input.userKey ? { userKey: input.userKey } : { username: input.username };
    const where = { ...who, deletedAt: IsNull(), active: true };
    const users = await this.db
      .getRepository(UserEntity)
      .find({ where: input.companyId ? { ...where, companyId: input.companyId.toLowerCase() } : where, take: 2 });
    // The same username can exist in two companies; without a company the sign-in is ambiguous.
    const user = users.length === 1 ? users[0] : undefined;
    // Verify even when no user matched so timing does not reveal the username.
    const ok = await this.passwords.verify(user?.passwordHash ?? '', input.password);
    if (!user || !ok) throw unauthenticated('Invalid username or password');
    const confined = this.tenancy.confined(call);
    if (confined !== undefined && confined !== user.companyId) throw unauthenticated('Invalid username or password');
    const company = await this.db
      .getRepository(CompanyEntity)
      .findOne({ where: { id: user.companyId, deletedAt: IsNull(), active: true } });
    if (!company) throw unauthenticated('Invalid username or password');
    if (this.passwords.needsRehash(user.passwordHash)) {
      const passwordHash = await this.passwords.hash(input.password);
      await this.db.getRepository(UserEntity).update({ id: user.id }, { passwordHash });
    }
    return toUser(user);
  }

  /** The admin UI needs sign-in plus oum.admin company-wide. */
  async isAdmin(userId: string, call: ServiceCall): Promise<boolean> {
    const result = await this.access.check({ userId, permission: ADMIN_PERMISSION }, call);
    return result.allowed && !result.matchedGrant?.scopeId;
  }
}
