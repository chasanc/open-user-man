import { redirect } from 'next/navigation';
import { serverApi } from './server-api';
import type { Page } from './types';

/** A signed-out or non-admin session goes back to the login page. */
async function authed<T>(path: string): Promise<T> {
  const { status, data } = await serverApi<T>(path);
  if (status === 401 || status === 403) redirect('/login');
  return data as T;
}

export async function listOf<T>(resource: string): Promise<T[]> {
  // The API caps a page at 200 rows; follow the token so big lists arrive whole.
  const items: T[] = [];
  let token = '';
  do {
    const page = await authed<Page<T>>(`/v1/${resource}?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`);
    items.push(...(page?.items ?? []));
    token = page?.nextPageToken ?? '';
  } while (token);
  return items;
}

export async function myCompanyId(): Promise<string> {
  const { data } = await serverApi<{ companyId: string }>('/auth/me');
  // Any non-OK answer (a cookie for a user that no longer exists gives 404) means sign in again.
  if (!data) redirect('/login');
  return data.companyId;
}
