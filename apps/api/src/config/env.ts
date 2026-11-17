import { parseDatabaseKind } from '@oum/domain';
import { apiEnv } from './load-env.js';

const env = apiEnv();

/** Express `trust proxy`: unset/false = off, "true", a hop count, or a name like "loopback". */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  const v = (value ?? '').trim();
  if (v === '' || v === 'false') return false;
  if (v === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}

export default function loadEnv() {
  return {
    httpHost: env.HTTP_HOST,
    httpPort: Number(env.HTTP_PORT),
    grpcPort: Number(env.GRPC_PORT),
    grpcTls: env.GRPC_TLS === 'true',
    grpcTlsCa: env.GRPC_TLS_CA,
    grpcTlsCert: env.GRPC_TLS_CERT,
    grpcTlsKey: env.GRPC_TLS_KEY,
    grpcTlsRequireClientCert: env.GRPC_TLS_REQUIRE_CLIENT_CERT === 'true',
    grpcApiKey: env.GRPC_API_KEY,
    databaseKind: parseDatabaseKind(env.DATABASE_KIND),
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    cookieSecure: env.COOKIE_SECURE === 'true',
    multiCompanyMode: env.MULTI_COMPANY_MODE === 'true',
    rateLimitEnabled: env.RATE_LIMIT_ENABLED === 'true',
    rateLimitMax: Number(env.RATE_LIMIT_MAX),
    rateLimitWindowSeconds: Number(env.RATE_LIMIT_WINDOW_SECONDS),
    loginRateLimitMax: Number(env.LOGIN_RATE_LIMIT_MAX ?? 10),
    dbPoolMax: Number(env.DB_POOL_MAX ?? 20),
    dbConnectTimeoutMs: Number(env.DB_CONNECT_TIMEOUT_MS ?? 5000),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    corsOrigin: env.CORS_ORIGIN,
    logLevel: env.LOG_LEVEL,
  };
}
