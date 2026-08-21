import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * The single landing point for every emailed auth link.
 *
 * Two mechanisms arrive here, and the route has to accept both:
 *
 *  - `?code=` — the PKCE exchange. It only works in the browser that STARTED
 *    the flow, because the matching verifier lives in a cookie there.
 *  - `?token_hash=&type=` — verified server-side against Supabase, with no
 *    dependence on browser state.
 *
 * Only the first was handled, which broke email confirmation in the ordinary
 * case: people sign up on a laptop and open the email on a phone, and the
 * verifier is on the wrong device. The link failed with no useful explanation.
 *
 * Supabase's own server-side guidance is the token_hash form, which requires
 * the email templates to send `{{ .TokenHash }}` rather than the default
 * `{{ .ConfirmationURL }}`.
 */

// A closed set: `type` is attacker-controlled, and passing arbitrary strings
// into verifyOtp is not something to find out the consequences of.
const OTP_TYPES: readonly EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Open-redirect defense: `next` must be a same-origin relative path — one
  // leading slash, no scheme, no protocol-relative `//`.
  const rawNext = url.searchParams.get("next") ?? "/select-org";
  const next =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/select-org";

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  const supabase = await supabaseServer();

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/auth/error", url.origin));
}
