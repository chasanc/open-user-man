import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { isLocale, LOCALE_COOKIE, type Locale } from './config';

function fallbackLocale(): Locale {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_LOCALE;
  if (!isLocale(fromEnv)) {
    throw new Error(
      'NEXT_PUBLIC_DEFAULT_LOCALE must be set in apps/web/.env to a supported locale',
    );
  }
  return fromEnv;
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : fallbackLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
