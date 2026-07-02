import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { getSiteUrl } from "@/lib/seo/site-url";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Aligno CRM | A Lightweight CRM for Service Businesses",
    template: "%s | Aligno CRM",
  },
  description:
    "Aligno CRM is a focused contact and pipeline workspace for service businesses.",
  applicationName: "Aligno CRM",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
