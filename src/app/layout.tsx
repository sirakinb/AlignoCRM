import type { Metadata } from "next";
import { Providers } from "./providers";
import { getSiteUrl } from "@/lib/seo/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Aligno CRM | AI-Native Pipeline and Workflow Automation",
    template: "%s | Aligno CRM",
  },
  description:
    "Aligno CRM is an AI-native pipeline and workflow command center for service businesses.",
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
    <html lang="en">
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
