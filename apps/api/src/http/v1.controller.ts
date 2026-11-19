import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AccessService, type CheckInput } from '../application/access.service.js';
import { listAudit, type AuditEntityType } from '../application/audit.js';
import { CompaniesService } from '../application/companies.service.js';
import { invalid } from '../application/errors.js';
import { GrantsService, type CreateGrantInput } from '../application/grants.service.js';
import { MfaService } from '../application/mfa.service.js';
import { OidcClientsService } from '../application/oidc-clients.service.js';
import { PermissionsService } from '../application/permissions.service.js';
import { ScopesService } from '../application/scopes.service.js';
import type { ServiceCall } from '../application/service-call.js';
import { UserGroupsService } from '../application/user-groups.service.js';
import { UsersService, type CreateUserInput } from '../application/users.service.js';
import { AdminGuard } from '../auth/admin.guard.js';
import type { SessionPayload } from '../auth/auth.constants.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

type Body_ = Record<string, unknown>;
type Paging = { companyId?: string; includeDeactivated?: string; pageSize?: string; pageToken?: string };

const ENTITY_TYPES: readonly AuditEntityType[] = [
  'user',
  'user_group',
  'company',
  'scope',
  'permission',
  'grant',
  'user_group_member',
  'oidc_client',
];

/** The signed-in admin behind a REST call, so the change history knows who did it. */
const as = (session: SessionPayload): ServiceCall => ({ source: 'rest', actorUserId: session.sub });

const paging = (query: Paging) => ({
  companyId: query.companyId,
  includeDeactivated: query.includeDeactivated === 'true',
  pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  pageToken: query.pageToken,
});

/** Lists answer with the same `items` + `nextPageToken` shape everywhere. */
const asList = <T>(page: { items: T[]; nextPageToken: string }) => page;

