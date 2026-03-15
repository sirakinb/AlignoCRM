import { getAuthFromCookies } from "@insforge/nextjs";
import { Providers } from "../providers";
import { AppShell } from "@/components/layout/app-shell";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = await getAuthFromCookies();

  return (
    <Providers initialState={initialState}>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
