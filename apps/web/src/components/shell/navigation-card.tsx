import type { ComponentType } from "react";
import Link from "next/link";
import type { DomainSection } from "@/lib/navigation/domains";
import { cx } from "@/components/ui/primitives";
import {
  IconAcademy,
  IconAi,
  IconAnalytics,
  IconAssessment,
  IconBranding,
  IconChevronRight,
  IconCourse,
  IconCredential,
  IconEnrollment,
  IconLibrary,
  IconMembers,
  IconOverview,
  IconPath,
  IconReview,
  IconRoles,
  IconSettings,
  IconStudio,
  IconTerminology,
  type IconProps,
} from "@/components/ui/icons";

const ICONS: Record<string, ComponentType<IconProps>> = {
  overview: IconOverview,
  analytics: IconAnalytics,
  studio: IconStudio,
  library: IconLibrary,
  course: IconCourse,
  ai: IconAi,
  path: IconPath,
  assessment: IconAssessment,
  review: IconReview,
  enrollment: IconEnrollment,
  credential: IconCredential,
  members: IconMembers,
  roles: IconRoles,
  academy: IconAcademy,
  terminology: IconTerminology,
  branding: IconBranding,
  settings: IconSettings,
};

/**
 * A card that IS navigation, not a dashboard widget that happens to link.
 *
 * The whole surface is the link — not the title alone — so the click target
 * matches the visual affordance. A chevron states the direction, because a
 * card without one reads as a container rather than a door.
 */
export function NavigationCard({
  href,
  label,
  description,
  icon,
  active = false,
}: {
  href: string;
  label: string;
  description: string;
  icon: string;
  active?: boolean;
}) {
  const Glyph = ICONS[icon] ?? IconOverview;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group flex items-start gap-3.5 rounded-lg border p-3.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active
          ? "border-accent/30 bg-accent-soft"
          : "border-transparent hover:border-border hover:bg-surface-sunken",
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border",
          active
            ? "border-accent/25 bg-surface text-accent"
            : "border-border-subtle bg-surface text-text-muted group-hover:text-accent",
        )}
      >
        <Glyph className="size-[18px]" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium text-text">{label}</span>
        <span className="mt-0.5 block text-body-sm text-text-secondary">
          {description}
        </span>
      </span>

      <IconChevronRight
        aria-hidden="true"
        className="mt-2 size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
      />
    </Link>
  );
}

/**
 * One grouping inside a domain: a heading, a sentence of orientation, and the
 * destinations that live at this level.
 *
 * The heading explains what the group is FOR rather than restating its name,
 * which is what lets someone choose without opening every card.
 */
export function SectionCard({
  section,
  activeHref,
}: {
  section: DomainSection;
  activeHref?: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border-subtle px-5 py-4">
        <h2 className="text-title font-semibold text-text">{section.label}</h2>
        <p className="mt-0.5 text-body-sm text-text-secondary">
          {section.description}
        </p>
      </div>
      <div className="grid gap-1.5 p-2.5 sm:grid-cols-2">
        {section.items.map((item) => (
          <NavigationCard
            key={item.href}
            href={item.href}
            label={item.label}
            description={item.description}
            icon={item.icon}
            active={activeHref === item.href}
          />
        ))}
      </div>
    </section>
  );
}
