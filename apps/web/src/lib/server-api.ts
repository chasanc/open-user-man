import { cookies } from 'next/headers';
import { apiOrigin } from './api';

export async function serverApi<T>(
  path: string,
): Promise<{ status: number; data: T | null }> {
  const cookieHeader = (await cookies()).toString();
  const response = await fetch(`${apiOrigin()}${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!response.ok) {
    return { status: response.status, data: null };
  }
  return { status: response.status, data: (await response.json()) as T };
}
