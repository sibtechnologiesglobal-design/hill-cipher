-- Run this in the Supabase SQL Editor (or create the table via Table Editor).
-- Stores metadata only: never the password, key matrix, or plaintext image.

create table encryption_history (
  id uuid primary key default gen_random_uuid(),
  original_filename text,
  storage_path text not null,
  file_size_bytes int,
  created_at timestamptz default now()
);

-- The app talks to this table with the service_role key (server-side only),
-- which bypasses RLS. Enable RLS with no policies so anon/authenticated
-- clients cannot read or write it directly.
alter table encryption_history enable row level security;

-- Storage: create a PRIVATE bucket named "encrypted-files"
-- (Dashboard > Storage > New bucket > name: encrypted-files, public: OFF).
