export function getAppUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }

  return "http://localhost:9000";
}

export function getPostAuthRedirectUrl(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getAppUrl()}${normalizedPath}`;
}
