import { AppShell } from '@/components/app-shell';
import { localeLabels, locales, type Locale } from '@/i18n/config';
import { setLocale } from '@/i18n/set-locale';
import { getLocale, getTranslations } from 'next-intl/server';

export default async function LanguagePage() {
  const t = await getTranslations();
  const current = await getLocale();
  return (
    <AppShell title={t('LANGUAGE')}>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {t('LANGUAGES.CHOOSE')}
      </p>
      <div className="grid max-w-xl gap-3 sm:grid-cols-3">
        {locales.map((locale) => (
          <LocaleForm key={locale} locale={locale} current={current} />
        ))}
      </div>
    </AppShell>
  );
}

function LocaleForm({
  locale,
  current,
}: {
  locale: Locale;
  current: string;
}) {
  const action = setLocale.bind(null, locale);
  return (
    <form action={action}>
      <button
        type="submit"
        className={`w-full rounded-lg border px-4 py-8 text-sm font-medium ${
          current === locale
            ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
            : 'border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900'
        }`}
      >
        {localeLabels[locale]}
      </button>
    </form>
  );
}
