import { AuditLogEntity } from './audit-log.entity.js';
import { CompanyEntity } from './company.entity.js';
import { GrantEntity } from './grant.entity.js';
import { OidcClientEntity } from './oidc-client.entity.js';
import { OidcPayloadEntity } from './oidc-payload.entity.js';
import { PermissionEntity } from './permission.entity.js';
import { ScopeEntity } from './scope.entity.js';
import { UserEntity } from './user.entity.js';
import { UserGroupEntity } from './user-group.entity.js';
import { UserGroupMemberEntity } from './user-group-member.entity.js';
import { UserTotpEntity } from './user-totp.entity.js';

export const typeOrmEntities = [
  CompanyEntity,
  UserEntity,
  UserGroupEntity,
  UserGroupMemberEntity,
  PermissionEntity,
  ScopeEntity,
  GrantEntity,
  AuditLogEntity,
  OidcClientEntity,
  OidcPayloadEntity,
  UserTotpEntity,
] as const;

export {
  AuditLogEntity,
  CompanyEntity,
  GrantEntity,
  OidcClientEntity,
  OidcPayloadEntity,
  PermissionEntity,
  ScopeEntity,
  UserEntity,
  UserGroupEntity,
  UserGroupMemberEntity,
  UserTotpEntity,
};
