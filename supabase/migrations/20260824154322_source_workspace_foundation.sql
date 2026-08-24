-- =============================================================================
-- SOURCE WORKSPACE FOUNDATION
-- Turns source_documents from an inline-text side rail into a real ingestion
-- workspace: file uploads (documents, data, images, video) land in the
-- source-documents bucket with honest server-side text extraction for the
-- formats where extraction is real (PDF, DOCX, TXT, MD, CSV). Images and
-- video are stored and browsable but carry no fabricated "extraction".
-- =============================================================================

-- Widen the bucket: documents + data + images + video, 200MB ceiling
-- (per-type caps are enforced in the upload action; the bucket is the
-- backstop). MIME list is exact — no wildcards, no SVG.
update storage.buckets
   set file_size_limit = 209715200,
       allowed_mime_types = array[
         'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'image/png', 'image/jpeg', 'image/webp',
         'video/mp4', 'video/webm', 'video/quicktime'
       ]
 where id = 'source-documents';

-- File metadata + extraction record on the source row.
alter table public.source_documents
  add column mime_type text
    check (mime_type is null or char_length(mime_type) <= 100),
  add column byte_size bigint
    check (byte_size is null or (byte_size > 0 and byte_size <= 209715200)),
  add column original_filename text
    check (original_filename is null or char_length(original_filename) between 1 and 200),
  add column extracted_chars integer
    check (extracted_chars is null or extracted_chars >= 0),
  -- Why extraction produced what it did: truncation, failure detail, or the
  -- honest "no text extraction for this format" note. Never fabricated text.
  add column extraction_note text
    check (extraction_note is null or char_length(extraction_note) <= 500);

comment on column public.source_documents.extraction_note is
  'Human-readable extraction record: truncation, failure reason, or why no '
  'extraction applies (images/video). Extraction is real or absent — never '
  'fabricated.';
