import {
  domainForPath,
  type Domain,
  type DomainItem,
  type DomainSection,
} from "./domains";

/**
 * Breadcrumb derivation.
 *
 * With no sidebar, breadcrumbs carry the entire burden of orientation — they
 * are the only thing on screen that answers "where am I?" and "what level am
 * I operating at?". So they are derived from the SAME domain model the
 * navigation uses. A hand-written trail per page would drift from the nav
 * within a month and start lying about the hierarchy.
 *
 * Two deliberate constraints:
 *
 *   * A section is a grouping, not a route. It appears in the trail for
 *     orientation but is NOT a link, because there is nowhere for it to go.
 *     Rendering a dead link would be worse than rendering plain text.
 *   * Depth is capped by construction: domain, section, destination, then
 *     whatever the page appends. Anything deeper is the page's own business
 *     and its responsibility to keep short.
 */

export interface Crumb {
  label: string;
  /** Absent means "you are here" — the last crumb, or a non-routable group. */
  href?: string;
}

interface Located {
  domain: Domain;
  section: DomainSection | null;
  item: DomainItem | null;
}

/** Where a path sits in the model: which domain, section and destination. */
function locate(domains: readonly Domain[], pathname: string): Located | null {
  const domain = domainForPath(domains, pathname);
  if (!domain) return null;

  let section: DomainSection | null = null;
  let item: DomainItem | null = null;
  let best = -1;

  for (const s of domain.sections) {
    for (const i of s.items) {
      const matches = pathname === i.href || pathname.startsWith(`${i.href}/`);
      if (matches && i.href.length > best) {
        best = i.href.length;
        section = s;
        item = i;
      }
    }
  }

  return { domain, section, item };
}

/**
 * The trail for `pathname`, with any page-supplied crumbs appended.
 *
 * `trail` exists because the shell cannot know a course's title or a member's
 * name — only the page can. The shell supplies the stable spine; the page
 * supplies the leaves.
 */
export function buildBreadcrumbs(
  domains: readonly Domain[],
  pathname: string,
  trail: readonly Crumb[] = [],
): Crumb[] {
  const found = locate(domains, pathname);
  if (!found) return [...trail];

  const { domain, section, item } = found;
  const crumbs: Crumb[] = [];

  // Home is the root of the workspace, not a level to climb back to from
  // inside itself.
  const onDomainLanding = pathname === domain.href;
  crumbs.push({
    label: domain.label,
    ...(onDomainLanding && trail.length === 0 ? {} : { href: domain.href }),
  });

  if (section) crumbs.push({ label: section.label });

  if (item) {
    const onItem = pathname === item.href;
    crumbs.push({
      label: item.label,
      ...(onItem && trail.length === 0 ? {} : { href: item.href }),
    });
  }

  crumbs.push(...trail);

  // Collapse an adjacent repeat. Section labels are static while item labels
  // follow the tenant's vocabulary, so a rename can make them collide —
  // "Curriculum › Programs" becomes "Programs › Programs" the moment an
  // organization renames Course to Program. Handled here rather than by
  // choosing section names no tenant would pick, because the set of names a
  // tenant might pick is not ours to predict. Keeps the LATER crumb, which
  // is the one carrying the link and the position.
  for (let i = crumbs.length - 1; i > 0; i--) {
    if (crumbs[i]!.label === crumbs[i - 1]!.label) crumbs.splice(i - 1, 1);
  }

  // The last crumb is always the current location, never a link — even when
  // a page appended one carrying an href.
  const last = crumbs[crumbs.length - 1];
  if (last?.href) crumbs[crumbs.length - 1] = { label: last.label };

  return crumbs;
}
