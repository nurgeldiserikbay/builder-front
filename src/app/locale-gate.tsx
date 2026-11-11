"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { setCurrentLocale, type Locale } from "@/lib/i18n";

/**
 * The app screens are rendered in the browser only, so the language chosen in the cookie applies to every text from
 * the first paint and the server never renders a different language. The home page is rendered on the server.
 */
export default function LocaleGate({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  setCurrentLocale(locale);
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (pathname === "/" || mounted) return <>{children}</>;
  return null;
}
