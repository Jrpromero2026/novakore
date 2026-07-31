/**
 * Presentation-only formatting helpers. Deterministic on the server so
 * server and client renders agree.
 */

const UNITS: [
  limit: number,
  seconds: number,
  name: Intl.RelativeTimeFormatUnit,
][] = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86400, 3600, "hour"],
  [604800, 86400, "day"],
  [2629800, 604800, "week"],
  [31557600, 2629800, "month"],
  [Infinity, 31557600, "year"],
];

/** "3 hours ago" / "in 2 days" from an ISO timestamp. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const elapsed = (new Date(iso).getTime() - now.getTime()) / 1000;
  const abs = Math.abs(elapsed);
  if (abs < 45) return "just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [limit, seconds, unit] of UNITS) {
    if (abs < limit)
      return formatter.format(Math.round(elapsed / seconds), unit);
  }
  return new Date(iso).toLocaleDateString();
}

/** Email → a display handle, when no richer profile name exists. */
export function handleFromEmail(
  email: string | null | undefined,
): string | null {
  const local = email?.split("@")[0]?.split(/[._-]/)[0];
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
}
