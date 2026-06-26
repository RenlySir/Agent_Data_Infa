# Agent Persistent Memory Foundation Design

## Goal

Build an agent memory foundation that separates runtime memory, canonical long-term memory, and evidence/archive storage while keeping a single gateway for write, promotion, recall, and safety control.

The accepted architecture is:

```text
mem0/mem9 = Agent memory runtime layer
Supabase/Postgres = canonical long-term memory and governance layer
Object storage = evidence and archive layer
Memory Gateway + Consolidator + Memory Gate = control plane for write, promotion, recall, and safety
```

## Default Implementation Assumptions

- Runtime API: TypeScript, Fastify or Hono.
- Database: Supabase Postgres.
- Vector search: Supabase pgvector with HNSW for MVP.
- Full-text search: Postgres `tsvector`/GIN.
- Object storage: Supabase Storage first, S3/MinIO compatible adapter later.
- Queue: Supabase Queues for MVP, replaceable by Kafka/Temporal later.
- Runtime memory provider: mem0 or mem9 behind a provider interface.
- Agent clients: HTTP API first; Python/TypeScript SDKs can wrap the API later.

## Architectural Principles

1. Keep raw evidence separate from curated memory.
2. Treat long-term memory as canonical, versioned, permissioned data.
3. Treat mem0/mem9 as a runtime memory provider, not the only source of truth.
4. Require policy checks on both write and recall paths.
5. Use hybrid retrieval: structured filters, vector search, full-text search, recency, and importance.
6. Do not promote every short-term memory into long-term memory.
7. Every long-term memory must trace back to source events or objects.
8. Users must be able to inspect, correct, and delete memory.

## Logical Components

### 1. Memory SDK

Client used by agents.

Responsibilities:

- Send interaction events.
- Request relevant memories before model invocation.
- Send feedback such as confirmed, corrected, rejected, or deleted.
- Hide provider differences from the agent.

Minimal methods:

```ts
interface MemoryClient {
  captureEvent(input: CaptureEventInput): Promise<CaptureEventResult>;
  recall(input: RecallInput): Promise<RecallResult>;
  remember(input: RememberInput): Promise<MemoryItem>;
  forget(input: ForgetInput): Promise<ForgetResult>;
  feedback(input: MemoryFeedbackInput): Promise<void>;
}
```

### 2. Memory Gateway

Single service boundary for all memory reads and writes.

Responsibilities:

- Validate tenant, user, agent, project, session, and task scopes.
- Route hot memory operations to mem0/mem9.
- Write append-only events to Supabase.
- Dispatch async extraction/consolidation work.
- Enforce Memory Gate checks before returning memories.
- Normalize result shapes across runtime and canonical stores.

### 3. Runtime Memory Provider

Adapter over mem0 or mem9.

Responsibilities:

- Store hot session/task/user/project memory.
- Support low-latency recall.
- Support TTL and scope.
- Provide IDs that can be linked to canonical memory.

Provider interface:

```ts
interface RuntimeMemoryProvider {
  write(input: RuntimeMemoryWrite): Promise<RuntimeMemoryRef>;
  search(input: RuntimeMemorySearch): Promise<RuntimeMemoryHit[]>;
  update(input: RuntimeMemoryUpdate): Promise<void>;
  delete(input: RuntimeMemoryDelete): Promise<void>;
}
```

### 4. Canonical Memory Store

Supabase/Postgres long-term memory store.

Responsibilities:

- Store curated memory items, versions, embeddings, relations, feedback, and access logs.
- Enforce multi-tenant/user isolation through RLS.
- Provide structured filtering, vector search, and full-text search.
- Retain canonical state after runtime memory expires.

### 5. Evidence Store

Supabase Storage or S3-compatible storage.

Responsibilities:

- Store raw conversation bundles, files, images, PDFs, PPTs, tool outputs, and long logs.
- Store checksums and object metadata in Postgres.
- Allow later re-extraction when models or policies improve.

