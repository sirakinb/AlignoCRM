import { InsforgeMiddleware } from "@insforge/nextjs/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const insforgeMiddleware = InsforgeMiddleware({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  publicRoutes: ["/sign-in", "/sign-up"],
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
  afterSignInUrl: "/",
  useBuiltInAuth: false,
});

export default function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // Handle PKCE OAuth callback: insforge_code must be processed client-side by the SDK.
  // Pass through without auth check so the SDK can exchange the code for tokens.
  if (searchParams.get("insforge_code")) {
    return NextResponse.next();
  }

  // Handle legacy OAuth callback: access_token/user_id/email come directly in URL.
  // Middleware sets cookies, then redirects to dashboard.
  if (
    searchParams.get("access_token") &&
    searchParams.get("user_id") &&
    searchParams.get("email")
  ) {
    const cookieResponse = insforgeMiddleware(request);

    const redirectUrl = new URL("/", request.url);
    const redirect = NextResponse.redirect(redirectUrl);

    for (const cookie of cookieResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }

    return redirect;
  }

  return insforgeMiddleware(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
