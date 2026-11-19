import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Provider, { type Configuration, type JWK } from 'oidc-provider';
import { DataSource, In, IsNull } from 'typeorm';
import { CompanyEntity } from '../database/entities/company.entity.js';
import { UserEntity } from '../database/entities/user.entity.js';
import { UserGroupEntity } from '../database/entities/user-group.entity.js';
import { UserGroupMemberEntity } from '../database/entities/user-group-member.entity.js';
import { createOidcAdapterClass } from './oidc-adapter.js';

export type OidcSettings = {
  issuer: string;
  cookieKeys: string[];
  signingKeyPath: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  /** Conformance runs only: lets a client skip PKCE. A client that sends a challenge is still checked. */
  pkceOptional?: boolean;
};

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** The same rule as AccessService.liveUser: active, not deleted, in an active company. */
async function liveUser(db: DataSource, id: string): Promise<{ user: UserEntity; company: CompanyEntity } | null> {
  const user = await db.getRepository(UserEntity).findOne({ where: { id, active: true, deletedAt: IsNull() } });
  if (!user) return null;
  const company = await db
    .getRepository(CompanyEntity)
    .findOne({ where: { id: user.companyId, active: true, deletedAt: IsNull() } });
  return company ? { user, company } : null;
}

/** Names of the active groups the user belongs to. */
async function groupNames(db: DataSource, userId: string): Promise<string[]> {
  const memberships = await db.getRepository(UserGroupMemberEntity).find({ where: { userId } });
  if (memberships.length === 0) return [];
  const groups = await db.getRepository(UserGroupEntity).find({
    where: { id: In(memberships.map((m) => m.groupId)), active: true, deletedAt: IsNull() },
    select: { name: true },
  });
  return groups.map((group) => group.name).sort();
}

/** One entry of the `permissions` claim: scope_id null means company-wide. */
export type PermissionClaim = { permission: string; scope_id: string | null };
export type GrantsFor = (userId: string) => Promise<PermissionClaim[]>;

/** Every claim the user has; the provider keeps only those the granted scopes list. groups and permissions are read only when granted. */
export async function accountClaims(
  user: Pick<UserEntity, 'id' | 'firstName' | 'lastName' | 'username' | 'userKey' | 'email'>,
  company: Pick<CompanyEntity, 'id' | 'companyKey' | 'name'>,
  scope: string,
  groups: () => Promise<string[]>,
  permissions: () => Promise<PermissionClaim[]>,
) {
  const scopes = scope.split(' ');
  return {
    sub: user.id,
    name: `${user.firstName} ${user.lastName}`.trim(),
    given_name: user.firstName,
    family_name: user.lastName,
    preferred_username: user.username,
    user_key: user.userKey,
    company: { id: company.id, key: company.companyKey, name: company.name },
    ...(user.email ? { email: user.email } : {}),
    ...(scopes.includes('groups') ? { groups: await groups() } : {}),
    ...(scopes.includes('permissions') ? { permissions: await permissions() } : {}),
  };
}

export function createOidcProvider(db: DataSource, settings: OidcSettings, grantsFor: GrantsFor): Provider {
  const secure = settings.cookieSecure || new URL(settings.issuer).protocol === 'https:';
  const configuration: Configuration = {
    adapter: createOidcAdapterClass(db),
    // Comma-separated paths: the first key signs, the others are only published, so a rotation keeps old tokens valid.
    jwks: {
      keys: settings.signingKeyPath
        .split(',')
        .map((path) => JSON.parse(readFileSync(path.trim(), 'utf8')) as JWK),
    },
    // OpenID Connect Core 3.1.2.1 says servers MUST accept POST at the authorization endpoint. The library then
    // needs the session cookie to be SameSite=None, which browsers only keep when it is Secure. So over HTTPS
    // POST is on; over plain HTTP (local development) it stays off and the cookie keeps the stricter Lax default.
    enableHttpPostMethods: secure,
    cookies: {
      keys: settings.cookieKeys,
      long: { secure, ...(secure && { sameSite: 'none' as const }) },
      short: { secure },
    },
    // generate-oidc-key.mjs makes an ES256 key; the library default (RS256) would reject every client.
    clientDefaults: { id_token_signed_response_alg: 'ES256' },
    // groups and permissions are separate scopes so a client only receives what it asked for.
    // With the code flow they are returned from userinfo, which keeps the ID token small.
    scopes: ['openid', 'profile', 'email', 'offline_access', 'groups', 'permissions'],
    claims: {
      // amr (pwd / otp) reaches the ID token only when a requested scope lists it; it is not in userinfo.
      openid: ['sub', 'amr'],
      profile: ['name', 'given_name', 'family_name', 'preferred_username', 'user_key', 'company'],
      email: ['email'],
      groups: ['groups'],
      permissions: ['permissions'],
    },
    // Secrets are stored hashed, so only the two methods that send the secret itself can work.
    clientAuthMethods: ['client_secret_basic', 'client_secret_post'],
    responseTypes: ['code'],
    pkce: { required: () => !settings.pkceOptional },
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: false },
      revocation: { enabled: true },
    },
    interactions: {
      url: (_ctx, interaction) => `${new URL(settings.issuer).pathname.replace(/\/$/, '')}/interaction/${interaction.uid}`,
    },
    // Applications belong to a company, so there is no consent screen: sign-in grants what the client may ask for.
    loadExistingGrant: async (ctx) => {
      const { client, session, provider } = ctx.oidc;
      if (!client || !session?.accountId) return undefined;
      const existing = session.grantIdFor(client.clientId);
      if (existing) return provider.Grant.find(existing);
      const grant = new provider.Grant({ clientId: client.clientId, accountId: session.accountId });
      grant.addOIDCScope(client.scope ?? 'openid');
      await grant.save();
      return grant;
    },
    // Refresh tokens whenever the client's grant types allow them, without requiring offline_access.
    issueRefreshToken: async (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    findAccount: async (_ctx, sub) => {
      const live = await liveUser(db, sub);
      if (!live) return undefined;
      const { user, company } = live;
      return {
        accountId: user.id,
        // Only the scopes the grant carries reach here, so groups and permissions are looked up on demand.
        claims: async (_use, scope) =>
          accountClaims(user, company, scope, () => groupNames(db, user.id), () => grantsFor(user.id)),
      };
    },
  };

  const provider = new Provider(settings.issuer, configuration);
  provider.proxy = settings.trustProxy;

  // The provider compares the presented secret with the stored one as plain text; ours is a SHA-256 digest.
  (provider.Client.prototype as { compareClientSecret(actual: string): boolean }).compareClientSecret =
    function compareClientSecret(this: { clientSecret?: string }, actual: string): boolean {
      const stored = Buffer.from(this.clientSecret ?? '', 'utf8');
      const given = Buffer.from(sha256Hex(actual), 'utf8');
      return stored.length === given.length && timingSafeEqual(stored, given);
    };

  return provider;
}
