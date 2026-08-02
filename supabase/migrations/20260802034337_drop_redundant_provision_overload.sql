-- Phase 6 correction: provisioning has existed since Phase 1A as
-- public.provision_organization(name, slug, owner_email) — platform-admin
-- gated and owner-wiring. The 2-arg overload added earlier in Phase 6 was
-- redundant; drop it to keep one canonical provisioning entry point.
drop function if exists public.provision_organization(text, text);
