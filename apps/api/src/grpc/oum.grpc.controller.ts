import { Controller, UseInterceptors } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import type { Metadata } from '@grpc/grpc-js';
import type {
  AuthenticateRequest,
  BatchCheckRequest,
  CheckRequest,
  CreateCompanyRequest,
  CreateGrantRequest,
  CreatePermissionRequest,
  CreateScopeRequest,
  CreateUserGroupRequest,
  CreateUserRequest,
  ActivateCompanyRequest,
  DeactivateCompanyRequest,
  RemoveCompanyRequest,
  DeleteGrantRequest,
  ActivatePermissionRequest,
  DeactivatePermissionRequest,
  RemovePermissionRequest,
  ActivateScopeRequest,
  DeactivateScopeRequest,
  RemoveScopeRequest,
  ActivateUserGroupRequest,
  DeactivateUserGroupRequest,
  RemoveUserGroupRequest,
  ActivateUserRequest,
  DeactivateUserRequest,
  RemoveUserRequest,
  GetCompanyRequest,
  GetPermissionRequest,
  GetScopeRequest,
  GetUserGroupRequest,
  GetUserRequest,
  ListCompaniesRequest,
  ListGrantsForUserRequest,
  ListGrantsRequest,
  ListMembersRequest,
  ListPermissionsRequest,
  ListScopesRequest,
  ListUserGroupsRequest,
  ListUsersRequest,
  MemberRequest,
  SetPasswordRequest,
  SetUserGroupsRequest,
  UpdateCompanyRequest,
  UpdatePermissionRequest,
  UpdateScopeRequest,
  UpdateUserGroupRequest,
  UpdateUserRequest,
} from '@oum/proto';
import { AccessService } from '../application/access.service.js';
import { AuthService } from '../application/auth.service.js';
import { CompaniesService } from '../application/companies.service.js';
import { AppError } from '../application/errors.js';
import { GrantsService } from '../application/grants.service.js';
import { NIL_UUID } from '../application/ids.js';
import { PermissionsService } from '../application/permissions.service.js';
import { ScopesService } from '../application/scopes.service.js';
import type { ServiceCall } from '../application/service-call.js';
import { UserGroupsService } from '../application/user-groups.service.js';
import { UsersService } from '../application/users.service.js';
import { GrpcApiKeyInterceptor } from './grpc-api-key.interceptor.js';
import { GrpcErrorInterceptor, maskedPatch, metadataValue, toWire } from './grpc-support.js';

const USER_FIELDS = ['username', 'firstName', 'lastName', 'email', 'mobile', 'avatar', 'active'] as const;
const GROUP_FIELDS = ['name', 'description', 'avatar', 'active'] as const;
const PERMISSION_FIELDS = ['name', 'description'] as const;
const SCOPE_FIELDS = ['parentId', 'scopeKey', 'reference', 'name', 'description', 'active'] as const;
const COMPANY_FIELDS = ['name', 'email', 'contactPerson', 'contactPhone', 'active'] as const;

const EMPTY = {};

/** An update names its target in the resource; a missing id is a client mistake, not a server error. */
function idOf(resource: { id?: string } | undefined, what: string): string {
  if (!resource?.id) throw new AppError('invalid', `${what}.id is required`);
  return resource.id;
}

/** All eight oum.v1 services. Each method only translates the wire shape and calls the shared service. */
@Controller()
@UseInterceptors(GrpcApiKeyInterceptor, GrpcErrorInterceptor)
export class OumGrpcController {
  constructor(
    private readonly auth: AuthService,
    private readonly access: AccessService,
    private readonly users: UsersService,
    private readonly groups: UserGroupsService,
    private readonly permissions: PermissionsService,
    private readonly scopes: ScopesService,
    private readonly companies: CompaniesService,
    private readonly grants: GrantsService,
  ) {}

