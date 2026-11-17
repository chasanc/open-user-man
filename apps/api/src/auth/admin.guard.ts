import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../application/auth.service.js';
import type { SessionPayload } from './auth.constants.js';

/** Runs after JwtAuthGuard. The token proves sign-in; the admin API also needs oum.admin company-wide. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionPayload }>();
    // Checked on every request, so revoking oum.admin takes effect before the token expires.
    if (!request.user || !(await this.auth.isAdmin(request.user.sub, { source: 'rest' }))) {
      throw new ForbiddenException('The oum.admin permission is required');
    }
    return true;
  }
}
