import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppError, type AppErrorKind } from '../application/errors.js';

const STATUS: Record<AppErrorKind, HttpStatus> = {
  not_found: HttpStatus.NOT_FOUND,
  already_exists: HttpStatus.CONFLICT,
  invalid: HttpStatus.BAD_REQUEST,
  unauthenticated: HttpStatus.UNAUTHORIZED,
  permission_denied: HttpStatus.FORBIDDEN,
  failed_precondition: HttpStatus.PRECONDITION_FAILED,
};

/** The REST twin of GrpcErrorInterceptor: the same AppError, an HTTP status instead of a gRPC code. */
@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  catch(error: AppError, host: ArgumentsHost): void {
    const status = STATUS[error.kind];
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status,
      error: error.kind,
      message: error.message,
    });
  }
}
