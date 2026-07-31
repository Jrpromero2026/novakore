<p align="center">
  <img src="apps/web/public/brand/logo.svg" alt="NovaKore" width="380">
</p>

<p align="center"><strong>Knowledge at the Core</strong></p>

**NovaKore** is learning infrastructure for professional organizations: an
AI-native, modular learning operating system. It is not an LMS — it is the
knowledge infrastructure layer beneath academies, journeys, assessments,
and credentials: modular, governed, and white-labeled for every
organization it powers.

## Mission

Give professional organizations infrastructure-grade knowledge systems —
versioned content, governed evaluation, verifiable credentials, granular
permissions, and tenant-owned identity — with the reliability and
precision expected of enterprise software.

## Vision

Every professional organization operating its own academy, on its own
terms, on shared infrastructure that never dilutes its identity. Built For
Her Academy is intended to become the first tenant; no production
integration exists in this repository.

## Structure

```
novakore/
├── apps/
│   └── web/                    # Next.js (App Router, TypeScript) application
├── packages/
│   ├── authorization/          # Permission catalog + authorization rules
│   ├── database/               # Generated DB types + real-database test suite
│   ├── design-system/          # Brand tokens (colors, type, motion, logo registry)
│   └── domain/                 # Canonical domain: terminology, content, rules
├── docs/                       # Architecture, brand, domain, security, QA, releases
├── scripts/                    # db-types, brand raster regeneration, BFH simulator
├── supabase/                   # Migrations (schema source of truth) + seeds
└── package.json                # npm workspaces root
```

## Brand

The visual identity (mark, palette, typography, voice) is documented in
[docs/brand/overview.md](docs/brand/overview.md). Canonical tokens live in
[`@novakore/design-system`](packages/design-system); vector assets in
[`apps/web/public/brand`](apps/web/public/brand); rasters regenerate via
`node scripts/brand-rasters.mjs`.

## Requirements

- Node.js >= 20 (developed on Node 22)
- npm >= 10 (uses npm workspaces — no pnpm/yarn required)

## Getting started

Install all workspace dependencies from the repo root:

```bash
npm install
```

Run the web app in development:

```bash
npm run dev
```

Other root scripts:

| Script                 | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run build`        | Production build                                   |
| `npm run start`        | Serve the production build                         |
| `npm run lint`         | ESLint across workspaces                           |
| `npm run typecheck`    | TypeScript `--noEmit` across workspaces            |
| `npm run test`         | Vitest in watch mode                               |
| `npm run test:run`     | Vitest single pass (CI mode)                       |
| `npm run test:rls`     | Real-database RLS suite (remote dev project)       |
| `npm run db:types`     | Regenerate database types                          |
| `npm run format`       | Prettier write                                     |
| `npm run format:check` | Prettier check only                                |
| `npm run verify`       | format:check + lint + typecheck + test:run + build |

## Notes

- Development runs against a dedicated Supabase dev project; migration
  files under `supabase/migrations` are the schema source of truth.
- This repo does **not** modify or depend on any external repository.
