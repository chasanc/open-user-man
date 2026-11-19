import type { Adapter, AdapterPayload } from 'oidc-provider';
import { DataSource, In, IsNull, LessThan, type EntityManager } from 'typeorm';
import { OidcClientEntity } from '../database/entities/oidc-client.entity.js';
import { OidcPayloadEntity } from '../database/entities/oidc-payload.entity.js';
import { UserEntity } from '../database/entities/user.entity.js';

/** Models whose payload carries an account id; the column lets one statement revoke a user. */
const WITH_ACCOUNT = new Set(['Session', 'Grant', 'AuthorizationCode', 'AccessToken', 'RefreshToken', 'DeviceCode']);

const asDate = (seconds: number | null | undefined): Date | null =>
  seconds ? new Date(seconds * 1000) : null;

/** Clients live in users.oidc_client (managed by admins); everything else in users.oidc_payload. */
export function clientPayload(row: OidcClientEntity): AdapterPayload {
  return {
    client_id: row.clientId,
    // Already a SHA-256 digest; the provider's secret check is replaced to hash the presented secret.
    client_secret: row.secretHash,
    client_name: row.name,
    redirect_uris: row.redirectUris,
    post_logout_redirect_uris: row.postLogoutRedirectUris,
    grant_types: row.grantTypes,
    response_types: ['code'],
    scope: row.tokenScopes.join(' '),
    token_endpoint_auth_method: 'client_secret_basic',
  };
}

export function createOidcAdapterClass(db: DataSource): new (model: string) => Adapter {
  const payloads = () => db.getRepository(OidcPayloadEntity);

  return class TypeOrmOidcAdapter implements Adapter {
    constructor(private readonly model: string) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
      const row = payloads().create({
        model: this.model,
        id,
        payload,
        grantId: payload.grantId ?? null,
        uid: payload.uid ?? null,
        userCode: payload.userCode ?? null,
        userId: WITH_ACCOUNT.has(this.model) ? (payload.accountId ?? null) : null,
        expiresAt: new Date(Date.now() + expiresIn * 1000),
        consumedAt: asDate(payload.consumed),
      });
      await payloads().save(row);
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
      if (this.model === 'Client') {
        const client = await db
          .getRepository(OidcClientEntity)
          .findOne({ where: { clientId: id, active: true, deletedAt: IsNull() } });
        return client ? clientPayload(client) : undefined;
      }
      return this.read(await payloads().findOne({ where: { model: this.model, id } }));
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
      return this.read(await payloads().findOne({ where: { model: this.model, uid } }));
    }

    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
      return this.read(await payloads().findOne({ where: { model: this.model, userCode } }));
    }

    async destroy(id: string): Promise<void> {
      await payloads().delete({ model: this.model, id });
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await payloads().delete({ grantId });
    }

    async consume(id: string): Promise<void> {
      const consumed = Math.floor(Date.now() / 1000);
      const row = await payloads().findOne({ where: { model: this.model, id } });
      if (!row) return;
      await payloads().update({ model: this.model, id }, { consumedAt: new Date(consumed * 1000), payload: { ...row.payload, consumed } });
    }

    /** Expired rows are treated as missing; purgeExpiredOidc removes them. */
    private read(row: OidcPayloadEntity | null): AdapterPayload | undefined {
      if (!row || (row.expiresAt && row.expiresAt.getTime() <= Date.now())) return undefined;
      return row.consumedAt ? { ...row.payload, consumed: Math.floor(row.consumedAt.getTime() / 1000) } : row.payload;
    }
  };
}

/**
 * Ends every session, grant and token of one user, or of every user of one company, so a deactivated
 * or re-passworded account stops working at once. Runs inside the caller's transaction. A client needs
 * no purge: the adapter stops finding it, so its tokens can no longer be refreshed or introspected.
 */
export async function revokeOidc(manager: EntityManager, who: { userId?: string; companyId?: string }): Promise<void> {
  const userIds = who.userId
    ? [who.userId]
    : (await manager.getRepository(UserEntity).find({ where: { companyId: who.companyId }, select: { id: true } })).map(
        (user) => user.id,
      );
  if (userIds.length > 0) await manager.getRepository(OidcPayloadEntity).delete({ userId: In(userIds) });
}

/** Deletes expired provider objects. Cheap; run on a timer. */
export async function purgeExpiredOidc(db: DataSource): Promise<number> {
  const result = await db.getRepository(OidcPayloadEntity).delete({ expiresAt: LessThan(new Date()) });
  return result.affected ?? 0;
}
