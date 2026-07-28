# NovaKore

**NovaKore** is an AI-native, modular learning operating system.

This repository is a monorepo scaffold. It currently contains a single application
(`apps/web`) and reserves `packages/` for shared libraries that will be extracted
as the platform grows.

> **Status:** Initial scaffold only. No product features, tenants, or external
> integrations are implemented yet. Built For Her Academy is intended to become the
> first tenant in a later phase — no Built For Her production integration exists in
> this repository.

## Structure

```
novakore/
├── apps/
│   └── web/          # Next.js (App Router, TypeScript) application
├── packages/         # Reserved for shared packages (empty for now)
├── package.json      # npm workspaces root
└── README.md
```

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

Other root scripts: `npm run build`, `npm run start`, `npm run lint`, `npm run typecheck`.

## Notes

- This repo is **not** connected to any Supabase project.
- This repo does **not** modify or depend on any external repository.
