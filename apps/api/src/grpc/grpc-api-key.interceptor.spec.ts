import { ConfigService } from '@nestjs/config';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { GrpcApiKeyInterceptor } from './grpc-api-key.interceptor.js';

describe('GrpcApiKeyInterceptor', () => {
  const next = { handle: () => of('ok') } as CallHandler;

  function rpcContext(metadata: Metadata): ExecutionContext {
    return {
      getType: () => 'rpc',
      switchToRpc: () => ({ getContext: () => metadata }),
    } as unknown as ExecutionContext;
  }

  function configReturning(value: string): ConfigService {
    return { getOrThrow: () => value } as unknown as ConfigService;
  }

  it('skips HTTP', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning('secret'));
    const http = {
      getType: () => 'http',
    } as unknown as ExecutionContext;
    expect(interceptor.intercept(http, next)).toBeDefined();
  });

  it('allows empty GRPC_API_KEY', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning(''));
    const metadata = new Metadata();
    expect(() => interceptor.intercept(rpcContext(metadata), next)).not.toThrow();
  });

  it('rejects a missing key when configured', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning('secret'));
    expect(() =>
      interceptor.intercept(rpcContext(new Metadata()), next),
    ).toThrow(/invalid api key/);
  });

  it('accepts x-api-key metadata', () => {
    const interceptor = new GrpcApiKeyInterceptor(configReturning('secret'));
    const metadata = new Metadata();
    metadata.set('x-api-key', 'secret');
    expect(() => interceptor.intercept(rpcContext(metadata), next)).not.toThrow();
  });
});
