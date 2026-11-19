import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import { UserTotpEntity } from '../infrastructure/database/entities/user-totp.entity.js';
import { revokeOidc } from '../infrastructure/oidc/oidc-adapter.js';
import { runAudited } from './audit.js';
import { Tenancy, uuidArg } from './common.js';
import { invalid, notFound, precondition, unauthenticated } from './errors.js';
import type { ServiceCall } from './service-call.js';
import {
  base32,
  decryptSecret,
  encryptSecret,
  hashRecovery,
  matchStep,
  newRecoveryCodes,
} from './totp.js';

export type MfaStatus = { enrolled: boolean; pending: boolean; recoveryCodesLeft: number };

/** Two-step verification (TOTP plus single-use recovery codes). Never logs or audits a secret or a code. */
@Injectable()
export class MfaService {
  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(UserTotpEntity);
  }

  private key(): string {
    const key = this.config.get<string>('totpEncryptionKey') ?? '';
    if (key.length < 32) throw precondition('TOTP_ENCRYPTION_KEY must be set (at least 32 characters) to use two-step verification');
    return key;
  }

  async status(userId: string, call: ServiceCall): Promise<MfaStatus> {
    await this.user(userId, call);
    const row = await this.repo.findOne({ where: { userId } });
    return { enrolled: Boolean(row?.confirmedAt), pending: Boolean(row && !row.confirmedAt), recoveryCodesLeft: row?.recoveryHashes.length ?? 0 };
  }

  /** Starts enrolment: a fresh secret that counts only after `confirm`. Already enrolled? Reset first. */
  async enrol(userId: string, call: ServiceCall): Promise<{ secret: string; otpauthUrl: string }> {
    const { user, company } = await this.user(userId, call);
    const key = this.key();
    const existing = await this.repo.findOne({ where: { userId } });
    if (existing?.confirmedAt) throw precondition('Two-step verification is already on; reset it first');
    const secret = randomBytes(20);
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(UserTotpEntity).save({
        userId,
        secretEnc: encryptSecret(secret, key),
        confirmedAt: null,
        lastStep: 0,
        recoveryHashes: [],
        createdAt: new Date(),
      });
      return { entityType: 'user', entityId: userId, companyId: company.id, eventType: 'mfa_enrol', payload: {} };
    });
    const label = encodeURIComponent(`${company.name}:${user.username}`);
    const text = base32(secret);
    return { secret: text, otpauthUrl: `otpauth://totp/${label}?secret=${text}&issuer=${encodeURIComponent(company.name)}` };
  }

  /** Proves the authenticator works, turns two-step verification on and returns the recovery codes once. */
  async confirm(userId: string, code: string, call: ServiceCall): Promise<{ recoveryCodes: string[] }> {
    const { company } = await this.user(userId, call);
    const key = this.key();
    const row = await this.repo.findOne({ where: { userId } });
    if (!row || row.confirmedAt) throw precondition('Start enrolment first');
    const step = matchStep(decryptSecret(row.secretEnc, key), String(code ?? '').trim(), Date.now(), 0);
    if (step === null) throw invalid('That code is not right');
    const recoveryCodes = newRecoveryCodes();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(UserTotpEntity).update(
        { userId },
        { confirmedAt: new Date(), lastStep: step, recoveryHashes: recoveryCodes.map(hashRecovery) },
      );
      return { entityType: 'user', entityId: userId, companyId: company.id, eventType: 'mfa_confirm', payload: {} };
    });
    return { recoveryCodes };
  }

  /** Lost phone: turns two-step verification off and ends the user's sessions. The user can enrol again. */
  async reset(userId: string, call: ServiceCall): Promise<void> {
    const { company } = await this.user(userId, call);
    const row = await this.repo.findOne({ where: { userId } });
    if (!row) return;
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(UserTotpEntity).delete({ userId });
      await revokeOidc(manager, { userId });
      return { entityType: 'user', entityId: userId, companyId: company.id, eventType: 'mfa_reset', payload: {} };
    });
  }

  /**
   * The second step of a sign-in, after the password was right. Returns the `amr` values of what was
   * proven. A user without two-step verification passes unless the company requires it. Every wrong
   * answer reads like a wrong password, so nobody learns that the password was right.
   */
  async gate(user: { id: string; companyId: string }, code: string | undefined): Promise<string[]> {
    const row = await this.repo.findOne({ where: { userId: user.id } });
    if (!row?.confirmedAt) {
      const company = await this.db.getRepository(CompanyEntity).findOne({ where: { id: user.companyId } });
      if (company?.requireMfa) {
        throw unauthenticated('Two-step verification is required for your company. Ask an administrator to set it up.');
      }
      return ['pwd'];
    }
    if (!(await this.accept(user, row, String(code ?? '').trim()))) throw unauthenticated('Invalid username or password');
    return ['pwd', 'otp'];
  }

  private async accept(user: { id: string; companyId: string }, row: UserTotpEntity, code: string): Promise<boolean> {
    let secret: Buffer;
    try {
      secret = decryptSecret(row.secretEnc, this.key());
    } catch {
      return false; // wrong key or damaged row: nobody gets in with two-step verification on
    }
    const step = matchStep(secret, code, Date.now(), row.lastStep);
    if (step !== null) {
      // Only one of two parallel uses of the same code wins the update.
      const moved = await this.repo
        .createQueryBuilder()
        .update()
        .set({ lastStep: step })
        .where('user_id = :id AND last_step < :step', { id: user.id, step })
        .execute();
      return moved.affected === 1;
    }
    if (!code) return false;
    const hash = hashRecovery(code);
    let used = false;
    await runAudited(this.db, { source: 'rest', actorUserId: user.id }, async (manager) => {
      const current = await manager
        .getRepository(UserTotpEntity)
        .findOne({ where: { userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (!current || !current.recoveryHashes.includes(hash)) return null;
      const left = current.recoveryHashes.filter((item) => item !== hash);
      await manager.getRepository(UserTotpEntity).update({ userId: user.id }, { recoveryHashes: left });
      used = true;
      return { entityType: 'user', entityId: user.id, companyId: user.companyId, eventType: 'mfa_recovery_used', payload: { left: left.length } };
    });
    return used;
  }

  private async user(userId: string, call: ServiceCall) {
    const user = await this.db.getRepository(UserEntity).findOne({ where: { id: uuidArg(userId, 'id'), deletedAt: IsNull() } });
    if (!user) throw notFound('User');
    this.tenancy.assertVisible(call, user.companyId, 'User');
    const company = await this.db.getRepository(CompanyEntity).findOne({ where: { id: user.companyId } });
    if (!company) throw notFound('Company');
    return { user, company };
  }
}
