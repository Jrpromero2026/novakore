import "server-only";

/**
 * The absolute origin to send people back to in emailed links.
 *
 * Magic links and password recovery both leave the app and must return to a
 * real URL. Getting this wrong is not cosmetic: the link is the entire flow,
 * and a wrong origin means the email is useless.
 *
 * Resolution order, most explicit first:
 *
 *   1. NEXT_PUBLIC_SITE_URL — an explicit override for custom domains.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel injects the stable production
 *      domain. Preferred over VERCEL_URL because it does not change per
 *      deployment, so a link emailed today still works next week.
 *   3. VERCEL_URL — the per-deployment URL, so preview deployments send
 *      links back to themselves rather than to production.
 *   4. localhost, for local development.
 *
 * DELIBERATELY NOT the request's Host header. A recovery link is an account
 * takeover primitive: anyone able to influence the host could have the reset
 * email point at their own domain. Supabase's redirect allowlist is a second
 * line of defence, but the origin should be trustworthy before it gets there.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) return `https://${production.replace(/\/+$/, "")}`;

  const deployment = process.env.VERCEL_URL?.trim();
  if (deployment) return `https://${deployment.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

/** An absolute URL back into this app, for emailed links. */
export function siteLink(path: string): string {
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
