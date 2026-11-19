import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ServerCredentials } from '@grpc/grpc-js';
import { AppModule } from './app.module.js';
import { createRateLimitMiddleware } from './http/rate-limit.middleware.js';
import { mountOidc } from './infrastructure/oidc/mount-oidc.js';

const withDatabase = Boolean(process.env.DATABASE_URL);

const protoPath = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../packages/proto/open-user-management.proto',
);

function grpcTls(config: ConfigService): ServerCredentials {
  if (!config.getOrThrow<boolean>('grpcTls')) {
    return ServerCredentials.createInsecure();
  }
  const certPath = config.getOrThrow<string>('grpcTlsCert');
  const keyPath = config.getOrThrow<string>('grpcTlsKey');
  const caPath = config.getOrThrow<string>('grpcTlsCa');
  const rootCerts = caPath ? readFileSync(caPath) : null;
  return ServerCredentials.createSsl(
    rootCerts,
    [{ cert_chain: readFileSync(certPath), private_key: readFileSync(keyPath) }],
    config.getOrThrow<boolean>('grpcTlsRequireClientCert'),
  );
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  const httpHost = config.getOrThrow<string>('httpHost');
  const httpPort = config.getOrThrow<number>('httpPort');
  const grpcPort = config.getOrThrow<number>('grpcPort');
  const corsOrigin = config.getOrThrow<string>('corsOrigin');

  // Without this, req.ip is the proxy address and every client shares one rate-limit bucket.
  app.getHttpAdapter().getInstance().set('trust proxy', config.getOrThrow('trustProxy'));
  // Before the body parsers and the global rate limiter below: the provider reads its own bodies.
  if (withDatabase) mountOidc(app);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.use(
    createRateLimitMiddleware({
      enabled: config.getOrThrow<boolean>('rateLimitEnabled'),
      max: config.getOrThrow<number>('rateLimitMax'),
      windowSeconds: config.getOrThrow<number>('rateLimitWindowSeconds'),
    }),
  );
  app.enableCors({ origin: corsOrigin, credentials: true });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Open User Man')
    .setDescription('REST admin API. Same application services as gRPC oum.v1.')
    .setVersion('0.0.1')
    .addCookieAuth('oum_token')
    .build();
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
    { useGlobalPrefix: true },
  );

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'oum.v1',
      // One package, eight services; Nest registers every service the controller handles.
      protoPath,
      url: `${httpHost}:${grpcPort}`,
      credentials: grpcTls(config),
    },
  });

  await app.startAllMicroservices();
  await app.listen(httpPort, httpHost);
}

await bootstrap();
