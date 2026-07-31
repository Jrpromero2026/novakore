# Typography (v1.0)

| Role                       | Face               | Loaded via                            |
| -------------------------- | ------------------ | ------------------------------------- |
| Interface + display        | **Inter**          | `next/font` (`--font-inter`)          |
| Fallback                   | `system-ui` stack  | —                                     |
| Code, identifiers, tabular | **JetBrains Mono** | `next/font` (`--font-jetbrains-mono`) |

Brand Integration v1.0 makes Inter the platform primary (previously Geist).
Geist remains loaded and available — it is part of the approved tenant font
catalog (`FONT_CATALOG` in `@novakore/domain`: geist / inter / system), and
tenant selection resolves via `--org-font`. No arbitrary external font
URLs, ever.

## Type roles

Roles are tokens (`TYPE_ROLES` in `@novakore/design-system`, projected as
`--text-*` in globals.css). Use roles, not ad-hoc sizes:

| Role       | Size      | Line height | Weight |
| ---------- | --------- | ----------- | ------ |
| display    | 1.875rem  | 1.15        | 600    |
| h1         | 1.5rem    | 1.2         | 600    |
| h2         | 1.1875rem | 1.25        | 600    |
| h3         | 1rem      | 1.3         | 600    |
| title      | 0.875rem  | 1.35        | 550    |
| body       | 0.875rem  | 1.55        | 400    |
| body-small | 0.8125rem | 1.5         | 400    |
| label      | 0.75rem   | 1.3         | 500    |
| caption    | 0.6875rem | 1.35        | 500    |
| code       | 0.8125rem | 1.5         | 400    |

Marketing/landing surfaces may extend upward through the Tailwind scale for
editorial headlines (e.g. the homepage hero), keeping tight tracking and
semibold weight.

## Rules

- Letter spacing is restrained; tracking (`--tracking-caps`, 0.08em+) is
  applied **only** to uppercase labels and metadata.
- Numbers in tables and metrics use `tabular-nums`.
- The wordmark is always Inter semibold with tight tracking — it is typeset
  by `NovaKoreWordmark`, never re-created ad hoc.
