# Iconography (v1.0)

Icons are functional wayfinding, not decoration.

## Construction

- 24 px grid (`ICON_GRID`), 1.75 stroke (`ICON_STROKE_WIDTH`), round caps
  and joins (`ICON_STROKE_STYLE`) — constants in `@novakore/design-system`.
- Geometric forms; consistent optical weight across the set; no filled/
  outlined mixing within one surface.

## Color

- Icons inherit `currentColor` — never hardcoded palette hex, never the
  brand gradient (the gradient belongs to the logo), never status colors
  unless the icon itself conveys that status.

## Usage

- Icons accompany labels; they don't replace them. Icon-only controls
  require an accessible name (`aria-label`).
- No decorative icon noise: an icon appears when it aids scanning or
  state recognition, not to fill space.
- Status iconography pairs with status text tokens so meaning never relies
  on color alone.
