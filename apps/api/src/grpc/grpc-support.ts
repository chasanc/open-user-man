import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { Metadata } from '@grpc/grpc-js';
import { catchError, type Observable, throwError } from 'rxjs';
import { AppError, type AppErrorKind } from '../application/errors.js';

const CODES: Record<AppErrorKind, GrpcStatus> = {
  not_found: GrpcStatus.NOT_FOUND,
  already_exists: GrpcStatus.ALREADY_EXISTS,
  invalid: GrpcStatus.INVALID_ARGUMENT,
  unauthenticated: GrpcStatus.UNAUTHENTICATED,
  permission_denied: GrpcStatus.PERMISSION_DENIED,
  failed_precondition: GrpcStatus.FAILED_PRECONDITION,
};

/** Turns an AppError into the matching gRPC status; anything else is INTERNAL with no details. */
@Injectable()
export class GrpcErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') return next.handle();
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof AppError) {
          return throwError(() => new RpcException({ code: CODES[error.kind], message: error.message }));
        }
        if (error instanceof RpcException) return throwError(() => error);
        console.error(error);
        return throwError(() => new RpcException({ code: GrpcStatus.INTERNAL, message: 'Internal error' }));
      }),
    );
  }
}

export function metadataValue(metadata: Metadata | undefined, key: string): string {
  const value = metadata?.get?.(key)?.[0];
  if (value == null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}

/**
 * The grpc-js server wants Timestamps as { seconds, nanos } and no `undefined` values.
 * Services return Dates, so convert on the way out.
 */
export function toWire<T>(value: T): T {
  if (value instanceof Date) {
    const ms = value.getTime();
    return { seconds: Math.floor(ms / 1000), nanos: (ms % 1000) * 1_000_000 } as T;
  }
  if (Array.isArray(value)) return value.map(toWire) as T;
  if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = toWire(item);
    }
    return out as T;
  }
  return value;
}

/** The loader delivers a FieldMask as { paths }; the generated types say string[]. Accept both. */
export function maskPaths(mask: unknown): string[] {
  const paths = Array.isArray(mask) ? mask : (mask as { paths?: unknown } | undefined)?.paths;
  return Array.isArray(paths) ? paths.map(String) : [];
}

const camel = (path: string) => path.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * Builds the update patch: only the masked fields, read from the resource. An empty mask
 * is rejected so an update never silently does nothing. Names are camelCase or snake_case.
 */
export function maskedPatch(
  resource: object | undefined,
  mask: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  const paths = maskPaths(mask).map(camel);
  if (!resource || paths.length === 0) {
    throw new AppError('invalid', 'update_mask must list the fields to change');
  }
  const patch: Record<string, unknown> = {};
  for (const path of paths) {
    if (!allowed.includes(path)) throw new AppError('invalid', `${path} cannot be updated`);
    const value = (resource as Record<string, unknown>)[path];
    // proto3 leaves a false bool off the wire, so a masked `active` that is missing means false.
    patch[path] = path === 'active' ? Boolean(value) : (value ?? null);
  }
  return patch;
}