### 6. Consolidator

Async worker that promotes runtime/event data into canonical memory.

Responsibilities:

- Extract memory candidates.
- Deduplicate similar memories.
- Merge repeated facts/preferences.
- Detect conflicts.
- Score confidence, importance, stability, and sensitivity.
- Decide whether to promote, keep hot only, archive only, or reject.

### 7. Memory Gate

Policy and safety layer used on both write and read paths.

Responsibilities:

- Prevent cross-tenant, cross-user, and cross-project leakage.
- Block or redact sensitive information.
- Reject low-confidence or stale memory when it could alter sensitive behavior.
- Require evidence for high-impact memories.
- Filter memories by purpose, scope, and permission.

## Memory Layers

| Layer | Name | Main Use | Default Storage | TTL |
|---|---|---|---|---|
| L0 | Working Memory | Current model context, scratchpad, tool intermediate state | In-process / Redis | One turn to one task |
| L1 | Runtime Memory | Hot session/task/project memory, recent preferences | mem0 or mem9 | Minutes to weeks |
| L2 | Canonical Memory | Stable facts, preferences, procedures, profiles, project memory | Supabase Postgres + pgvector | Long-lived |
| L3 | Evidence Archive | Raw source evidence and large artifacts | Supabase Storage / S3 / MinIO | Long-lived / policy-based |

## Memory Types

```text
profile      Stable user/agent/org profile
preference   Stable or repeated preference
fact         Verifiable project/user/org fact
procedure    Learned workflow or operational habit
episode      Summarized past interaction or decision
task_state   Current task state; usually L1 only
artifact     Memory linked to a file/object
```

## Scope Model

Every memory operation must include scope.

```text
tenant_id   Required
user_id     Required for user memory
agent_id    Required for agent-specific runtime memory
project_id  Optional but recommended
session_id  Required for session/task events
task_id     Optional
```

Scope values:

```text
session
task
user
project
team
org
agent
```

Default visibility rule:

```text
session/task memories are private to the session/task unless promoted.
user memories are visible only to that user and authorized agents.
project memories are visible only to project members and authorized agents.
org memories require explicit policy and audit logging.
```

## Data Model

### `memory_events`

Append-only event log. Used as source of truth for extraction and replay.

```sql
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
```

Recommended indexes:

```sql
create index memory_events_scope_created_idx
  on memory_events (tenant_id, user_id, project_id, created_at desc);

create index memory_events_session_idx
  on memory_events (tenant_id, session_id, created_at desc);

create index memory_events_created_brin_idx
  on memory_events using brin (created_at);

create index memory_events_payload_gin_idx
  on memory_events using gin (structured_payload);
```

### `memory_items`

Canonical long-term memory table.

```sql
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
  updated_at timestamptz not null default now()
);
```

Recommended indexes:

```sql
create index memory_items_active_scope_idx
  on memory_items (tenant_id, owner_type, owner_id, scope, memory_type, updated_at desc)
  where status = 'active';

create index memory_items_project_active_idx
  on memory_items (tenant_id, project_id, updated_at desc)
  where status = 'active';
```

Use the nullable `project_id` column for project-level recall. Do not rely on JSONB for hot query filters.

Full-text index:

```sql
alter table memory_items
  add column search_vector tsvector
  generated always as (to_tsvector('simple', coalesce(title, '') || ' ' || content)) stored;

create index memory_items_search_gin_idx
  on memory_items using gin (search_vector)
  where status = 'active';
```

JSONB index:

```sql
create index memory_items_payload_gin_idx
  on memory_items using gin (structured_payload);
```

### `memory_embeddings`

Vector index for canonical memory.

```sql
create table memory_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  memory_id uuid not null references memory_items(id) on delete cascade,
  embedding_model text not null,
  embedding vector(1536) not null,
  chunk_text text not null,
  created_at timestamptz not null default now()
);
```

