import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DataSource, ILike, IsNull } from 'typeorm';
import { OidcClientEntity } from '../infrastructure/database/entities/oidc-client.entity.js';
import { sha256Hex } from '../infrastructure/oidc/oidc-provider.js';
import { diffFields, runAudited } from './audit.js';
import { findPage, requireCompany, requireText, Tenancy, uuidArg, type Page } from './common.js';
import { invalid, notFound } from './errors.js';
import { uuidv7 } from './ids.js';
import { removeRow, setLive } from './lifecycle.js';
import type { ServiceCall } from './service-call.js';

/** An application as admins see it. The secret is never part of it. */
export type OidcClientDto = {
  id: string;
  companyId: string;
  clientId: string;
  name: string;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  tokenScopes: string[];
  grantTypes: string[];
  active: boolean;
  createTime: Date;
  updateTime: Date;
};

const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'groups', 'permissions'];
const GRANTS = ['authorization_code', 'refresh_token'];
const FIELDS = ['name', 'redirectUris', 'postLogoutRedirectUris', 'tokenScopes', 'grantTypes'] as const;

export type OidcClientPatch = Partial<Record<(typeof FIELDS)[number], unknown>>;

const toDto = (row: OidcClientEntity): OidcClientDto => ({
  id: row.id,
  companyId: row.companyId,
  clientId: row.clientId,
  name: row.name,
  redirectUris: row.redirectUris,
  postLogoutRedirectUris: row.postLogoutRedirectUris,
  tokenScopes: row.tokenScopes,
  grantTypes: row.grantTypes,
  active: row.active,
  createTime: row.createdAt,
  updateTime: row.updatedAt,
});

/** A list of strings, optionally limited to `allowed`. */
function list(value: unknown, field: string, allowed?: string[]): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw invalid(`${field} must be a list of text`);
  const items = [...new Set(value.map((item: string) => item.trim()).filter(Boolean))];
  const bad = items.find((item) => allowed && !allowed.includes(item));
  if (bad) throw invalid(`${field} cannot contain "${bad}"; allowed: ${allowed!.join(', ')}`);
  return items;
}

/** Absolute https URLs, or http on a local host. No fragments: the provider rejects them anyway. */
function urls(value: unknown, field: string): string[] {
  return list(value, field).map((item) => {
    let url: URL;
    try {
      url = new URL(item);
    } catch {
      throw invalid(`${field} has an invalid URL: ${item}`);
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
      throw invalid(`${field} must be https URLs without a fragment (http only for localhost): ${item}`);
    }
    return item;
  });
}

export function checked(input: OidcClientPatch, base: Pick<OidcClientEntity, (typeof FIELDS)[number]>) {
  const out = { ...base };
  if (input.name !== undefined) out.name = requireText(input.name, 'name', 200);
  if (input.redirectUris !== undefined) out.redirectUris = urls(input.redirectUris, 'redirectUris');
  if (input.postLogoutRedirectUris !== undefined) out.postLogoutRedirectUris = urls(input.postLogoutRedirectUris, 'postLogoutRedirectUris');
  if (input.tokenScopes !== undefined) out.tokenScopes = list(input.tokenScopes, 'tokenScopes', SCOPES);
  if (input.grantTypes !== undefined) out.grantTypes = list(input.grantTypes, 'grantTypes', GRANTS);
  if (out.redirectUris.length === 0) throw invalid('redirectUris needs at least one URL');
  if (!out.tokenScopes.includes('openid')) throw invalid('tokenScopes must include openid');
  if (!out.grantTypes.includes('authorization_code')) throw invalid('grantTypes must include authorization_code');
  return out;
}

const newSecret = () => randomBytes(32).toString('base64url');

@Injectable()
export class OidcClientsService {
  constructor(
    private readonly db: DataSource,
    private readonly tenancy: Tenancy,
  ) {}

  private get repo() {
    return this.db.getRepository(OidcClientEntity);
  }

