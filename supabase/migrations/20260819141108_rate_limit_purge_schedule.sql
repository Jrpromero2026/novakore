-- Hourly purge of expired windows, alongside the existing outbox job.
select cron.schedule(
  'novakore-rate-limit-purge',
  '7 * * * *',
  $$select app.purge_rate_limits();$$
);