Use `vector(1536)` for MVP to stay inside common pgvector/HNSW constraints. If using larger embedding dimensions, explicitly verify pgvector/Supabase support and consider `halfvec`.

Recommended index:

```sql
create index memory_embeddings_hnsw_idx
  on memory_embeddings
  using hnsw (embedding vector_cosine_ops);

create index memory_embeddings_memory_idx
  on memory_embeddings (tenant_id, memory_id);
```

For vector queries with tenant/project filters, use overfetch and post-filtering in an RPC, or partition by tenant/project once needed.

### `memory_objects`

Metadata for evidence objects.

```sql
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
```

### `memory_versions`

Version and conflict history.

```sql
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
```

### `memory_feedback`

User/agent feedback.

```sql
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
```

### `memory_access_logs`

Audit log for recall and write operations.

```sql
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
```

## Row-Level Security

Enable and force RLS on all tenant-scoped tables.

```sql
alter table memory_events enable row level security;
alter table memory_items enable row level security;
alter table memory_embeddings enable row level security;
alter table memory_objects enable row level security;
alter table memory_versions enable row level security;
alter table memory_feedback enable row level security;
alter table memory_access_logs enable row level security;
```

Use Supabase Auth for user-facing access and service-role access only inside the Memory Gateway or workers.

Baseline policy shape:

```sql
create policy memory_items_tenant_policy on memory_items
  for all
  to authenticated
  using (
    tenant_id::text = auth.jwt() ->> 'tenant_id'
    and (
      owner_id = auth.uid()::text
      or structured_payload -> 'authorized_user_ids' ? auth.uid()::text
    )
  );
```

For production, move membership checks to normalized membership tables instead of large JSON arrays.

## API Surface

### `POST /v1/memory/events`

Capture raw event and optionally write hot memory.

Request:

```json
{
  "tenant_id": "uuid",
  "user_id": "uuid",
  "agent_id": "research-agent",
  "project_id": "uuid",
  "session_id": "s-123",
  "task_id": "t-456",
  "event_type": "agent_turn_completed",
  "source_type": "chat",
  "content": "User prefers concise Chinese technical plans.",
  "structured_payload": {
    "model": "gpt-5",
    "tool_calls": []
  },
  "write_runtime_memory": true
}
```

Response:

```json
{
  "event_id": "uuid",
  "runtime_memory_refs": ["provider-memory-id"],
  "queued_jobs": ["extract-memory"]
}
```

### `POST /v1/memory/recall`

Retrieve relevant memory for an agent invocation.

Request:

```json
{
  "tenant_id": "uuid",
  "user_id": "uuid",
  "agent_id": "research-agent",
  "project_id": "uuid",
  "session_id": "s-123",
  "task_id": "t-456",
  "query": "Generate a technical plan for agent memory.",
  "memory_types": ["preference", "fact", "procedure", "task_state"],
  "scopes": ["session", "task", "user", "project"],
  "limit": 12,
  "include_evidence": false
}
```

Response:

```json
{
  "memories": [
    {
      "id": "uuid-or-runtime-ref",
      "layer": "L1",
      "memory_type": "preference",
      "scope": "user",
      "content": "User prefers Chinese technical plans with architecture and implementation steps.",
      "confidence": 0.91,
      "importance": 0.78,
      "source": {
        "kind": "runtime",
        "ref": "provider-memory-id"
      }
    }
  ],
  "audit_id": "uuid"
}
```

### `POST /v1/memory/remember`

Explicitly create a canonical memory.

### `POST /v1/memory/forget`

Delete, expire, or redact memory and linked runtime provider entries.

### `POST /v1/memory/feedback`

Accept user corrections, confirmations, rejections, and replacement content.

## Write Path

```text
1. Agent sends event to Memory Gateway.
2. Gateway validates identity, tenant, scope, size, sensitivity, and schema.
3. Gateway writes memory_events append-only row.
4. Gateway sends hot memory to mem0/mem9 if event is useful for immediate continuation.
5. Gateway enqueues extraction job.
6. Consolidator extracts candidates.
7. Memory Gate applies write policies.
8. Consolidator deduplicates and detects conflicts.
9. Consolidator promotes accepted candidates to memory_items.
10. Worker creates embeddings and full-text index data.
11. Access log records write decision.
```

