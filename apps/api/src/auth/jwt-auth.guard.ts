import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AUTH_COOKIE, type SessionPayload } from './auth.constants.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionPayload }>();
    const bearer = /^Bearer (.+)$/i.exec(request.headers.authorization ?? '');
    const token = request.cookies?.[AUTH_COOKIE] ?? bearer?.[1];
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Not signed in');
    }
    try {
      request.user = this.jwt.verify<SessionPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException('Not signed in');
    }
  }
}
