# UI Principles (v1.0)

How NovaKore's product surface behaves. These extend framework §9 and are
binding for new surfaces.

## Structure

- Structure over decoration; density tuned for administration.
- One accent per surface: Electric Indigo marks the primary interaction.
- Side panels and inline editing over modal chains.
- Empty states explain and offer the next action; errors are specific.

## Surfaces & depth

- Dark-first; light mode fully specified — never a filter or afterthought.
- Dark mode separates with borders and tone, not glow.
- Radii on the restrained 6–18 px token scale; shadows are the two quiet
  layered elevations (`raised`, `overlay`) — nothing else.
- Glass/translucency only where content passes beneath fixed chrome, never
  as a default panel style.

## Brand expression in product

- The brand gradient appears at most once per platform-identity page (hero
  glyph, hairline, or the mark itself) — never on tenant-themed surfaces.
- Platform identity (mark, wordmark) appears only on platform surfaces;
  organization surfaces carry the organization's theme (framework §10).

## Motion

- Durations/easings come from motion tokens (140/200/300 ms); ease-out for
  entrances, ease-in-out for state changes.
- Motion communicates state change or spatial continuity only — no bounce,
  no ambient/looping animation. `prefers-reduced-motion` collapses all
  motion globally.

## Accessibility

- Focus is always visible: 2 px `--focus-ring` outline, 2 px offset.
- Meaning never relies on color alone; status pairs color with text/icon.
- Interactive targets ≥ 32 px logical; keyboard paths exist for every flow.

## Avoid

Generic LMS visuals · glassmorphism-everywhere · neon cyberpunk · oversized
radii · dashboard clutter · excessive gradients · decorative icon noise.
