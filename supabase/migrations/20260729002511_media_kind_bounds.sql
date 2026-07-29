-- Follow-up to studio_storage: media_assets still carried the 1B branding
-- bounds — the MIME CHECK excluded audio/pdf/text and byte_size capped at
-- 8MB, so lesson-media metadata rows could never be written. Extend both
-- (branding uploads keep their tighter limits at the bucket + policy level).
alter table public.media_assets drop constraint media_assets_mime_type_check;
alter table public.media_assets
  add constraint media_assets_mime_type_check
  check (mime_type in (
    'image/svg+xml', 'image/png', 'image/webp', 'image/jpeg',
    'image/x-icon', 'image/vnd.microsoft.icon',
    'audio/mpeg', 'audio/mp4', 'application/pdf',
    'text/plain', 'text/markdown'
  ));
alter table public.media_assets drop constraint media_assets_byte_size_check;
alter table public.media_assets
  add constraint media_assets_byte_size_check
  check (byte_size > 0 and byte_size <= 52428800);
