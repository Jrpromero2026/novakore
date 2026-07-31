# Do / Don't (v1.0)

The quick audit sheet. Full rules live in the linked docs.

## Logo — [logo.md](logo.md)

| Do                                              | Don't                                         |
| ----------------------------------------------- | --------------------------------------------- |
| Render via `PlatformMark` / `NovaKoreMark`      | Ad-hoc `<img>` tags or re-drawn marks         |
| Use monochrome variants in constrained contexts | Recolor the mark with tenant or status colors |
| Keep ≥ 25 % clear space, ≥ 16 px mark size      | Crop, rotate, outline, shadow, or animate it  |
| Use tile variants on busy backgrounds           | Place the bare mark on photography            |

## Color — [colors.md](colors.md)

| Do                                                   | Don't                                             |
| ---------------------------------------------------- | ------------------------------------------------- |
| Consume semantic tokens (`--accent`, `--surface`, …) | Hardcode palette hex in components                |
| Keep Electric Indigo as the only interaction accent  | Use Nova Purple / Core Blue for buttons or links  |
| Use the gradient once, on brand moments              | Gradient washes on components, buttons, body text |
| Reserve status colors for status                     | Status colors as decoration or brand accents      |

## Type — [typography.md](typography.md)

| Do                                      | Don't                           |
| --------------------------------------- | ------------------------------- |
| Use type-role tokens                    | Ad-hoc font sizes in product UI |
| Track uppercase labels only             | Letter-space body copy          |
| JetBrains Mono for code and identifiers | Mono for prose, sans for code   |

## Voice — [voice.md](voice.md)

| Do                                         | Don't                                        |
| ------------------------------------------ | -------------------------------------------- |
| "Learning infrastructure", "organizations" | "Learning platform", "LMS", "creators"       |
| State what the system does                 | Marketing inflation ("supercharge", "magic") |
| Specific errors and empty states           | Cute apologetic error copy                   |

## Boundaries

| Do                                               | Don't                                           |
| ------------------------------------------------ | ----------------------------------------------- |
| Platform identity on platform surfaces only      | NovaKore mark inside tenant-themed shells       |
| Tenant themes via the validated theming pipeline | Tenant overrides of status/security semantics   |
| Canonical entity names in code (ADR-003)         | Renaming domain entities for marketing language |
