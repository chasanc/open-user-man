import type { Company, Grant, Permission, Scope, User, UserGroup } from '@oum/proto';
import type { CompanyEntity } from '../infrastructure/database/entities/company.entity.js';
import type { GrantEntity } from '../infrastructure/database/entities/grant.entity.js';
import type { PermissionEntity } from '../infrastructure/database/entities/permission.entity.js';
import type { ScopeEntity } from '../infrastructure/database/entities/scope.entity.js';
import type { UserEntity } from '../infrastructure/database/entities/user.entity.js';
import type { UserGroupEntity } from '../infrastructure/database/entities/user-group.entity.js';

// Optional proto fields are `undefined` when unset, never null.
const opt = <T>(value: T | null): T | undefined => value ?? undefined;
const bytes = (value: Buffer | null): Buffer | undefined =>
  value && value.length > 0 ? value : undefined;

export function toCompany(row: CompanyEntity): Company {
  return {
    id: row.id,
    companyKey: row.companyKey,
    name: row.name,
    email: opt(row.email),
    contactPerson: opt(row.contactPerson),
    contactPhone: opt(row.contactPhone),
    active: row.active,
    requireMfa: row.requireMfa,
    createTime: row.createdAt,
    updateTime: row.updatedAt,
  };
}

/** Never includes the password hash. */
export function toUser(row: UserEntity): User {
  return {
    id: row.id,
    companyId: row.companyId,
    userKey: row.userKey,
    username: row.username,
    firstName: row.firstName,
    lastName: row.lastName,
    email: opt(row.email),
    mobile: opt(row.mobile),
    avatar: bytes(row.avatar),
    active: row.active,
    createTime: row.createdAt,
    updateTime: row.updatedAt,
  };
}

export function toUserGroup(row: UserGroupEntity): UserGroup {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: opt(row.description),
    avatar: bytes(row.avatar),
    active: row.active,
    createTime: row.createdAt,
    updateTime: row.updatedAt,
  };
}

export function toPermission(row: PermissionEntity): Permission {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    description: opt(row.description),
    active: row.active,
    createTime: row.createdAt,
    updateTime: row.updatedAt,
  };
}

export function toScope(row: ScopeEntity): Scope {
  return {
    id: row.id,
    companyId: row.companyId,
    parentId: opt(row.parentId),
    scopeKey: opt(row.scopeKey),
    reference: opt(row.reference),
    name: row.name,
    description: opt(row.description),
    active: row.active,
    createTime: row.createdAt,
    updateTime: row.updatedAt,
  };
}

export function toGrant(row: GrantEntity, permissionName: string): Grant {
  return {
    id: row.id,
    userId: opt(row.userId),
    groupId: opt(row.groupId),
    permissionId: row.permissionId,
    permissionName,
    scopeId: opt(row.scopeId),
    createTime: row.createdAt,
    createdBy: opt(row.createdBy),
  };
}
