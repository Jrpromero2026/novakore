/**
 * NovaKore icon set — geometric, stroke-consistent, functional
 * (docs/brand/iconography.md: 24-px grid, 1.75 stroke, round joins,
 * currentColor only). Icons accompany labels; icon-only controls must
 * carry an accessible name at the call site.
 */
import type { ReactNode, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({
  size = 16,
  children,
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconOverview = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 10.75 12 3.5l9 7.25" />
    <path d="M5.5 9.75V20.5h13V9.75" />
    <path d="M9.75 20.5v-6h4.5v6" />
  </Icon>
);

export const IconAnalytics = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4v16h16" />
    <path d="M8.5 16.5v-4.5" />
    <path d="M12.5 16.5v-8" />
    <path d="M16.5 16.5v-2.5" />
  </Icon>
);

export const IconLearn = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 9.5 12 5l9.5 4.5L12 14 2.5 9.5Z" />
    <path d="M6.5 11.75v4.25c0 1.35 2.45 2.5 5.5 2.5s5.5-1.15 5.5-2.5v-4.25" />
  </Icon>
);

export const IconStudio = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.5 5 4.5 4.5L9.5 19H5v-4.5L14.5 5Z" />
    <path d="m12.5 7 4.5 4.5" />
  </Icon>
);

export const IconLibrary = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
    <path d="m4 12.25 8 4.25 8-4.25" />
    <path d="m4 16.25 8 4.25 8-4.25" />
  </Icon>
);

export const IconCourse = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h12.5v15H7a2.5 2.5 0 0 0-2.5 2.5V5.5Z" />
    <path d="M4.5 20.5A2.5 2.5 0 0 1 7 18h12.5" />
  </Icon>
);

export const IconAi = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11 4.5c.65 3.5 2 4.85 5.5 5.5-3.5.65-4.85 2-5.5 5.5-.65-3.5-2-4.85-5.5-5.5 3.5-.65 4.85-2 5.5-5.5Z" />
    <path d="M18 14c.35 1.9 1.1 2.65 3 3-1.9.35-2.65 1.1-3 3-.35-1.9-1.1-2.65-3-3 1.9-.35 2.65-1.1 3-3Z" />
  </Icon>
);

export const IconPath = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5.5" cy="5.5" r="2" />
    <circle cx="18.5" cy="18.5" r="2" />
    <path d="M7.5 5.5H14a3.75 3.75 0 0 1 0 7.5h-4a3.5 3.5 0 0 0 0 7h6.5" />
  </Icon>
);

export const IconAssessment = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3.5h6v3H9z" />
    <path d="M15 5h3a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V6.5A1.5 1.5 0 0 1 6 5h3" />
    <path d="m8.75 13.5 2.25 2.25 4.25-4.75" />
  </Icon>
);

export const IconReview = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.75 12S6.25 5.75 12 5.75 21.25 12 21.25 12 17.75 18.25 12 18.25 2.75 12 2.75 12Z" />
    <circle cx="12" cy="12" r="2.75" />
  </Icon>
);

export const IconCredential = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="9.5" r="5" />
    <path d="m8.9 13.6-1.4 6.4 4.5-2.4 4.5 2.4-1.4-6.4" />
  </Icon>
);

export const IconEnrollment = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="8" r="3.5" />
    <path d="M3.5 20c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" />
    <path d="M18.5 8.25v5" />
    <path d="M16 10.75h5" />
  </Icon>
);

export const IconMembers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9.5" cy="8.5" r="3.25" />
    <path d="M3 20c.7-3.1 3.2-4.75 6.5-4.75S15.3 16.9 16 20" />
    <path d="M15.25 5.6a3.25 3.25 0 0 1 0 5.8" />
    <path d="M17.75 15.6c1.8.65 2.9 1.95 3.25 4.4" />
  </Icon>
);

export const IconRoles = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3 5 5.75v5.35c0 4.35 2.8 7.5 7 9.4 4.2-1.9 7-5.05 7-9.4V5.75L12 3Z" />
    <path d="m9.25 11.75 2 2 3.5-4" />
  </Icon>
);

export const IconAcademy = (p: IconProps) => (
  <Icon {...p}>
    <path d="m3 9 9-5.5L21 9" />
    <path d="M5 11v7.5M9.65 11v7.5M14.35 11v7.5M19 11v7.5" />
    <path d="M3.5 20.5h17" />
  </Icon>
);

export const IconTerminology = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 6.75V4.5h14v2.25" />
    <path d="M12 4.5v15" />
    <path d="M9 19.5h6" />
  </Icon>
);

export const IconBranding = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21.25a9.25 9.25 0 1 1 9.25-9.25c0 1.95-1.3 3.1-2.95 3.1h-2.1c-1.5 0-2.35 1.25-1.65 2.55.6 1.15.15 2.4-1.25 3.05a8.9 8.9 0 0 1-1.3.55Z" />
    <circle cx="7.75" cy="10.5" r="0.4" fill="currentColor" />
    <circle cx="12" cy="7.75" r="0.4" fill="currentColor" />
    <circle cx="16.25" cy="10.5" r="0.4" fill="currentColor" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="2.75" />
    <path d="M19.4 14.6a1.5 1.5 0 0 0 .3 1.65l.05.05a1.85 1.85 0 1 1-2.6 2.6l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37v.13a1.85 1.85 0 1 1-3.7 0v-.07a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05a1.85 1.85 0 1 1-2.6-2.6l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9h-.13a1.85 1.85 0 1 1 0-3.7h.07a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.05a1.85 1.85 0 1 1 2.6-2.6l.05.05a1.5 1.5 0 0 0 1.65.3h.07a1.5 1.5 0 0 0 .9-1.37v-.13a1.85 1.85 0 0 1 3.7 0v.07a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a1.85 1.85 0 1 1 2.6 2.6l-.05.05a1.5 1.5 0 0 0-.3 1.65v.07a1.5 1.5 0 0 0 1.37.9h.13a1.85 1.85 0 1 1 0 3.7h-.07a1.5 1.5 0 0 0-1.37.9Z" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 5 5" />
  </Icon>
);

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.25V12l3 1.75" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconPin = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.25 3.75h5.5l-.65 6.1 3.15 3.4H6.75l3.15-3.4-.65-6.1Z" />
    <path d="M12 13.25v7" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 12h15m0 0-6-6m6 6-6 6" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const IconSignOut = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 4.5H7A1.5 1.5 0 0 0 5.5 6v12A1.5 1.5 0 0 0 7 19.5h6.5" />
    <path d="M10.5 12h10m0 0-3.5-3.5M20.5 12 17 15.5" />
  </Icon>
);

export const IconSwitch = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h13m0 0-3-3m3 3-3 3" />
    <path d="M20 16H7m0 0 3 3m-3-3 3-3" />
  </Icon>
);
