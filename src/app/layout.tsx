import type { Metadata } from "next";
import { getAuthFromCookies } from "@insforge/nextjs";
import { Providers } from "./providers";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlignoCRM",
  description: "AI-native pipeline and workflow command center",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = await getAuthFromCookies();

  return (
    <html lang="en">
      <body className="antialiased">
        <Providers initialState={initialState}>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
