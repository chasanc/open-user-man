import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { LogoutButton } from '@/components/logout-button';
import { getTranslations } from 'next-intl/server';

const links = [
  { href: '/', key: 'HOME' },
  { href: '/user', key: 'USER' },
  { href: '/usergroup', key: 'USERGROUP' },
  { href: '/permission', key: 'PERMISSION' },
  { href: '/company', key: 'COMPANY' },
  { href: '/scope', key: 'SCOPE' },
  { href: '/language', key: 'LANGUAGE' },
  { href: '/about', key: 'ABOUT' },
] as const;

/** Menu entries shown before sign-in. */
const publicLinks = new Set(['/language', '/about']);

const linkClass =
  'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50';

export async function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const t = await getTranslations();
  // shortcut: cookie presence only, an expired token shows Logout until a page call returns 401.
  const loggedIn = (await cookies()).has('oum_token');
  return (
    <div className="min-h-full bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            {t('PRODUCT')}
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            {links
              .filter((link) => loggedIn || publicLinks.has(link.href))
              .map((link) => (
                <Link key={link.href} href={link.href} className={linkClass}>
                  {t(link.key)}
                </Link>
              ))}
            {loggedIn ? (
              <LogoutButton className={linkClass} />
            ) : (
              <Link href="/login" className={linkClass}>
                {t('LOGIN')}
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
