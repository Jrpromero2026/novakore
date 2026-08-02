"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import { cx } from "@/components/ui/primitives";
import {
  IconAcademy,
  IconAi,
  IconAnalytics,
  IconAssessment,
  IconBranding,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconCourse,
  IconCredential,
  IconEnrollment,
  IconLearn,
  IconLibrary,
  IconMembers,
  IconMenu,
  IconOverview,
  IconPath,
  IconPin,
  IconReview,
  IconRoles,
  IconSettings,
  IconStudio,
  IconTerminology,
  type IconProps,
} from "@/components/ui/icons";
import type { NavSection } from "./nav-config";

const NAV_ICONS: Record<string, ComponentType<IconProps>> = {
  overview: IconOverview,
  analytics: IconAnalytics,
  learn: IconLearn,
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

const COLLAPSE_KEY = "nk-nav-collapsed";

/* --------------------------------------------------------------------------
 * Workspace pins — the personalization primitive. A member stars any admin
 * page; it appears at the top of their sidebar. Stored locally per org
 * (same storage pattern as the collapse preference), capped at 8.
 * ------------------------------------------------------------------------ */
const PIN_EVENT = "nk-pins";
const pinKey = (orgSlug: string) => `nk-pins:${orgSlug}`;

interface Pin {
  href: string;
  label: string;
}

function readPins(orgSlug: string): Pin[] {
  try {
    const raw = window.localStorage.getItem(pinKey(orgSlug));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(
          (p): p is Pin =>
            typeof p === "object" &&
            p !== null &&
            typeof (p as Pin).href === "string" &&
            typeof (p as Pin).label === "string",
        )
      : [];
  } catch {
    return [];
  }
}

function togglePin(orgSlug: string, pin: Pin) {
  try {
    const pins = readPins(orgSlug);
    const next = pins.some((p) => p.href === pin.href)
      ? pins.filter((p) => p.href !== pin.href)
      : [...pins, pin].slice(-8);
    window.localStorage.setItem(pinKey(orgSlug), JSON.stringify(next));
  } catch {
    /* storage unavailable — pins are a convenience, never required */
  }
  window.dispatchEvent(new Event(PIN_EVENT));
}

function subscribeToPins(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PIN_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PIN_EVENT, callback);
  };
}

/* Serialized snapshot so useSyncExternalStore sees a stable value. */
function usePins(orgSlug: string): Pin[] {
  const serialized = useSyncExternalStore(
    subscribeToPins,
    () => JSON.stringify(readPins(orgSlug)),
    () => "[]",
  );
  return JSON.parse(serialized) as Pin[];
}

/** Topbar star: pins/unpins the current admin page. */
export function PinButton({ orgSlug }: { orgSlug: string }) {
  const pathname = usePathname();
  const pins = usePins(orgSlug);
  const pinned = pins.some((p) => p.href === pathname);

  return (
    <button
      type="button"
      aria-label={pinned ? "Unpin this page" : "Pin this page to your sidebar"}
      aria-pressed={pinned}
      onClick={() =>
        togglePin(orgSlug, {
          href: pathname,
          label:
            document.title.split(" · ")[0]?.trim() ||
            pathname.split("/").filter(Boolean).at(-1) ||
            "Page",
        })
      }
      className={cx(
        "nk-press rounded-md border p-1.5",
        pinned
          ? "border-accent bg-accent-soft text-accent"
          : "border-border-default text-text-muted hover:border-border-strong hover:text-text-secondary",
      )}
    >
      <IconPin size={14} />
    </button>
  );
}

/* Shared shell state so the topbar menu button and the sidebar drawer stay
 * in sync without lifting the whole shell into client land. */
const ShellContext = createContext<{
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
} | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The drawer records the route it opened on; navigating anywhere else
  // closes it by derivation — no effect needed.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const mobileOpen = openedAt === pathname;
  const setMobileOpen = (open: boolean) => setOpenedAt(open ? pathname : null);

  return (
    <ShellContext.Provider value={{ mobileOpen, setMobileOpen }}>
      {children}
    </ShellContext.Provider>
  );
}

