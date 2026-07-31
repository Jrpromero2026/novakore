/**
 * NovaKore platform identity components (Brand Integration v1.0).
 *
 * The official mark: six expanding modular arms around a central knowledge
 * core, sweeping Nova Purple → Electric Indigo → Core Blue. Canonical vector
 * sources live in /public/brand (see docs/brand/logo.md); this component
 * renders the same geometry inline so the mark ships with the document and
 * never flashes. The platform mark is never tenant-recolored.
 */
import { cx } from "./ui/primitives";

/** Typeset platform wordmark. Token-driven color; never tenant-recolored. */
export function NovaKoreWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "select-none font-sans font-semibold tracking-tight text-text",
        className,
      )}
      aria-label="NovaKore"
    >
      NovaKore
    </span>
  );
}

/* Logo artwork constants. The knowledge-core faces are fixed artwork colors
 * (not UI tokens): the cube reads identically on every surface and theme.
 * Arm gradient stops resolve from the mode-invariant --brand-* primitives. */
const ARM_PATHS = [
  "M -20 -70 L 20 -70 L 30 -80 L 30 -222 L 20 -232 L -20 -232 L -30 -222 L -30 -80 Z",
  "M 50.6 -52.3 L 70.6 -17.7 L 84.3 -14 L 207.3 -85 L 210.9 -98.7 L 190.9 -133.3 L 177.3 -137 L 54.3 -66 Z",
  "M 70.6 17.7 L 50.6 52.3 L 54.3 66 L 177.3 137 L 190.9 133.3 L 210.9 98.7 L 207.3 85 L 84.3 14 Z",
  "M 20 70 L -20 70 L -30 80 L -30 222 L -20 232 L 20 232 L 30 222 L 30 80 Z",
  "M -50.6 52.3 L -70.6 17.7 L -84.3 14 L -207.3 85 L -210.9 98.7 L -190.9 133.3 L -177.3 137 L -54.3 66 Z",
  "M -70.6 -17.7 L -50.6 -52.3 L -54.3 -66 L -177.3 -137 L -190.9 -133.3 L -210.9 -98.7 L -207.3 -85 L -84.3 -14 Z",
] as const;

/**
 * The official NovaKore mark (formerly the provisional monogram slot —
 * consumers are unchanged, per the platform asset-slot contract).
 */
export function NovaKoreMonogram({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="NovaKore mark"
      className={className}
    >
      <defs>
        <linearGradient
          id="nk-mark-grad"
          gradientUnits="userSpaceOnUse"
          x1="-130"
          y1="-185"
          x2="140"
          y2="200"
        >
          <stop offset="0" stopColor="var(--brand-purple)" />
          <stop offset="0.5" stopColor="var(--brand-indigo)" />
          <stop offset="1" stopColor="var(--brand-blue)" />
        </linearGradient>
      </defs>
      <g transform="translate(256 256)">
        <g
          fill="url(#nk-mark-grad)"
          stroke="url(#nk-mark-grad)"
          strokeWidth="14"
          strokeLinejoin="round"
        >
          {ARM_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <path d="M 0 -44 L 38 -22 L 0 0 L -38 -22 Z" fill="#E7E1FF" />
        <path d="M -38 -22 L 0 0 L 0 44 L -38 22 Z" fill="#8F7FFF" />
        <path d="M 38 -22 L 0 0 L 0 44 L 38 22 Z" fill="#5A50E8" />
      </g>
    </svg>
  );
}

/** Official mark under its canonical name; same component as the slot. */
export const NovaKoreMark = NovaKoreMonogram;

/** Standard platform header lockup for platform-identity surfaces. */
export function PlatformMark({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <NovaKoreMonogram size={22} />
      <NovaKoreWordmark className="text-body" />
    </span>
  );
}
