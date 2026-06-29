const ADMIN_EMAILS = new Set([
  "aki.b@pentridgemedia.com",
  "sirakinb@gmail.com",
]);

const SUBSCRIPTION_BYPASS_EMAILS = new Set([
  ...ADMIN_EMAILS,
  "dropcardai@gmail.com",
  "bajulaiye@protonmail.com",
  "raichellaram@gmail.com",
  "08lin.kevin121@gmail.com",
  "tyronepeace.qa@gmail.com",
  "jyho0243@gmail.com",
  "astrid.nigrovic@gmail.com",
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

export function hasSubscriptionBypass(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  return SUBSCRIPTION_BYPASS_EMAILS.has(email.toLowerCase());
}
