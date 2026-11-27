import type { Metadata } from "next";

/** A shared concept is for the people it was sent to: search engines do not list it. */
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function SharedConceptLayout({ children }: { children: React.ReactNode }) {
  return children;
}