export function MobileNavButton() {
  const shell = useContext(ShellContext);
  if (!shell) return null;
  return (
    <button
      type="button"
      aria-label="Open navigation"
      aria-expanded={shell.mobileOpen}
      onClick={() => shell.setMobileOpen(true)}
      className="rounded-md p-2 text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-primary md:hidden"
    >
      <IconMenu size={18} />
    </button>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  collapsed: boolean;
}) {
  const IconComponent = NAV_ICONS[icon] ?? IconOverview;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "group relative flex items-center gap-2.5 rounded-md py-1.5 text-body-sm transition-colors duration-[var(--motion-fast)]",
        collapsed ? "justify-center px-2" : "px-2.5",
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
      )}
    >
      {active ? (
        // Re-mounts on route change: the marker arriving is the orientation cue.
        <span
          aria-hidden
          className="nk-scale-in absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent"
        />
      ) : null}
      <IconComponent
        size={16}
        className={cx(
          "shrink-0 transition-colors duration-[var(--motion-fast)]",
          active
            ? "text-accent"
            : "text-text-muted group-hover:text-text-secondary",
        )}
      />
      {collapsed ? (
        <>
          <span className="sr-only">{label}</span>
          {/* Collapsed-rail tooltip; pointer-events-none so it never
           * intercepts the link it describes. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-[calc(100%+0.5rem)] z-10 -translate-x-1 whitespace-nowrap rounded-md border border-border-default bg-background-elevated px-2 py-1 text-caption text-text-primary opacity-0 shadow-overlay transition-[opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100"
          >
            {label}
          </span>
        </>
      ) : (
        label
      )}
    </Link>
  );
}

function NavSections({
  sections,
  collapsed,
}: {
  sections: NavSection[];
  collapsed: boolean;
}) {
  const pathname = usePathname();

  // Longest matching href wins so nested routes highlight the right item.
  const activeHref = sections
    .flatMap((s) => s.items)
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section, i) => (
        <div key={section.label ?? i}>
          {section.label && !collapsed ? (
            <p
              className="mb-1.5 px-2.5 text-caption font-medium uppercase text-text-muted"
              style={{ letterSpacing: "var(--tracking-caps)" }}
            >
              {section.label}
            </p>
          ) : null}
          {section.label && collapsed ? (
            <div
              aria-hidden
              className="mx-2 mb-2 border-t border-border-subtle"
            />
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  active={item.href === activeHref}
                  collapsed={collapsed}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* Collapse preference lives in localStorage and is read through
 * useSyncExternalStore: the server snapshot (expanded) hydrates cleanly,
 * then the stored preference applies without effect-driven re-renders. */
function subscribeToCollapse(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("nk-nav-collapse", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("nk-nav-collapse", callback);
  };
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AdminSidebar({
  sections,
  orgName,
  orgSlug,
}: {
  sections: NavSection[];
  orgName: string;
  orgSlug: string;
}) {
  const shell = useContext(ShellContext);
  const pathname = usePathname();
  const pins = usePins(orgSlug);
  const isCollapsed = useSyncExternalStore(
    subscribeToCollapse,
    readCollapsed,
    () => false,
  );

  const pinnedSection =
    pins.length > 0 && !isCollapsed ? (
      <div className="mb-5">
        <p
          className="mb-1.5 flex items-center gap-1.5 px-2.5 text-caption font-medium uppercase text-text-muted"
          style={{ letterSpacing: "var(--tracking-caps)" }}
        >
          <IconPin size={11} aria-hidden />
          Pinned
        </p>
        <ul className="flex flex-col gap-0.5">
          {pins.map((pin) => (
            <li key={pin.href}>
              <Link
                href={pin.href}
                aria-current={pathname === pin.href ? "page" : undefined}
                className={cx(
                  "block truncate rounded-md px-2.5 py-1.5 text-body-sm transition-colors duration-[var(--motion-fast)]",
                  pathname === pin.href
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-text-secondary hover:bg-surface-interactive hover:text-text-primary",
                )}
              >
                {pin.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  function toggleCollapsed() {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, isCollapsed ? "0" : "1");
    } catch {
      /* non-fatal */
    }
    window.dispatchEvent(new Event("nk-nav-collapse"));
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cx(
          "sticky top-[var(--layout-header)] hidden max-h-[calc(100dvh-var(--layout-header))] shrink-0 flex-col overflow-y-auto border-r border-border-subtle px-3 pb-4 pt-5 md:flex",
          "transition-[width] duration-[var(--motion-standard)]",
        )}
        style={{ width: isCollapsed ? "3.75rem" : "var(--layout-sidebar)" }}
      >
        <nav aria-label="Workspace navigation" className="flex-1">
          {pinnedSection}
          <NavSections sections={sections} collapsed={isCollapsed} />
        </nav>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"}
          className={cx(
            "mt-5 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-caption text-text-muted transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive hover:text-text-secondary",
            isCollapsed && "justify-center px-2",
          )}
        >
          {isCollapsed ? (
            <IconChevronRight size={14} />
          ) : (
            <>
              <IconChevronLeft size={14} />
              Collapse
            </>
          )}
        </button>
      </aside>

      {/* Mobile drawer */}
      {shell?.mobileOpen ? (
        <div
          className="fixed inset-0 md:hidden"
          style={{ zIndex: "var(--z-overlay)" }}
        >
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => shell.setMobileOpen(false)}
            className="nk-backdrop absolute inset-0 bg-[rgb(0_0_0/0.45)] backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Workspace navigation"
            className="nk-slide-in absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-background-elevated px-4 pb-6 pt-4 shadow-overlay"
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="text-title font-semibold text-text-primary">
                {orgName}
              </p>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => shell.setMobileOpen(false)}
                className="rounded-md p-2 text-text-secondary transition-colors duration-[var(--motion-fast)] hover:bg-surface-interactive"
              >
                <IconClose size={16} />
              </button>
            </div>
            <nav aria-label="Workspace navigation">
              <NavSections sections={sections} collapsed={false} />
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
