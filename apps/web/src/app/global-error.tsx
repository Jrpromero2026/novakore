"use client"; // Error boundaries must be Client Components

/**
 * Last-resort boundary: replaces the root layout when even it fails to
 * render. Nothing from globals.css reaches this page, so it carries its own
 * document, minimal styles, and theme handling (this fork's global-error
 * renders outside the app's theme plumbing — OS scheme only).
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <style>{`
          :root {
            --ge-bg: #f7f8fa;
            --ge-ink: #0b0b0d;
            --ge-muted: #565a6e;
            --ge-accent: #5a5cff;
            --ge-accent-ink: #ffffff;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --ge-bg: #0b0b0d;
              --ge-ink: #f0f0f4;
              --ge-muted: #9a9db4;
              --ge-accent: #7a7cff;
              --ge-accent-ink: #0b0b0d;
            }
          }
          .ge-wrap {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            background: var(--ge-bg);
            color: var(--ge-ink);
            font-family: ui-sans-serif, system-ui, "Segoe UI", sans-serif;
            text-align: center;
            padding: 24px;
          }
          .ge-brand {
            font-size: 12px;
            font-weight: 600;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--ge-accent);
          }
          .ge-title { font-size: 24px; font-weight: 600; margin: 0; }
          .ge-body { max-width: 28rem; font-size: 14px; color: var(--ge-muted); margin: 0; }
          .ge-ref { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: var(--ge-muted); }
          .ge-btn {
            margin-top: 8px;
            border: 0;
            border-radius: 6px;
            background: var(--ge-accent);
            color: var(--ge-accent-ink);
            font-size: 14px;
            font-weight: 500;
            padding: 8px 16px;
            cursor: pointer;
          }
        `}</style>
        <main className="ge-wrap">
          <p className="ge-brand">NovaKore</p>
          <h1 className="ge-title">Something broke below deck</h1>
          <p className="ge-body">
            The application shell failed to render. Retry usually clears a
            temporary failure; if it keeps happening, share the reference code
            with support.
          </p>
          {error.digest ? (
            <p className="ge-ref">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            className="ge-btn"
            onClick={() => unstable_retry()}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
