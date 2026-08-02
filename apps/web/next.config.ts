import type { NextConfig } from "next";

/**
 * Security headers (Phase 6 — security review). Conservative, breakage-free
 * baseline: no framing (the embedded-academy iframe contract is Phase 4 of
 * the BFH integration and will relax frame-ancestors deliberately, per
 * docs/integrations/built-for-her/contract.md §3), no MIME sniffing, no
 * referrer leakage, HSTS on HTTPS hosts.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
