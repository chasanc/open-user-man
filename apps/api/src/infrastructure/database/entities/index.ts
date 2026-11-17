import { AuditLogEntity } from './audit-log.entity.js';
import { CompanyEntity } from './company.entity.js';
import { GrantEntity } from './grant.entity.js';
import { PermissionEntity } from './permission.entity.js';
import { ScopeEntity } from './scope.entity.js';
import { UserEntity } from './user.entity.js';
import { UserGroupEntity } from './user-group.entity.js';
import { UserGroupMemberEntity } from './user-group-member.entity.js';

export const typeOrmEntities = [
  CompanyEntity,
  UserEntity,
  UserGroupEntity,
  UserGroupMemberEntity,
  PermissionEntity,
  ScopeEntity,
  GrantEntity,
  AuditLogEntity,
] as const;

export {
  AuditLogEntity,
  CompanyEntity,
  GrantEntity,
  PermissionEntity,
  ScopeEntity,
  UserEntity,
  UserGroupEntity,
  UserGroupMemberEntity,
};
