import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './globals.css';
import TelegramBridge from './telegram-bridge';
import ConsentGate from './consent-gate';
import LocaleGate from './locale-gate';
import { PwaRegistration } from './pwa';
import { tl } from '@/lib/i18n';
import { requestLocale } from '@/lib/request-locale';

/** The phone's status bar and the installed app take the colour of the app frame. */
export const viewport: Viewport = { themeColor: '#141b2d', width: 'device-width', initialScale: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: tl(locale, 'BuildPath — создайте сайт шаг за шагом'),
    description: tl(locale, 'Облачная мастерская, которая помогает пройти путь от идеи до готового сайта.'),
    appleWebApp: { capable: true, title: 'BuildPath', statusBarStyle: 'black-translucent' },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <body><LocaleGate locale={locale}><TelegramBridge /><PwaRegistration />{children}<ConsentGate /></LocaleGate></body>
    </html>
  );
}
