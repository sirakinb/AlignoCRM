import { getAuthFromCookies } from "@insforge/nextjs";
import { Providers } from "../providers";

export default async function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialState = await getAuthFromCookies();

  return <Providers initialState={initialState}>{children}</Providers>;
}
