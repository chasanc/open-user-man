export const AUTH_COOKIE = 'oum_token';

export type SessionPayload = {
  sub: string;
  userName: string;
  userKey: string;
  companyId: string;
};

export function authCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
  };
}

export function jwtExpiresInSeconds(value: string | undefined): number {
  const match = /^(\d+)([smhd])$/i.exec((value ?? '').trim());
  if (!match) {
    throw new Error('JWT_EXPIRES_IN must be a number with suffix s, m, h, or d');
  }
  const amount = Number(match[1]);
  switch (match[2].toLowerCase()) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 3_600;
    case 'd':
      return amount * 86_400;
    default:
      throw new Error('JWT_EXPIRES_IN must be a number with suffix s, m, h, or d');
  }
}