  async get(id: string, call: ServiceCall): Promise<OidcClientDto> {
    return toDto(await this.find(id, call));
  }

  async list(
    request: { companyId?: string; query?: string; includeDeactivated?: boolean; pageSize?: number; pageToken?: string },
    call: ServiceCall,
  ): Promise<Page<OidcClientDto>> {
    const companyId = this.tenancy.filter(call, request.companyId);
    const base = {
      ...(request.includeDeactivated ? {} : { deletedAt: IsNull() }),
      ...(companyId ? { companyId: uuidArg(companyId, 'company_id') } : {}),
    };
    const q = request.query?.trim();
    const where = q ? { ...base, name: ILike(`%${q.replace(/[%_\\]/g, '\\$&')}%`) } : base;
    const page = await findPage(this.repo, where, request);
    return { items: page.items.map(toDto), nextPageToken: page.nextPageToken };
  }

  /** The client secret is in the answer once and is stored only as a hash. */
  async create(
    input: OidcClientPatch & { companyId: string },
    call: ServiceCall,
  ): Promise<OidcClientDto & { clientSecret: string }> {
    const company = await requireCompany(this.db, this.tenancy, call, input.companyId);
    const fields = checked(input, {
      name: '',
      redirectUris: [],
      postLogoutRedirectUris: [],
      tokenScopes: ['openid', 'profile', 'email'],
      grantTypes: ['authorization_code', 'refresh_token'],
    });
    if (!fields.name) throw invalid('name is required');
    const now = new Date();
    const clientSecret = newSecret();
    const row = this.repo.create({
      id: uuidv7(),
      companyId: company.id,
      clientId: randomBytes(18).toString('base64url'),
      secretHash: sha256Hex(clientSecret),
      ...fields,
      active: true,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await runAudited(this.db, call, (manager) => manager.getRepository(OidcClientEntity).insert(row).then(() => null));
    return { ...toDto(row), clientSecret };
  }

  async update(id: string, patch: OidcClientPatch, call: ServiceCall): Promise<OidcClientDto> {
    const row = await this.find(id, call);
    const before = Object.assign({}, row);
    Object.assign(row, checked(patch, row), { updatedAt: new Date() });
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(OidcClientEntity).save(row);
      const changes = diffFields(before, row, FIELDS);
      return changes && { entityType: 'oidc_client', entityId: id, companyId: row.companyId, eventType: 'update', payload: changes };
    });
    return toDto(row);
  }

  /** The old secret stops working at once. Tokens already issued keep working until they expire. */
  async rotateSecret(id: string, call: ServiceCall): Promise<{ clientSecret: string }> {
    const row = await this.find(id, call);
    const clientSecret = newSecret();
    await runAudited(this.db, call, async (manager) => {
      await manager.getRepository(OidcClientEntity).update({ id }, { secretHash: sha256Hex(clientSecret), updatedAt: new Date() });
      return { entityType: 'oidc_client', entityId: id, companyId: row.companyId, eventType: 'rotate_secret', payload: {} };
    });
    return { clientSecret };
  }

  async deactivate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await setLive(this.db, call, this.lifecycle(row), row, false);
  }

  async activate(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await setLive(this.db, call, this.lifecycle(row), row, true);
  }

  /** Permanent delete. Only a deactivated application. */
  async remove(id: string, call: ServiceCall): Promise<void> {
    const row = await this.find(id, call, true);
    await removeRow(this.db, call, this.lifecycle(row), row, {});
  }

  private lifecycle(row: OidcClientEntity) {
    return { entityType: 'oidc_client' as const, companyId: row.companyId, target: OidcClientEntity };
  }

  private async find(id: string, call: ServiceCall, includeDeactivated = false): Promise<OidcClientEntity> {
    const row = await this.repo.findOne({
      where: { id: uuidArg(id, 'id'), ...(includeDeactivated ? {} : { deletedAt: IsNull() }) },
    });
    if (!row) throw notFound('Application');
    this.tenancy.assertVisible(call, row.companyId, 'Application');
    return row;
  }
}