@ApiTags('v1')
@ApiCookieAuth(undefined)
@Controller('v1')
@UseGuards(JwtAuthGuard, AdminGuard)
export class V1Controller {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly companies: CompaniesService,
    private readonly users: UsersService,
    private readonly groups: UserGroupsService,
    private readonly permissions: PermissionsService,
    private readonly oidcClients: OidcClientsService,
    private readonly mfa: MfaService,
    private readonly scopes: ScopesService,
    private readonly grants: GrantsService,
    private readonly access: AccessService,
  ) {}

  // ---- companies ----------------------------------------------------------------------------

  @Get('companies')
  async listCompanies(@Query() query: Paging, @CurrentUser() s: SessionPayload) {
    return asList(await this.companies.list(paging(query), as(s)));
  }

  @Get('companies/:id')
  getCompany(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.companies.get({ id }, as(s));
  }

  @Post('companies')
  createCompany(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.companies.create(body as never, as(s));
  }

  @Patch('companies/:id')
  updateCompany(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.companies.update(id, body, as(s));
  }

  @Post('companies/:id/deactivate')
  @HttpCode(204)
  async deactivateCompany(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.companies.deactivate(id, as(s));
  }

  @Post('companies/:id/activate')
  @HttpCode(204)
  async activateCompany(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.companies.activate(id, as(s));
  }

  @Delete('companies/:id')
  @HttpCode(204)
  async removeCompany(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.companies.remove(id, as(s));
  }

  // ---- users --------------------------------------------------------------------------------

  @Get('users')
  async listUsers(@Query() query: Paging & { q?: string }, @CurrentUser() s: SessionPayload) {
    return asList(await this.users.list({ ...paging(query), query: query.q }, as(s)));
  }

  @Get('users/:id')
  getUser(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.users.get({ id }, as(s));
  }

  @Post('users')
  createUser(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.users.create(body as unknown as CreateUserInput, as(s));
  }

  @Patch('users/:id')
  updateUser(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.users.update(id, body, as(s));
  }

  @Post('users/:id/deactivate')
  @HttpCode(204)
  async deactivateUser(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.users.deactivate(id, as(s));
  }

  @Post('users/:id/activate')
  @HttpCode(204)
  async activateUser(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.users.activate(id, as(s));
  }

  @Delete('users/:id')
  @HttpCode(204)
  async removeUser(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.users.remove(id, as(s));
  }

  @Put('users/:id/password')
  @HttpCode(204)
  async setPassword(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    await this.users.setPassword(id, typeof body.password === 'string' ? body.password : '', as(s));
  }

  // ---- two-step verification (an administrator sets it up with the user, or resets it) -------

  @Get('users/:id/mfa')
  mfaStatus(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.mfa.status(id, as(s));
  }

  /** The answer carries the shared secret; it is shown this once. */
  @Post('users/:id/mfa/enrol')
  @HttpCode(200)
  mfaEnrol(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.mfa.enrol(id, as(s));
  }

  /** The answer carries the recovery codes; they are shown this once. */
  @Post('users/:id/mfa/confirm')
  @HttpCode(200)
  mfaConfirm(@Param('id') id: string, @Body() body: { code?: string }, @CurrentUser() s: SessionPayload) {
    return this.mfa.confirm(id, body.code ?? '', as(s));
  }

  @Delete('users/:id/mfa')
  @HttpCode(204)
  async mfaReset(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.mfa.reset(id, as(s));
  }

  @Get('users/:id/groups')
  async userGroups(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return asList(await this.groups.list({ userId: id, pageSize: 200 }, as(s)));
  }

  @Put('users/:id/groups')
  async setUserGroups(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    if (!Array.isArray(body.groupIds)) throw invalid('groupIds must be a list of group ids');
    return { items: await this.groups.setUserGroups(id, body.groupIds.map(String), as(s)), nextPageToken: '' };
  }

  /** Everything the user holds, directly and through groups. */
  @Get('users/:id/grants')
  async effectiveGrants(@Param('id') id: string, @Query('scopeId') scopeId: string | undefined, @CurrentUser() s: SessionPayload) {
    return { items: await this.access.listGrantsForUser({ userId: id, scopeId }, as(s)), nextPageToken: '' };
  }

  // ---- groups -------------------------------------------------------------------------------

  @Get('groups')
  async listGroups(@Query() query: Paging, @CurrentUser() s: SessionPayload) {
    return asList(await this.groups.list(paging(query), as(s)));
  }

  @Get('groups/:id')
  getGroup(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.groups.get(id, as(s));
  }

  @Post('groups')
  createGroup(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.groups.create(body as never, as(s));
  }

  @Patch('groups/:id')
  updateGroup(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.groups.update(id, body, as(s));
  }

  @Post('groups/:id/deactivate')
  @HttpCode(204)
  async deactivateGroup(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.groups.deactivate(id, as(s));
  }

  @Post('groups/:id/activate')
  @HttpCode(204)
  async activateGroup(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.groups.activate(id, as(s));
  }

  @Delete('groups/:id')
  @HttpCode(204)
  async removeGroup(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.groups.remove(id, as(s));
  }

  @Get('groups/:id/members')
  async members(@Param('id') id: string, @Query() query: Paging, @CurrentUser() s: SessionPayload) {
    return asList(await this.groups.listMembers({ groupId: id, ...paging(query) }, as(s)));
  }

  @Put('groups/:id/members/:userId')
  @HttpCode(204)
  async addMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() s: SessionPayload) {
    await this.groups.addMember(id, userId, as(s));
  }

  @Delete('groups/:id/members/:userId')
  @HttpCode(204)
  async removeMember(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() s: SessionPayload) {
    await this.groups.removeMember(id, userId, as(s));
  }

  // ---- applications (OpenID Connect clients) --------------------------------------------------

  @Get('applications')
  async listApplications(@Query() query: Paging & { q?: string }, @CurrentUser() s: SessionPayload) {
    return asList(await this.oidcClients.list({ ...paging(query), query: query.q }, as(s)));
  }

  @Get('applications/:id')
  getApplication(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.oidcClients.get(id, as(s));
  }

  /** The answer carries the client secret; it is shown this once. */
  @Post('applications')
  createApplication(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.oidcClients.create(body as never, as(s));
  }

  @Patch('applications/:id')
  updateApplication(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.oidcClients.update(id, body, as(s));
  }

  @Post('applications/:id/rotate-secret')
  @HttpCode(200)
  rotateApplicationSecret(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.oidcClients.rotateSecret(id, as(s));
  }

  @Post('applications/:id/deactivate')
  @HttpCode(204)
  async deactivateApplication(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.oidcClients.deactivate(id, as(s));
  }

  @Post('applications/:id/activate')
  @HttpCode(204)
  async activateApplication(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.oidcClients.activate(id, as(s));
  }

  @Delete('applications/:id')
  @HttpCode(204)
  async removeApplication(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.oidcClients.remove(id, as(s));
  }

  // ---- permissions and scopes ---------------------------------------------------------------

  @Get('permissions')
  async listPermissions(@Query() query: Paging & { q?: string }, @CurrentUser() s: SessionPayload) {
    return asList(await this.permissions.list({ ...paging(query), query: query.q }, as(s)));
  }

  @Get('permissions/:id')
  getPermission(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.permissions.get(id, as(s));
  }

  @Post('permissions')
  createPermission(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.permissions.create(body as never, as(s));
  }

  @Patch('permissions/:id')
  updatePermission(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.permissions.update(id, body, as(s));
  }

  @Post('permissions/:id/deactivate')
  @HttpCode(204)
  async deactivatePermission(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.permissions.deactivate(id, as(s));
  }

  @Post('permissions/:id/activate')
  @HttpCode(204)
  async activatePermission(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.permissions.activate(id, as(s));
  }

  @Delete('permissions/:id')
  @HttpCode(204)
  async removePermission(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.permissions.remove(id, as(s));
  }

  @Get('scopes')
  async listScopes(@Query() query: Paging & { parentId?: string }, @CurrentUser() s: SessionPayload) {
    return asList(await this.scopes.list({ ...paging(query), parentId: query.parentId }, as(s)));
  }

  @Get('scopes/:id')
  getScope(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    return this.scopes.get(id, as(s));
  }

  @Post('scopes')
  createScope(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.scopes.create(body as never, as(s));
  }

  @Patch('scopes/:id')
  updateScope(@Param('id') id: string, @Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.scopes.update(id, body, as(s));
  }

  @Post('scopes/:id/deactivate')
  @HttpCode(204)
  async deactivateScope(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.scopes.deactivate(id, as(s));
  }

  @Post('scopes/:id/activate')
  @HttpCode(204)
  async activateScope(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.scopes.activate(id, as(s));
  }

  @Delete('scopes/:id')
  @HttpCode(204)
  async removeScope(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.scopes.remove(id, as(s));
  }

  // ---- grants and checks --------------------------------------------------------------------

  @Get('grants')
  async listGrants(
    @Query() query: Paging & { userId?: string; groupId?: string; permissionId?: string; scopeId?: string },
    @CurrentUser() s: SessionPayload,
  ) {
    return asList(await this.grants.list({ ...query, ...paging(query) }, as(s)));
  }

  @Post('grants')
  createGrant(@Body() body: Body_, @CurrentUser() s: SessionPayload) {
    return this.grants.create(body as CreateGrantInput, as(s));
  }

  @Delete('grants/:id')
  @HttpCode(204)
  async deleteGrant(@Param('id') id: string, @CurrentUser() s: SessionPayload) {
    await this.grants.delete(id, as(s));
  }

  @Post('check')
  @HttpCode(200)
  check(@Body() body: CheckInput, @CurrentUser() s: SessionPayload) {
    return this.access.check(body, as(s));
  }

  @Post('check/batch')
  @HttpCode(200)
  async batchCheck(@Body() body: { checks?: CheckInput[] }, @CurrentUser() s: SessionPayload) {
    if (!Array.isArray(body.checks)) throw invalid('checks must be a list');
    return { results: await this.access.batchCheck(body.checks, as(s)) };
  }

  // ---- history ------------------------------------------------------------------------------

  @Get('audit-log')
  async auditLog(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    if (!ENTITY_TYPES.includes(entityType as AuditEntityType) || !entityId) {
      throw invalid('entityType and entityId are required');
    }
    return { entries: await listAudit(this.db, entityType as AuditEntityType, entityId) };
  }
}
