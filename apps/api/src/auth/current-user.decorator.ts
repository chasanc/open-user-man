import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { SessionPayload } from './auth.constants.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): SessionPayload => {
    const request = context.switchToHttp().getRequest<Request & { user?: SessionPayload }>();
    if (!request.user) {
      throw new Error('JwtAuthGuard must run before CurrentUser');
    }
    return request.user;
  },
);
