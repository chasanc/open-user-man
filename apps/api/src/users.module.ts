import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AccessService } from './application/access.service.js';
import { AuthService } from './application/auth.service.js';
import { CompaniesService } from './application/companies.service.js';
import { Tenancy } from './application/common.js';
import { GrantsService } from './application/grants.service.js';
import { PasswordService } from './application/password.service.js';
import { PermissionsService } from './application/permissions.service.js';
import { ScopesService } from './application/scopes.service.js';
import { UserGroupsService } from './application/user-groups.service.js';
import { UsersService } from './application/users.service.js';
import { AdminGuard } from './auth/admin.guard.js';
import { AuthController } from './auth/auth.controller.js';
import { jwtExpiresInSeconds } from './auth/auth.constants.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { LoginRateLimiter } from './auth/login-rate-limiter.js';
import { GrpcApiKeyInterceptor } from './grpc/grpc-api-key.interceptor.js';
import { OumGrpcController } from './grpc/oum.grpc.controller.js';
import { AppErrorFilter } from './http/app-error.filter.js';
import { V1Controller } from './http/v1.controller.js';

// REST and gRPC are two thin layers over the same application services.
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwtSecret'),
        signOptions: {
          expiresIn: jwtExpiresInSeconds(config.getOrThrow<string>('jwtExpiresIn')),
        },
      }),
    }),
  ],
  controllers: [AuthController, V1Controller, OumGrpcController],
  providers: [
    { provide: APP_FILTER, useClass: AppErrorFilter },
    Tenancy,
    PasswordService,
    AccessService,
    AuthService,
    UsersService,
    UserGroupsService,
    PermissionsService,
    ScopesService,
    CompaniesService,
    GrantsService,
    JwtAuthGuard,
    AdminGuard,
    GrpcApiKeyInterceptor,
    LoginRateLimiter,
  ],
  exports: [JwtModule],
})
export class UsersModule {}
