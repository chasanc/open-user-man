import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { User } from '@oum/proto';
import type { Request, Response } from 'express';
import { AuthService } from '../application/auth.service.js';
import { MfaService } from '../application/mfa.service.js';
import { UsersService } from '../application/users.service.js';
import { AUTH_COOKIE, authCookieOptions, type SessionPayload } from './auth.constants.js';
import { CurrentUser } from './current-user.decorator.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { LoginRateLimiter } from './login-rate-limiter.js';

type LoginBody = { username?: string; userKey?: string; password?: string; companyId?: string; code?: string };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly loginLimit: LoginRateLimiter,
    private readonly mfa: MfaService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Sets the httpOnly oum_token cookie. Needs a valid password and oum.admin.' })
  @ApiUnauthorizedResponse()
  async login(
    @Body() body: LoginBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<User> {
    const { user, token } = await this.signIn(body, request);
    response.cookie(AUTH_COOKIE, token, authCookieOptions(this.config.getOrThrow<boolean>('cookieSecure')));
    return user;
  }

  /** For integrators without a cookie jar: same checks as login, token in the body, no cookie. */
  @Post('token')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Returns { accessToken, tokenType: "Bearer" }. Needs a valid password and oum.admin.' })
  @ApiUnauthorizedResponse()
  async token(
    @Body() body: LoginBody,
    @Req() request: Request,
  ): Promise<{ accessToken: string; tokenType: 'Bearer' }> {
    const { token } = await this.signIn(body, request);
    return { accessToken: token, tokenType: 'Bearer' };
  }

  private async signIn(body: LoginBody, request: Request): Promise<{ user: User; token: string }> {
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    if (!this.loginLimit.allow(ip, body.username ?? body.userKey ?? '')) {
      throw new HttpException('Too many login attempts', HttpStatus.TOO_MANY_REQUESTS);
    }
    const call = { source: 'rest' as const };
    const user = await this.auth.authenticate({ ...body, password: body.password ?? '' }, call);
    await this.mfa.gate(user, body.code);
    // A right password is not enough for the admin UI; the user must also hold oum.admin.
    if (!(await this.auth.isAdmin(user.id, call))) {
      throw new ForbiddenException('The oum.admin permission is required');
    }
    const token = await this.jwt.signAsync({
      sub: user.id,
      userName: user.username,
      userKey: user.userKey,
      companyId: user.companyId,
    } satisfies SessionPayload);
    return { user, token };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) response: Response): Promise<{ ok: true }> {
    response.clearCookie(AUTH_COOKIE, authCookieOptions(this.config.getOrThrow<boolean>('cookieSecure')));
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() session: SessionPayload): Promise<User> {
    return this.users.get({ id: session.sub }, { source: 'rest' });
  }
}
