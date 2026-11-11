import type { Metadata } from 'next';
import './globals.css';
import TelegramBridge from './telegram-bridge';
import ConsentGate from './consent-gate';
import LocaleGate from './locale-gate';
import { tl } from '@/lib/i18n';
import { requestLocale } from '@/lib/request-locale';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: tl(locale, 'BuildPath — создайте сайт шаг за шагом'),
    description: tl(locale, 'Облачная мастерская, которая помогает пройти путь от идеи до готового сайта.'),
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = await requestLocale();
  return (
    <html lang={locale}>
      <body><LocaleGate locale={locale}><TelegramBridge />{children}<ConsentGate /></LocaleGate></body>
    </html>
  );
}
