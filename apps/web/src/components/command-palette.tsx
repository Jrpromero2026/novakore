"use client";

/**
 * Platform command palette (Cmd/Ctrl+K).
 *
 * Entries arrive pre-filtered by permission from the server shell — the
 * palette never invents destinations, and the server still enforces
 * authorization on navigation. Listbox keyboard semantics; motion within
 * tokens; collapses under prefers-reduced-motion via the global rule.
 */
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { cx } from "@/components/ui/primitives";
import {
  IconArrowRight,
  IconClock,
  IconPlus,
  IconSearch,
  type IconProps,
} from "@/components/ui/icons";

export interface PaletteEntry {
  id: string;
  label: string;
  /** Section shown as a group header, e.g. "Navigate" / "Create". */
  group: string;
  href: string;
  keywords?: string[];
}

const ENTRY_ICONS: Record<string, ComponentType<IconProps>> = {
  Navigate: IconArrowRight,
  Create: IconPlus,
  Recent: IconClock,
};

function score(entry: PaletteEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const haystacks = [entry.label, ...(entry.keywords ?? [])].map((s) =>
    s.toLowerCase(),
  );
  let best = 0;
  for (const h of haystacks) {
    if (h === q) best = Math.max(best, 100);
    else if (h.startsWith(q)) best = Math.max(best, 80);
    else if (h.split(/\s+/).some((w) => w.startsWith(q)))
      best = Math.max(best, 60);
    else if (h.includes(q)) best = Math.max(best, 40);
  }
  return best;
}

const RECENTS_KEY = "nk-palette-recents";
const RECENTS_LIMIT = 4;

function readRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function rememberRecent(id: string) {
  try {
    const next = [id, ...readRecents().filter((v) => v !== id)].slice(
      0,
      RECENTS_LIMIT,
    );
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recents are a convenience, never required */
  }
}

export function CommandPalette({ entries }: { entries: PaletteEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    // With no query, lead with recent destinations so the palette resumes
    // where the user left off.
    if (!query.trim() && recentIds.length > 0) {
      const byId = new Map(entries.map((e) => [e.id, e]));
      const recent = recentIds
        .map((id) => byId.get(id))
        .filter((e): e is PaletteEntry => Boolean(e))
        .map((e) => ({ ...e, group: "Recent" }));
      const recentSet = new Set(recent.map((e) => e.id));
      return [...recent, ...entries.filter((e) => !recentSet.has(e.id))];
    }
    return entries
      .map((entry) => ({ entry, s: score(entry, query) }))
      .filter(({ s }) => s > 0)
      .sort((a, b) => b.s - a.s)
      .map(({ entry }) => entry);
  }, [entries, query, recentIds]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => {
          // Refresh recents at the moment of opening — an event, not an
          // effect, so no cascading render.
          if (!prev) setRecentIds(readRecents());
          return !prev;
        });
      } else if (event.key === "Escape") {
        close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = listRef.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function go(entry: PaletteEntry) {
    rememberRecent(entry.id);
    close();
    router.push(entry.href);
  }

  if (!open) return null;

  const activeEntry = results[activeIndex];
  let lastGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 flex items-start justify-center px-3 pt-[8vh] sm:px-4 sm:pt-[14vh]"
      style={{ zIndex: "var(--z-overlay)" }}
    >
      <button
        type="button"
        aria-label="Close command palette"
        onClick={close}
        className="nk-backdrop absolute inset-0 bg-[rgb(0_0_0/0.45)] backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="nk-pop relative w-full max-w-xl overflow-hidden rounded-lg border border-border-default bg-background-elevated shadow-overlay"
      >
        <div className="flex items-center gap-2.5 border-b border-border-subtle px-4">
          <IconSearch size={16} className="shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="nk-palette-results"
            aria-activedescendant={
              activeEntry ? `nk-palette-${activeEntry.id}` : undefined
            }
            aria-label="Search the workspace"
            placeholder="Search or jump to…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && activeEntry) {
                e.preventDefault();
                go(activeEntry);
              }
            }}
            className="h-12 w-full bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
          />
          <kbd className="rounded border border-border-default px-1.5 py-0.5 font-mono text-caption text-text-muted">
            esc
          </kbd>
        </div>
        <ul
          id="nk-palette-results"
          role="listbox"
          aria-label="Results"
          ref={listRef}
          className="max-h-[19rem] overflow-y-auto p-1.5"
        >
          {results.length === 0 ? (
            <li className="px-3 py-10 text-center">
              <p className="text-body-sm text-text-primary">
                No matches for &ldquo;{query}&rdquo;
              </p>
              <p className="mt-1 text-caption text-text-muted">
                Try a section name like &ldquo;members&rdquo;, or clear the
                search to browse everything.
              </p>
            </li>
          ) : (
            results.map((entry, index) => {
              const showGroup = entry.group !== lastGroup;
              lastGroup = entry.group;
              const GroupIcon = ENTRY_ICONS[entry.group] ?? IconArrowRight;
              return (
                <li key={entry.id}>
                  {showGroup ? (
                    <p
                      className="px-3 pb-1 pt-2.5 text-caption font-medium uppercase text-text-muted"
                      style={{ letterSpacing: "var(--tracking-caps)" }}
                    >
                      {entry.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    id={`nk-palette-${entry.id}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => go(entry)}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-body-sm transition-colors duration-[var(--motion-fast)]",
                      index === activeIndex
                        ? "bg-accent-soft text-text-primary"
                        : "text-text-secondary",
                    )}
                  >
                    <GroupIcon
                      size={14}
                      className={cx(
                        index === activeIndex
                          ? "text-accent"
                          : "text-text-muted",
                      )}
                    />
                    {entry.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

/** Topbar trigger — advertises the shortcut, opens via a synthetic Cmd+K. */
export function CommandPaletteTrigger() {
  return (
    <button
      type="button"
      aria-label="Open command palette"
      onClick={() =>
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        )
      }
      className="hidden items-center gap-2 rounded-md border border-border-default px-2.5 py-1.5 text-label text-text-muted transition-colors duration-[var(--motion-fast)] hover:border-border-strong hover:text-text-secondary sm:flex"
    >
      <IconSearch size={13} />
      Search
      <kbd className="rounded border border-border-subtle px-1 font-mono text-[10px] text-text-muted">
        ⌘K
      </kbd>
    </button>
  );
}