  /** The company-key header names the company this caller is confined to (multi-company mode). */
  private async call(metadata?: Metadata): Promise<ServiceCall> {
    const key = metadataValue(metadata, 'company-key');
    if (!key) return { source: 'grpc', companyId: NIL_UUID };
    try {
      const company = await this.companies.get({ companyKey: key }, { source: 'rest' });
      return { source: 'grpc', companyId: company.id };
    } catch (error) {
      // Unknown key: the nil id matches no row, so every lookup fails closed.
      if (error instanceof AppError && error.kind === 'not_found') return { source: 'grpc', companyId: NIL_UUID };
      throw error;
    }
  }

  // ---- AuthService / AccessService ----------------------------------------------------------

  @GrpcMethod('AuthService', 'Authenticate')
  async authenticate(request: AuthenticateRequest, metadata?: Metadata) {
    return toWire(
      await this.auth.authenticate(
        request,
        await this.call(metadata),
      ),
    );
  }

  @GrpcMethod('AccessService', 'Check')
  async check(request: CheckRequest, metadata?: Metadata) {
    return toWire(await this.access.check(checkInput(request), await this.call(metadata)));
  }

  @GrpcMethod('AccessService', 'BatchCheck')
  async batchCheck(request: BatchCheckRequest, metadata?: Metadata) {
    const results = await this.access.batchCheck((request.checks ?? []).map(checkInput), await this.call(metadata));
    return toWire({ results });
  }

  @GrpcMethod('AccessService', 'ListGrantsForUser')
  async listGrantsForUser(request: ListGrantsForUserRequest, metadata?: Metadata) {
    const grants = await this.access.listGrantsForUser(request, await this.call(metadata));
    return toWire({ grants, nextPageToken: '' });
  }

  // ---- UserService --------------------------------------------------------------------------

  @GrpcMethod('UserService', 'GetUser')
  async getUser(request: GetUserRequest, metadata?: Metadata) {
    return toWire(await this.users.get({ id: request.id, userKey: request.userKey }, await this.call(metadata)));
  }

  @GrpcMethod('UserService', 'ListUsers')
  async listUsers(request: ListUsersRequest, metadata?: Metadata) {
    const page = await this.users.list(request, await this.call(metadata));
    return toWire({ users: page.items, nextPageToken: page.nextPageToken });
  }

  @GrpcMethod('UserService', 'CreateUser')
  async createUser(request: CreateUserRequest, metadata?: Metadata) {
    return toWire(await this.users.create(request, await this.call(metadata)));
  }

  @GrpcMethod('UserService', 'UpdateUser')
  async updateUser(request: UpdateUserRequest, metadata?: Metadata) {
    const id = idOf(request.user, 'user');
    const patch = maskedPatch(request.user, request.updateMask, USER_FIELDS);
    return toWire(await this.users.update(id, patch, await this.call(metadata)));
  }

