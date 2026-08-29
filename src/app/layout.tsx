import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "Searchlight — SEO Opportunity Analyzer",
    template: "%s · Searchlight",
  },
  description:
    "Find evidence-backed SEO opportunities using website, search, competitor, and keyword research.",
  openGraph: {
    type: "website",
    title: "Searchlight — SEO Opportunity Analyzer",
    description: "Discover where your website can win in search.",
    images: [{ url: "/og.png", width: 1718, height: 900, alt: "Searchlight SEO Opportunity Analyzer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Searchlight — SEO Opportunity Analyzer",
    description: "Discover where your website can win in search.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
