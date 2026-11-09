import type { Metadata } from 'next';
import './globals.css';
import TelegramBridge from './telegram-bridge';

export const metadata: Metadata = {
  title: 'BuildPath — создайте сайт шаг за шагом',
  description: 'Облачная мастерская, которая помогает пройти путь от идеи до готового сайта.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body><TelegramBridge />{children}</body>
    </html>
  );
}
