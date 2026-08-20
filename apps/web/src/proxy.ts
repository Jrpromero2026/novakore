import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /verify is the deliberate anonymous surface: public credential
// verification (privacy-safe RPC output only — see
// docs/architecture/certificates-and-credentials.md §4).
const PUBLIC_PATHS = [
  "/sign-in",
  "/auth/callback",
  "/auth/error",
  // Password recovery. The link establishes a session before landing here, so
  // an authenticated visitor is the normal case — but an EXPIRED link arrives
  // without one, and that visitor needs to be told so. Bouncing them to
  // /sign-in instead is the silent dead end this flow exists to fix. The page
  // renders nothing sensitive: signed out it shows only "request a new link".
  "/auth/reset",
  "/verify",
  // PWA manifest must be fetchable by the browser without a session.
  "/manifest.webmanifest",
  // Operational health probe: reachability + latency only, never data
  // (anon client under full RLS — see the route's doc comment).
  "/api/health",
];

/**
 * Session refresh + coarse route protection (Next 16 proxy convention).
 * Fine-grained authorization NEVER lives here — layouts and server actions
 * call `can()`; the database enforces RLS underneath (ADR-006).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the session when needed; do not run logic between client
  // creation and getUser() (supabase-ssr contract).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // "/" is the platform brand landing (Brand Integration v1.0): public for
  // visitors; the page itself forwards authenticated users to /select-org.
  const isPublic =
    pathname === "/" ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