## Recall Path

```text
1. Agent asks Memory Gateway for recall.
2. Gateway validates actor and requested scopes.
3. Gateway queries L1 runtime provider for hot session/task/user/project memory.
4. Gateway queries L2 structured memory by owner/scope/type/status.
5. Gateway runs vector search with overfetch and tenant/project filtering.
6. Gateway runs full-text search for explicit terms.
7. Gateway merges candidates and computes final score.
8. Memory Gate removes stale, unsafe, unauthorized, or low-confidence memories.
9. Gateway returns compact memory snippets with source and confidence.
10. Access log records recall decision.
```

Default scoring:

```text
score =
  0.30 * semantic_score
+ 0.20 * keyword_score
+ 0.15 * recency_score
+ 0.15 * importance
+ 0.10 * confidence
+ 0.10 * scope_match
```

## Promotion Rules

Promote from L1/events to L2 when at least one is true:

- User explicitly confirms the memory.
- Same fact/preference appears in at least 3 independent events.
- Memory affects future response style, workflow, or tool selection.
- Memory belongs to a project decision, artifact, requirement, or stable constraint.
- Memory is a reusable procedure learned from successful agent execution.

Do not promote when:

- It is a one-off task state.
- It is inferred from weak evidence.
- It contains sensitive data without explicit authorization.
- It has no clear owner/scope.
- It is only a tool intermediate result.

## Conflict Rules

If a candidate conflicts with an active memory:

```text
1. If user explicitly corrected the old memory, supersede old memory.
2. If candidate has stronger evidence and newer timestamp, mark old as superseded.
3. If both are plausible, mark both as conflicted and avoid injecting either unless asked.
4. If conflict affects security/tool permissions, require explicit user confirmation.
```

## Memory Gate Rules

Write-time checks:

- Reject missing tenant scope.
- Reject memory without owner or source.
- Reject sensitive memory unless policy allows.
- Redact secrets, credentials, tokens, and private keys.
- Downgrade low-confidence inference to event-only archive.

Read-time checks:

- Enforce tenant/user/project/agent scope.
- Exclude `deleted`, `expired`, `conflicted`, and `superseded` by default.
- Exclude memory past `valid_until`.
- Exclude memory below confidence threshold for high-impact tasks.
- Include source/evidence references for high-impact memories.

## MVP Build Slice

The smallest useful implementation should include:

1. Memory Gateway with `/events`, `/recall`, `/remember`, `/forget`, `/feedback`.
2. Runtime provider interface with one concrete provider: mem0 or mem9.
3. Supabase schema for events, items, embeddings, objects, feedback, access logs.
4. RLS baseline policies.
5. Async extraction worker with simple LLM-based candidate extraction.
6. Hybrid recall: L1 provider search + L2 structured query + vector search + FTS.
7. Memory Gate with hard-coded policy rules.
8. Basic admin/user memory inspector API.

## Suggested Repository Structure

```text
apps/memory-gateway/
  src/
    server.ts
    config.ts
    routes/
      events.ts
      recall.ts
      remember.ts
      forget.ts
      feedback.ts
    domain/
      types.ts
      scoring.ts
      policies.ts
      memory-gate.ts
      promotion.ts
    providers/
      runtime-memory-provider.ts
      mem0-provider.ts
      mem9-provider.ts
      canonical-memory-store.ts
      object-store.ts
    workers/
      extract-memory.ts
      consolidate-memory.ts
      embed-memory.ts
    db/
      supabase.ts
      rpc.ts
  tests/
    memory-gate.test.ts
    scoring.test.ts
    routes/

supabase/
  migrations/
    001_memory_schema.sql
    002_memory_rls.sql
    003_memory_rpc.sql

packages/memory-sdk/
  src/
    client.ts
    types.ts
```

