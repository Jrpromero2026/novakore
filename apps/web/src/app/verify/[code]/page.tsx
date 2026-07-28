import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Credential verification · NovaKore",
};

/**
 * Public credential verification. Anonymous by design: the RPC returns only
 * privacy-safe fields (title, issuer, recipient display name, dates,
 * status) — never emails, internal ids, scores, or answers. Codes are
 * random 64-bit identifiers, not enumerable row ids.
 */
export default async function VerifyCredentialPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("verify_credential", {
    p_code: decodeURIComponent(code).toUpperCase(),
  });
  const credential = data as {
    title: string;
    organization: string;
    recipient: string;
    issuedAt: string;
    expiresAt: string | null;
    status: "active" | "expired" | "revoked";
    verificationCode: string;
  } | null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-12">
      <p
        className="mb-6 text-caption uppercase text-text-muted"
        style={{ letterSpacing: "var(--tracking-caps)" }}
      >
        NovaKore credential verification
      </p>

      {credential === null ? (
        <div className="rounded-lg border border-border-default bg-surface p-6">
          <h1 className="text-h2 text-text-primary">No credential found</h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            The verification code is not recognized. Check the code and try
            again — codes look like NVK-XXXX-XXXX-XXXX-XXXX.
          </p>
        </div>
      ) : (
        <div className="space-y-5 rounded-lg border border-border-default bg-surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-h2 text-text-primary">{credential.title}</h1>
              <p className="mt-1 text-body-sm text-text-secondary">
                Issued by {credential.organization}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-caption font-medium ${
                credential.status === "active"
                  ? "bg-success-soft text-success"
                  : credential.status === "revoked"
                    ? "bg-danger-soft text-danger"
                    : "bg-warning-soft text-warning"
              }`}
            >
              {credential.status}
            </span>
          </div>

          <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
            <div>
              <dt className="text-caption text-text-muted">Recipient</dt>
              <dd className="text-text-primary">{credential.recipient}</dd>
            </div>
            <div>
              <dt className="text-caption text-text-muted">Issued</dt>
              <dd className="text-text-primary">
                {new Date(credential.issuedAt).toLocaleDateString()}
              </dd>
            </div>
            {credential.expiresAt ? (
              <div>
                <dt className="text-caption text-text-muted">Valid until</dt>
                <dd className="text-text-primary">
                  {new Date(credential.expiresAt).toLocaleDateString()}
                </dd>
              </div>
            ) : null}
            <div>
              <dt className="text-caption text-text-muted">
                Verification code
              </dt>
              <dd className="font-mono text-text-primary">
                {credential.verificationCode}
              </dd>
            </div>
          </dl>

          {credential.status === "revoked" ? (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-body-sm text-danger">
              This credential has been revoked by the issuing organization and
              is no longer valid.
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}
