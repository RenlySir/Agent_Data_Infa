create extension if not exists vector;

create table memory_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  agent_id text not null,
  project_id uuid,
  session_id text not null,
  task_id text,
  event_type text not null,
  source_type text not null,
  content text,
  structured_payload jsonb not null default '{}'::jsonb,
  object_refs uuid[] not null default '{}',
  sensitivity text not null default 'normal',
  created_at timestamptz not null default now()
);

create index memory_events_scope_created_idx
  on memory_events (tenant_id, user_id, project_id, created_at desc);
create index memory_events_session_idx
  on memory_events (tenant_id, session_id, created_at desc);
create index memory_events_created_brin_idx
  on memory_events using brin (created_at);
create index memory_events_payload_gin_idx
  on memory_events using gin (structured_payload);

create table memory_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  owner_type text not null,
  owner_id text not null,
  project_id uuid,
  scope text not null,
  memory_type text not null,
  title text,
  content text not null,
  structured_payload jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0.5,
  importance numeric not null default 0.5,
  stability numeric not null default 0.5,
  sensitivity text not null default 'normal',
  status text not null default 'active',
  source_event_ids uuid[] not null default '{}',
  supersedes_memory_id uuid references memory_items(id),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_vector tsvector generated always as (
    to_tsvector('simple', coalesce(title, '') || ' ' || content)
  ) stored
);

create index memory_items_active_scope_idx
  on memory_items (tenant_id, owner_type, owner_id, scope, memory_type, updated_at desc)
  where status = 'active';
create index memory_items_project_active_idx
  on memory_items (tenant_id, project_id, updated_at desc)
  where status = 'active';
create index memory_items_search_gin_idx
  on memory_items using gin (search_vector)
  where status = 'active';
create index memory_items_payload_gin_idx
  on memory_items using gin (structured_payload);

create table memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  memory_id uuid not null references memory_items(id) on delete cascade,
  embedding_model text not null,
  embedding vector(1536) not null,
  chunk_text text not null,
  created_at timestamptz not null default now()
);

create index memory_embeddings_hnsw_idx
  on memory_embeddings using hnsw (embedding vector_cosine_ops);
create index memory_embeddings_memory_idx
  on memory_embeddings (tenant_id, memory_id);

create table memory_objects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bucket text not null,
  object_path text not null,
  mime_type text,
  checksum text,
  size_bytes bigint,
  source_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table memory_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  memory_id uuid not null references memory_items(id) on delete cascade,
  version_number integer not null,
  content text not null,
  structured_payload jsonb not null default '{}'::jsonb,
  change_reason text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (memory_id, version_number)
);

create table memory_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  memory_id uuid not null references memory_items(id) on delete cascade,
  user_id uuid,
  feedback_type text not null,
  comment text,
  replacement_content text,
  created_at timestamptz not null default now()
);

create table memory_access_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_type text not null,
  actor_id text not null,
  operation text not null,
  memory_ids uuid[] not null default '{}',
  request_scope jsonb not null default '{}'::jsonb,
  decision text not null,
  reason text,
  created_at timestamptz not null default now()
);