## Implementation Order

### Phase 1: Schema and Contracts

- Create TypeScript domain types.
- Create Supabase migrations.
- Create runtime memory provider interface.
- Create no-op provider for local tests.
- Add unit tests for policy decisions and scoring.

### Phase 2: Gateway MVP

- Implement `/events`.
- Implement `/remember`.
- Implement `/recall` with structured query first.
- Add access logging.
- Add basic RLS migration.

### Phase 3: Runtime Provider

- Implement mem0 or mem9 provider.
- Write hot memory on selected events.
- Merge L1 and L2 recall results.

### Phase 4: Embedding and Search

- Add embedding worker.
- Add vector search RPC.
- Add full-text search.
- Add overfetch and post-filtering.

### Phase 5: Consolidation

- Add extraction worker.
- Add promotion rules.
- Add conflict handling.
- Add memory version rows.

### Phase 6: Governance

- Add forget/redact flow.
- Add feedback flow.
- Add memory inspector API.
- Add audit queries.

## Test Plan

Unit tests:

- Memory Gate rejects cross-tenant memory.
- Memory Gate excludes expired/superseded/conflicted memory.
- Scoring prioritizes scope match and importance.
- Promotion rejects weak one-off memory.
- Conflict rules supersede old memory after explicit correction.

Integration tests:

- Event capture writes `memory_events`.
- Explicit remember writes `memory_items` and `memory_versions`.
- Recall returns active user/project memories only.
- Forget expires canonical memory and calls runtime provider delete.
- Extraction worker promotes confirmed preference.

Security tests:

- Authenticated user cannot read another user's memory.
- Project memory is hidden from non-members.
- Service role access is limited to gateway/worker code paths.
- Sensitive content is redacted before promotion.

Performance checks:

- Composite indexes are used for tenant/scope queries.
- Partial indexes are used for active memory queries.
- Vector search overfetch returns enough candidates after tenant filtering.
- Connection pooling is enabled for API and workers.

## Operational Metrics

Track:

- recall latency p50/p95/p99
- L1 hit rate
- L2 hit rate
- promotion rate
- rejection rate by policy
- conflict rate
- user correction rate
- stale memory recall rate
- cross-scope block count
- embedding queue lag

## Initial Configuration

```env
MEMORY_PROVIDER=mem0
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
SUPABASE_STORAGE_BUCKET=memory-evidence
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSIONS=1536
MEMORY_RECALL_LIMIT=12
MEMORY_VECTOR_OVERFETCH=80
MEMORY_MIN_CONFIDENCE=0.55
MEMORY_HIGH_IMPACT_MIN_CONFIDENCE=0.8
```

## Vibe Coding Entry Prompt

Use this prompt to start implementation:

```text
Build the MVP for the Agent Persistent Memory Foundation described in
docs/superpowers/specs/2026-06-26-agent-memory-foundation-design.md.

Start with Phase 1 and Phase 2 only:
1. Create the TypeScript domain types.
2. Create Supabase migrations for memory_events, memory_items, memory_embeddings,
   memory_objects, memory_versions, memory_feedback, and memory_access_logs.
3. Add baseline RLS policies.
4. Implement a Fastify Memory Gateway with /v1/memory/events, /v1/memory/remember,
   and /v1/memory/recall using a no-op runtime memory provider.
5. Add unit tests for Memory Gate and scoring.
6. Add integration-style tests against mocked Supabase clients.

Do not implement mem0/mem9 provider yet. Keep the provider interface stable so
mem0 or mem9 can be added in Phase 3.
```

## Open Decisions

1. Pick mem0 or mem9 as the first runtime provider.
2. Pick Fastify or Hono for the gateway.
3. Decide whether project membership is managed inside this service or delegated to an external IAM/project service.
4. Decide whether to use Supabase Edge Functions or a standalone worker for extraction and embedding.
