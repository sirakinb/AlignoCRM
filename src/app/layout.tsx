import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AlignoCRM",
  description: "AI-native pipeline and workflow command center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
