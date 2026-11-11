import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, localeFromAcceptLanguage, parseLocale, type Locale } from './i18n';

/** The chosen language, or the browser's for a first visit. Server only. */
export async function requestLocale(): Promise<Locale> {
  const saved = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return saved ?? localeFromAcceptLanguage((await headers()).get('accept-language'));
}
