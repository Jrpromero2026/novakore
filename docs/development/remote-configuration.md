# Remote Configuration Log — novakore-dev

Every piece of remote configuration that is not expressed in committed
migration files must be recorded here so the project is reproducible.

| Date       | Setting                    | Value / action                                                                                       | Where                                                                   | Why                                                       |
| ---------- | -------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| 2026-07-28 | Project created            | `novakore-dev`, region `us-west-1`, org JRSTRENGTHANDFITNESS                                         | Supabase (via management API)                                           | Dedicated NovaKore dev project (owner decision D-02)      |
| 2026-07-28 | Auth providers             | Email/password + magic link only; no OAuth/SAML/phone/passkeys                                       | Dashboard → Authentication → Providers (defaults already match; verify) | Owner decision D-04                                       |
| 2026-07-28 | Auth URLs                  | Site URL `http://localhost:3000`; redirect allow-list includes `http://localhost:3000/auth/callback` | Dashboard → Authentication → URL Configuration                          | Magic-link / confirmation redirects for local app QA      |
| PENDING    | Leaked password protection | Enable (HaveIBeenPwned check)                                                                        | Dashboard → Authentication → Passwords                                  | Security advisor recommendation; dashboard-only toggle    |
| PENDING    | Database password          | Reset once to obtain `SUPABASE_DB_PASSWORD` for CLI direct-connection workflows                      | Dashboard → Project Settings → Database                                 | Needed only for `supabase link`/`db push` from a terminal |

Add a row for anything else configured outside migrations.
