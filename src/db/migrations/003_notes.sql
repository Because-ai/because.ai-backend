create extension if not exists vector;

create table if not exists notes (
  id text primary key,
  type text not null check (type in ('note', 'ticket', 'call')),
  source_id text not null,
  entity_type text not null check (entity_type in ('customer', 'region', 'category')),
  entity_ref text not null,
  excerpt text not null,
  meta jsonb not null default '{}'::jsonb,
  embedding vector(1024) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notes_entity on notes (entity_type, entity_ref);
create index if not exists idx_notes_embedding on notes using hnsw (embedding vector_cosine_ops);