  @GrpcMethod('UserService', 'DeactivateUser')
  async deactivateUser(request: DeactivateUserRequest, metadata?: Metadata) {
    await this.users.deactivate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserService', 'ActivateUser')
  async activateUser(request: ActivateUserRequest, metadata?: Metadata) {
    await this.users.activate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserService', 'RemoveUser')
  async removeUser(request: RemoveUserRequest, metadata?: Metadata) {
    await this.users.remove(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserService', 'SetPassword')
  async setPassword(request: SetPasswordRequest, metadata?: Metadata) {
    await this.users.setPassword(request.id, request.password, await this.call(metadata));
    return EMPTY;
  }

  // ---- UserGroupService ---------------------------------------------------------------------

  @GrpcMethod('UserGroupService', 'GetUserGroup')
  async getUserGroup(request: GetUserGroupRequest, metadata?: Metadata) {
    return toWire(await this.groups.get(request.id, await this.call(metadata)));
  }

  @GrpcMethod('UserGroupService', 'ListUserGroups')
  async listUserGroups(request: ListUserGroupsRequest, metadata?: Metadata) {
    const page = await this.groups.list(request, await this.call(metadata));
    return toWire({ userGroups: page.items, nextPageToken: page.nextPageToken });
  }

  @GrpcMethod('UserGroupService', 'CreateUserGroup')
  async createUserGroup(request: CreateUserGroupRequest, metadata?: Metadata) {
    return toWire(await this.groups.create(request, await this.call(metadata)));
  }

  @GrpcMethod('UserGroupService', 'UpdateUserGroup')
  async updateUserGroup(request: UpdateUserGroupRequest, metadata?: Metadata) {
    const id = idOf(request.userGroup, 'user_group');
    const patch = maskedPatch(request.userGroup, request.updateMask, GROUP_FIELDS);
    return toWire(await this.groups.update(id, patch, await this.call(metadata)));
  }

  @GrpcMethod('UserGroupService', 'DeactivateUserGroup')
  async deactivateUserGroup(request: DeactivateUserGroupRequest, metadata?: Metadata) {
    await this.groups.deactivate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserGroupService', 'ActivateUserGroup')
  async activateUserGroup(request: ActivateUserGroupRequest, metadata?: Metadata) {
    await this.groups.activate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserGroupService', 'RemoveUserGroup')
  async removeUserGroup(request: RemoveUserGroupRequest, metadata?: Metadata) {
    await this.groups.remove(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserGroupService', 'AddMember')
  async addMember(request: MemberRequest, metadata?: Metadata) {
    await this.groups.addMember(request.groupId, request.userId, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserGroupService', 'RemoveMember')
  async removeMember(request: MemberRequest, metadata?: Metadata) {
    await this.groups.removeMember(request.groupId, request.userId, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('UserGroupService', 'ListMembers')
  async listMembers(request: ListMembersRequest, metadata?: Metadata) {
    const page = await this.groups.listMembers(request, await this.call(metadata));
    return toWire({ users: page.items, nextPageToken: page.nextPageToken });
  }

  @GrpcMethod('UserGroupService', 'SetUserGroups')
  async setUserGroups(request: SetUserGroupsRequest, metadata?: Metadata) {
    const userGroups = await this.groups.setUserGroups(request.userId, request.groupIds ?? [], await this.call(metadata));
    return toWire({ userGroups, nextPageToken: '' });
  }

  // ---- PermissionService --------------------------------------------------------------------

  @GrpcMethod('PermissionService', 'GetPermission')
  async getPermission(request: GetPermissionRequest, metadata?: Metadata) {
    return toWire(await this.permissions.get(request.id, await this.call(metadata)));
  }

  @GrpcMethod('PermissionService', 'ListPermissions')
  async listPermissions(request: ListPermissionsRequest, metadata?: Metadata) {
    const page = await this.permissions.list(request, await this.call(metadata));
    return toWire({ permissions: page.items, nextPageToken: page.nextPageToken });
  }

  @GrpcMethod('PermissionService', 'CreatePermission')
  async createPermission(request: CreatePermissionRequest, metadata?: Metadata) {
    return toWire(await this.permissions.create(request, await this.call(metadata)));
  }

  @GrpcMethod('PermissionService', 'UpdatePermission')
  async updatePermission(request: UpdatePermissionRequest, metadata?: Metadata) {
    const id = idOf(request.permission, 'permission');
    const patch = maskedPatch(request.permission, request.updateMask, PERMISSION_FIELDS);
    return toWire(await this.permissions.update(id, patch, await this.call(metadata)));
  }

  @GrpcMethod('PermissionService', 'DeactivatePermission')
  async deactivatePermission(request: DeactivatePermissionRequest, metadata?: Metadata) {
    await this.permissions.deactivate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('PermissionService', 'ActivatePermission')
  async activatePermission(request: ActivatePermissionRequest, metadata?: Metadata) {
    await this.permissions.activate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('PermissionService', 'RemovePermission')
  async removePermission(request: RemovePermissionRequest, metadata?: Metadata) {
    await this.permissions.remove(request.id, await this.call(metadata));
    return EMPTY;
  }

  // ---- ScopeService -------------------------------------------------------------------------

  @GrpcMethod('ScopeService', 'GetScope')
  async getScope(request: GetScopeRequest, metadata?: Metadata) {
    return toWire(await this.scopes.get(request.id, await this.call(metadata)));
  }

  @GrpcMethod('ScopeService', 'ListScopes')
  async listScopes(request: ListScopesRequest, metadata?: Metadata) {
    const page = await this.scopes.list(request, await this.call(metadata));
    return toWire({ scopes: page.items, nextPageToken: page.nextPageToken });
  }

  @GrpcMethod('ScopeService', 'CreateScope')
  async createScope(request: CreateScopeRequest, metadata?: Metadata) {
    return toWire(await this.scopes.create(request, await this.call(metadata)));
  }

  @GrpcMethod('ScopeService', 'UpdateScope')
  async updateScope(request: UpdateScopeRequest, metadata?: Metadata) {
    const id = idOf(request.scope, 'scope');
    const patch = maskedPatch(request.scope, request.updateMask, SCOPE_FIELDS);
    return toWire(await this.scopes.update(id, patch, await this.call(metadata)));
  }

  @GrpcMethod('ScopeService', 'DeactivateScope')
  async deactivateScope(request: DeactivateScopeRequest, metadata?: Metadata) {
    await this.scopes.deactivate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('ScopeService', 'ActivateScope')
  async activateScope(request: ActivateScopeRequest, metadata?: Metadata) {
    await this.scopes.activate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('ScopeService', 'RemoveScope')
  async removeScope(request: RemoveScopeRequest, metadata?: Metadata) {
    await this.scopes.remove(request.id, await this.call(metadata));
    return EMPTY;
  }

  // ---- CompanyService -----------------------------------------------------------------------

  @GrpcMethod('CompanyService', 'GetCompany')
  async getCompany(request: GetCompanyRequest, metadata?: Metadata) {
    return toWire(await this.companies.get(request, await this.call(metadata)));
  }

  @GrpcMethod('CompanyService', 'ListCompanies')
  async listCompanies(request: ListCompaniesRequest, metadata?: Metadata) {
    const page = await this.companies.list(request, await this.call(metadata));
    return toWire({ companies: page.items, nextPageToken: page.nextPageToken });
  }

  @GrpcMethod('CompanyService', 'CreateCompany')
  async createCompany(request: CreateCompanyRequest, metadata?: Metadata) {
    return toWire(await this.companies.create(request, await this.call(metadata)));
  }

  @GrpcMethod('CompanyService', 'UpdateCompany')
  async updateCompany(request: UpdateCompanyRequest, metadata?: Metadata) {
    const id = idOf(request.company, 'company');
    const patch = maskedPatch(request.company, request.updateMask, COMPANY_FIELDS);
    return toWire(await this.companies.update(id, patch, await this.call(metadata)));
  }

  @GrpcMethod('CompanyService', 'DeactivateCompany')
  async deactivateCompany(request: DeactivateCompanyRequest, metadata?: Metadata) {
    await this.companies.deactivate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('CompanyService', 'ActivateCompany')
  async activateCompany(request: ActivateCompanyRequest, metadata?: Metadata) {
    await this.companies.activate(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('CompanyService', 'RemoveCompany')
  async removeCompany(request: RemoveCompanyRequest, metadata?: Metadata) {
    await this.companies.remove(request.id, await this.call(metadata));
    return EMPTY;
  }

  // ---- GrantService -------------------------------------------------------------------------

  @GrpcMethod('GrantService', 'CreateGrant')
  async createGrant(request: CreateGrantRequest, metadata?: Metadata) {
    return toWire(await this.grants.create(request, await this.call(metadata)));
  }

  @GrpcMethod('GrantService', 'DeleteGrant')
  async deleteGrant(request: DeleteGrantRequest, metadata?: Metadata) {
    await this.grants.delete(request.id, await this.call(metadata));
    return EMPTY;
  }

  @GrpcMethod('GrantService', 'ListGrants')
  async listGrants(request: ListGrantsRequest, metadata?: Metadata) {
    const page = await this.grants.list(request, await this.call(metadata));
    return toWire({ grants: page.items, nextPageToken: page.nextPageToken });
  }
}

function checkInput(request: CheckRequest) {
  return {
    userId: request.userId,
    userKey: request.userKey,
    permission: request.permission,
    scopeId: request.scopeId,
  };
}
