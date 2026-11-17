import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status as GrpcStatus } from '@grpc/grpc-js';
import type { Metadata } from '@grpc/grpc-js';
import type { Observable } from 'rxjs';

@Injectable()
export class GrpcApiKeyInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'rpc') {
      return next.handle();
    }
    const expected = this.config.getOrThrow<string>('grpcApiKey');
    if (!expected) {
      return next.handle();
    }
    const metadata = context.switchToRpc().getContext<Metadata>();
    const provided = firstMetadata(metadata, 'x-api-key');
    if (provided !== expected) {
      throw new RpcException({
        code: GrpcStatus.UNAUTHENTICATED,
        message: 'invalid api key',
      });
    }
    return next.handle();
  }
}

function firstMetadata(metadata: Metadata | undefined, key: string): string {
  const value = metadata?.get?.(key)?.[0];
  if (value == null) {
    return '';
  }
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
}
