-- Phase 2 closeout: enable pg_net so pg_cron can invoke the webhook-worker
-- Edge Function on a schedule (ADR-025). pg_cron is already installed.
--
-- NOTE: a follow-up migration relocates pg_net into the `extensions` schema;
-- this first statement mirrors the initial (public-schema) enable exactly as
-- it was applied, so a from-scratch replay reproduces remote history.
create extension if not exists pg_net;
