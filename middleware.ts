import { InsforgeMiddleware } from "@insforge/nextjs/middleware";

export default InsforgeMiddleware({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  publicRoutes: ["/sign-in", "/sign-up"],
  signInUrl: "/sign-in",
  signUpUrl: "/sign-up",
  afterSignInUrl: "/",
  useBuiltInAuth: false,
});

export const config = {
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
