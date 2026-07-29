-- pg_net does not support SET SCHEMA; drop and recreate it in the
-- extensions schema (security advisor 0014 "extension_in_public").
-- No in-flight requests on this fresh install. The `net` schema functions
-- (net.http_post) are recreated; the outbox-worker cron job resolves
-- net.http_post by name at execution time and is unaffected.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
