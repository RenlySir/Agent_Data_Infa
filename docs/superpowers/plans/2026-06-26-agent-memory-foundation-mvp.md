# Agent Memory Foundation MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable Memory Gateway with Supabase canonical memory schema, baseline RLS, no-op runtime memory provider, event capture, explicit remember, and structured recall.

**Architecture:** The MVP implements the Memory Gateway and canonical memory layer first. mem0/mem9 are represented by a stable provider interface and a no-op provider so the runtime provider can be added in the next phase without changing API contracts.

**Tech Stack:** TypeScript, Fastify, Zod, Vitest, Supabase Postgres, pgvector, Postgres full-text search.

---

## File Structure

```text
apps/memory-gateway/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    server.ts
    config.ts
    routes/events.ts
    routes/remember.ts
    routes/recall.ts
    domain/types.ts
    domain/scoring.ts
    domain/policies.ts
    domain/memory-gate.ts
    providers/runtime-memory-provider.ts
    providers/noop-runtime-memory-provider.ts
    providers/canonical-memory-store.ts
    db/supabase.ts
  tests/
    scoring.test.ts
    memory-gate.test.ts
    routes/events.test.ts
    routes/remember.test.ts
    routes/recall.test.ts

supabase/
  migrations/
    001_memory_schema.sql
    002_memory_rls.sql
```

## Task 1: Project Skeleton

**Files:**
- Create: `apps/memory-gateway/package.json`
- Create: `apps/memory-gateway/tsconfig.json`
- Create: `apps/memory-gateway/vitest.config.ts`

- [ ] **Step 1: Create package config**

```json
{
  "name": "@agent-memory/memory-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@supabase/supabase-js": "^2.45.0",
    "fastify": "^4.28.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.16.2",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create TypeScript config**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create Vitest config**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
```

- [ ] **Step 4: Verify install and test runner**

Run:

```bash
cd apps/memory-gateway
npm install
npm test
```

Expected: Vitest starts and reports no tests found or zero tests.

## Task 2: Domain Types

**Files:**
- Create: `apps/memory-gateway/src/domain/types.ts`

- [ ] **Step 1: Add shared types**

```ts
export type MemoryLayer = "L1" | "L2";

export type MemoryScope =
  | "session"
  | "task"
  | "user"
  | "project"
  | "team"
  | "org"
  | "agent";

export type MemoryType =
  | "profile"
  | "preference"
  | "fact"
  | "procedure"
  | "episode"
  | "task_state"
  | "artifact";

export type MemoryStatus =
  | "active"
  | "superseded"
  | "conflicted"
  | "deleted"
  | "expired";

export type Sensitivity = "public" | "normal" | "sensitive" | "secret";

export interface RequestScope {
  tenantId: string;
  userId?: string;
  agentId: string;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
}

export interface MemoryItem {
  id: string;
  layer: MemoryLayer;
  tenantId: string;
  ownerType: string;
  ownerId: string;
  projectId?: string;
  scope: MemoryScope;
  memoryType: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  stability: number;
  sensitivity: Sensitivity;
  status: MemoryStatus;
  validUntil?: string;
  sourceEventIds: string[];
  updatedAt: string;
}

export interface RecallCandidate extends MemoryItem {
  semanticScore?: number;
  keywordScore?: number;
  recencyScore?: number;
  scopeMatch?: number;
  finalScore?: number;
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd apps/memory-gateway
npm run build
```

Expected: PASS.

## Task 3: Scoring

**Files:**
- Create: `apps/memory-gateway/src/domain/scoring.ts`
- Create: `apps/memory-gateway/tests/scoring.test.ts`

- [ ] **Step 1: Write scoring tests**

```ts
import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/domain/scoring";
import type { RecallCandidate } from "../src/domain/types";

const base: RecallCandidate = {
  id: "m1",
  layer: "L2",
  tenantId: "t1",
  ownerType: "user",
  ownerId: "u1",
  scope: "user",
  memoryType: "preference",
  content: "Prefers concise Chinese plans.",
  confidence: 0.8,
  importance: 0.7,
  stability: 0.8,
  sensitivity: "normal",
  status: "active",
  sourceEventIds: ["e1"],
  updatedAt: "2026-06-26T00:00:00.000Z"
};

describe("scoreCandidate", () => {
  it("prioritizes semantic, keyword, recency, importance, confidence, and scope match", () => {
    const scored = scoreCandidate({
      ...base,
      semanticScore: 1,
      keywordScore: 1,
      recencyScore: 1,
      scopeMatch: 1
    });

    expect(scored.finalScore).toBeCloseTo(0.3 + 0.2 + 0.15 + 0.105 + 0.08 + 0.1, 5);
  });

  it("defaults missing optional scores to zero", () => {
    const scored = scoreCandidate(base);
    expect(scored.finalScore).toBeCloseTo(0.105 + 0.08, 5);
  });
});
```

- [ ] **Step 2: Implement scoring**

```ts
import type { RecallCandidate } from "./types";

export function scoreCandidate(candidate: RecallCandidate): RecallCandidate {
  const semanticScore = candidate.semanticScore ?? 0;
  const keywordScore = candidate.keywordScore ?? 0;
  const recencyScore = candidate.recencyScore ?? 0;
  const scopeMatch = candidate.scopeMatch ?? 0;

  const finalScore =
    0.3 * semanticScore +
    0.2 * keywordScore +
    0.15 * recencyScore +
    0.15 * candidate.importance +
    0.1 * candidate.confidence +
    0.1 * scopeMatch;

  return {
    ...candidate,
    finalScore
  };
}

export function rankCandidates(candidates: RecallCandidate[]): RecallCandidate[] {
  return candidates
    .map(scoreCandidate)
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd apps/memory-gateway
npm test -- scoring.test.ts
```

Expected: PASS.

## Task 4: Memory Gate

**Files:**
- Create: `apps/memory-gateway/src/domain/memory-gate.ts`
- Create: `apps/memory-gateway/tests/memory-gate.test.ts`

- [ ] **Step 1: Write Memory Gate tests**

```ts
import { describe, expect, it } from "vitest";
import { filterRecallCandidates } from "../src/domain/memory-gate";
import type { RecallCandidate, RequestScope } from "../src/domain/types";

const scope: RequestScope = {
  tenantId: "t1",
  userId: "u1",
  agentId: "a1",
  projectId: "p1"
};

function candidate(overrides: Partial<RecallCandidate> = {}): RecallCandidate {
  return {
    id: "m1",
    layer: "L2",
    tenantId: "t1",
    ownerType: "user",
    ownerId: "u1",
    projectId: "p1",
    scope: "user",
    memoryType: "preference",
    content: "Prefers concise Chinese plans.",
    confidence: 0.8,
    importance: 0.7,
    stability: 0.8,
    sensitivity: "normal",
    status: "active",
    sourceEventIds: ["e1"],
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides
  };
}

describe("filterRecallCandidates", () => {
  it("keeps active in-scope memories", () => {
    const result = filterRecallCandidates(scope, [candidate()]);
    expect(result).toHaveLength(1);
  });

  it("rejects cross-tenant memories", () => {
    const result = filterRecallCandidates(scope, [candidate({ tenantId: "t2" })]);
    expect(result).toHaveLength(0);
  });

  it("rejects inactive statuses", () => {
    const result = filterRecallCandidates(scope, [candidate({ status: "superseded" })]);
    expect(result).toHaveLength(0);
  });

  it("rejects expired memories", () => {
    const result = filterRecallCandidates(scope, [
      candidate({ validUntil: "2020-01-01T00:00:00.000Z" })
    ]);
    expect(result).toHaveLength(0);
  });

  it("rejects low-confidence sensitive memories", () => {
    const result = filterRecallCandidates(scope, [
      candidate({ sensitivity: "sensitive", confidence: 0.5 })
    ]);
    expect(result).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement Memory Gate**

```ts
import type { RecallCandidate, RequestScope } from "./types";

const blockedStatuses = new Set(["superseded", "conflicted", "deleted", "expired"]);

export function filterRecallCandidates(
  requestScope: RequestScope,
  candidates: RecallCandidate[],
  now: Date = new Date()
): RecallCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.tenantId !== requestScope.tenantId) return false;
    if (blockedStatuses.has(candidate.status)) return false;
    if (candidate.validUntil && new Date(candidate.validUntil) <= now) return false;
    if (candidate.projectId && requestScope.projectId && candidate.projectId !== requestScope.projectId) {
      return false;
    }
    if (candidate.sensitivity === "secret") return false;
    if (candidate.sensitivity === "sensitive" && candidate.confidence < 0.8) return false;
    return true;
  });
}
```

- [ ] **Step 3: Run tests**

Run:

```bash
cd apps/memory-gateway
npm test -- memory-gate.test.ts
```

Expected: PASS.

## Task 5: Supabase Schema

**Files:**
- Create: `supabase/migrations/001_memory_schema.sql`
- Create: `supabase/migrations/002_memory_rls.sql`

- [ ] **Step 1: Create schema migration**

```sql
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
```

- [ ] **Step 2: Create RLS migration**

Enable RLS for all memory tables and add baseline tenant policies for `memory_items` and `memory_events`.

```sql
alter table memory_events enable row level security;
alter table memory_items enable row level security;
alter table memory_embeddings enable row level security;
alter table memory_objects enable row level security;
alter table memory_versions enable row level security;
alter table memory_feedback enable row level security;
alter table memory_access_logs enable row level security;

create policy memory_items_tenant_policy on memory_items
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id');

create policy memory_events_tenant_policy on memory_events
  for all
  to authenticated
  using (tenant_id::text = auth.jwt() ->> 'tenant_id');
```

- [ ] **Step 3: Apply locally**

Run:

```bash
supabase db reset
```

Expected: migrations apply without SQL errors.

## Task 6: Gateway Server and Config

**Files:**
- Create: `apps/memory-gateway/src/config.ts`
- Create: `apps/memory-gateway/src/server.ts`

- [ ] **Step 1: Add config**

```ts
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MEMORY_PROVIDER: z.enum(["noop", "mem0", "mem9"]).default("noop")
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return EnvSchema.parse(env);
}
```

- [ ] **Step 2: Add server skeleton**

```ts
import Fastify from "fastify";
import cors from "@fastify/cors";
import { loadConfig } from "./config";

export async function buildServer() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
```

- [ ] **Step 3: Run build**

Run:

```bash
cd apps/memory-gateway
npm run build
```

Expected: PASS.

## Task 7: Providers

**Files:**
- Create: `apps/memory-gateway/src/providers/runtime-memory-provider.ts`
- Create: `apps/memory-gateway/src/providers/noop-runtime-memory-provider.ts`
- Create: `apps/memory-gateway/src/providers/canonical-memory-store.ts`

- [ ] **Step 1: Define runtime provider**

```ts
import type { RecallCandidate, RequestScope } from "../domain/types";

export interface RuntimeMemoryWrite {
  scope: RequestScope;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RuntimeMemorySearch {
  scope: RequestScope;
  query: string;
  limit: number;
}

export interface RuntimeMemoryRef {
  id: string;
  provider: string;
}

export interface RuntimeMemoryProvider {
  write(input: RuntimeMemoryWrite): Promise<RuntimeMemoryRef[]>;
  search(input: RuntimeMemorySearch): Promise<RecallCandidate[]>;
  delete(id: string): Promise<void>;
}
```

- [ ] **Step 2: Implement no-op provider**

```ts
import type {
  RuntimeMemoryProvider,
  RuntimeMemorySearch,
  RuntimeMemoryWrite,
  RuntimeMemoryRef
} from "./runtime-memory-provider";
import type { RecallCandidate } from "../domain/types";

export class NoopRuntimeMemoryProvider implements RuntimeMemoryProvider {
  async write(_input: RuntimeMemoryWrite): Promise<RuntimeMemoryRef[]> {
    return [];
  }

  async search(_input: RuntimeMemorySearch): Promise<RecallCandidate[]> {
    return [];
  }

  async delete(_id: string): Promise<void> {
    return;
  }
}
```

- [ ] **Step 3: Stub canonical store interface**

```ts
import type { MemoryItem, RecallCandidate, RequestScope } from "../domain/types";

export interface CaptureEventInput {
  scope: RequestScope;
  eventType: string;
  sourceType: string;
  content?: string;
  structuredPayload: Record<string, unknown>;
  writeRuntimeMemory: boolean;
}

export interface RememberInput {
  scope: RequestScope;
  ownerType: string;
  ownerId: string;
  memoryType: MemoryItem["memoryType"];
  memoryScope: MemoryItem["scope"];
  content: string;
  confidence?: number;
  importance?: number;
}

export interface CanonicalMemoryStore {
  captureEvent(input: CaptureEventInput): Promise<{ eventId: string }>;
  remember(input: RememberInput): Promise<MemoryItem>;
  recall(scope: RequestScope, query: string, limit: number): Promise<RecallCandidate[]>;
}
```

- [ ] **Step 4: Run build**

Run:

```bash
cd apps/memory-gateway
npm run build
```

Expected: PASS.

## Task 8: Route Contracts

**Files:**
- Create: `apps/memory-gateway/src/routes/events.ts`
- Create: `apps/memory-gateway/src/routes/remember.ts`
- Create: `apps/memory-gateway/src/routes/recall.ts`

- [ ] **Step 1: Add events route**

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { CanonicalMemoryStore } from "../providers/canonical-memory-store";
import type { RuntimeMemoryProvider } from "../providers/runtime-memory-provider";

const EventsBody = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  agent_id: z.string().min(1),
  project_id: z.string().uuid().optional(),
  session_id: z.string().min(1),
  task_id: z.string().optional(),
  event_type: z.string().min(1),
  source_type: z.string().min(1),
  content: z.string().optional(),
  structured_payload: z.record(z.unknown()).default({}),
  write_runtime_memory: z.boolean().default(false)
});

export function eventsRoute(deps: {
  store: CanonicalMemoryStore;
  runtime: RuntimeMemoryProvider;
}): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/memory/events", async (request) => {
      const body = EventsBody.parse(request.body);
      const scope = {
        tenantId: body.tenant_id,
        userId: body.user_id,
        agentId: body.agent_id,
        projectId: body.project_id,
        sessionId: body.session_id,
        taskId: body.task_id
      };
      const event = await deps.store.captureEvent({
        scope,
        eventType: body.event_type,
        sourceType: body.source_type,
        content: body.content,
        structuredPayload: body.structured_payload,
        writeRuntimeMemory: body.write_runtime_memory
      });
      const runtimeRefs = body.write_runtime_memory && body.content
        ? await deps.runtime.write({
            scope,
            content: body.content,
            metadata: body.structured_payload
          })
        : [];
      return {
        event_id: event.eventId,
        runtime_memory_refs: runtimeRefs.map((ref) => ref.id),
        queued_jobs: ["extract-memory"]
      };
    });
  };
}
```

- [ ] **Step 2: Add remember route**

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { CanonicalMemoryStore } from "../providers/canonical-memory-store";

const RememberBody = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  agent_id: z.string().min(1),
  project_id: z.string().uuid().optional(),
  owner_type: z.string().min(1),
  owner_id: z.string().min(1),
  memory_type: z.enum(["profile", "preference", "fact", "procedure", "episode", "task_state", "artifact"]),
  scope: z.enum(["session", "task", "user", "project", "team", "org", "agent"]),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().min(0).max(1).optional()
});

export function rememberRoute(deps: { store: CanonicalMemoryStore }): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/memory/remember", async (request) => {
      const body = RememberBody.parse(request.body);
      return deps.store.remember({
        scope: {
          tenantId: body.tenant_id,
          userId: body.user_id,
          agentId: body.agent_id,
          projectId: body.project_id
        },
        ownerType: body.owner_type,
        ownerId: body.owner_id,
        memoryType: body.memory_type,
        memoryScope: body.scope,
        content: body.content,
        confidence: body.confidence,
        importance: body.importance
      });
    });
  };
}
```

- [ ] **Step 3: Add recall route**

```ts
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { filterRecallCandidates } from "../domain/memory-gate";
import { rankCandidates } from "../domain/scoring";
import type { CanonicalMemoryStore } from "../providers/canonical-memory-store";
import type { RuntimeMemoryProvider } from "../providers/runtime-memory-provider";

const RecallBody = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid().optional(),
  agent_id: z.string().min(1),
  project_id: z.string().uuid().optional(),
  session_id: z.string().optional(),
  task_id: z.string().optional(),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(12)
});

export function recallRoute(deps: {
  store: CanonicalMemoryStore;
  runtime: RuntimeMemoryProvider;
}): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/memory/recall", async (request) => {
      const body = RecallBody.parse(request.body);
      const scope = {
        tenantId: body.tenant_id,
        userId: body.user_id,
        agentId: body.agent_id,
        projectId: body.project_id,
        sessionId: body.session_id,
        taskId: body.task_id
      };
      const [runtimeHits, canonicalHits] = await Promise.all([
        deps.runtime.search({ scope, query: body.query, limit: body.limit }),
        deps.store.recall(scope, body.query, body.limit * 4)
      ]);
      const memories = rankCandidates(
        filterRecallCandidates(scope, [...runtimeHits, ...canonicalHits])
      ).slice(0, body.limit);
      return {
        memories,
        audit_id: crypto.randomUUID()
      };
    });
  };
}
```

- [ ] **Step 4: Register routes in server**

Update `server.ts` to register all three route plugins.

- [ ] **Step 5: Add route tests**

Use Fastify `app.inject()` and mocked providers to verify:

```text
events route returns event_id and runtime_memory_refs
remember route returns created memory item
recall route filters and ranks returned candidates
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd apps/memory-gateway
npm test
```

Expected: PASS.

## Task 9: Supabase Store Implementation

**Files:**
- Create: `apps/memory-gateway/src/db/supabase.ts`
- Modify: `apps/memory-gateway/src/providers/canonical-memory-store.ts`

- [ ] **Step 1: Create Supabase client factory**

```ts
import { createClient } from "@supabase/supabase-js";
import type { AppConfig } from "../config";

export function createSupabaseClient(config: AppConfig) {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
```

- [ ] **Step 2: Implement canonical store against Supabase**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecallCandidate, RequestScope } from "../domain/types";
import type {
  CanonicalMemoryStore,
  CaptureEventInput,
  RememberInput
} from "./canonical-memory-store";

export class SupabaseCanonicalMemoryStore implements CanonicalMemoryStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async captureEvent(input: CaptureEventInput): Promise<{ eventId: string }> {
    const { data, error } = await this.supabase
      .from("memory_events")
      .insert({
        tenant_id: input.scope.tenantId,
        user_id: input.scope.userId,
        agent_id: input.scope.agentId,
        project_id: input.scope.projectId,
        session_id: input.scope.sessionId,
        task_id: input.scope.taskId,
        event_type: input.eventType,
        source_type: input.sourceType,
        content: input.content,
        structured_payload: input.structuredPayload
      })
      .select("id")
      .single();
    if (error) throw error;
    return { eventId: data.id };
  }

  async remember(input: RememberInput) {
    const { data, error } = await this.supabase
      .from("memory_items")
      .insert({
        tenant_id: input.scope.tenantId,
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        project_id: input.scope.projectId,
        scope: input.memoryScope,
        memory_type: input.memoryType,
        content: input.content,
        confidence: input.confidence ?? 0.8,
        importance: input.importance ?? 0.5,
        stability: 0.8,
        status: "active"
      })
      .select("*")
      .single();
    if (error) throw error;

    await this.supabase.from("memory_versions").insert({
      tenant_id: input.scope.tenantId,
      memory_id: data.id,
      version_number: 1,
      content: input.content,
      structured_payload: {},
      change_reason: "explicit_remember",
      created_by: input.scope.agentId
    });

    return {
      id: data.id,
      layer: "L2" as const,
      tenantId: data.tenant_id,
      ownerType: data.owner_type,
      ownerId: data.owner_id,
      projectId: data.project_id,
      scope: data.scope,
      memoryType: data.memory_type,
      content: data.content,
      confidence: Number(data.confidence),
      importance: Number(data.importance),
      stability: Number(data.stability),
      sensitivity: data.sensitivity,
      status: data.status,
      validUntil: data.valid_until,
      sourceEventIds: data.source_event_ids ?? [],
      updatedAt: data.updated_at
    };
  }

  async recall(scope: RequestScope, _query: string, limit: number): Promise<RecallCandidate[]> {
    let query = this.supabase
      .from("memory_items")
      .select("*")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (scope.projectId) query = query.or(`project_id.eq.${scope.projectId},project_id.is.null`);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      layer: "L2",
      tenantId: row.tenant_id,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      projectId: row.project_id,
      scope: row.scope,
      memoryType: row.memory_type,
      content: row.content,
      confidence: Number(row.confidence),
      importance: Number(row.importance),
      stability: Number(row.stability),
      sensitivity: row.sensitivity,
      status: row.status,
      validUntil: row.valid_until,
      sourceEventIds: row.source_event_ids ?? [],
      updatedAt: row.updated_at,
      recencyScore: 0.5,
      scopeMatch: row.project_id === scope.projectId ? 1 : 0.5
    }));
  }
}
```

- [ ] **Step 3: Add mocked Supabase tests**

Verify insert/select payloads without needing a live Supabase project.

- [ ] **Step 4: Run build and tests**

Run:

```bash
cd apps/memory-gateway
npm run build
npm test
```

Expected: PASS.

## Task 10: MVP Verification

**Files:**
- Modify: `apps/memory-gateway/src/server.ts`
- Modify: `apps/memory-gateway/src/routes/events.ts`
- Modify: `apps/memory-gateway/src/routes/remember.ts`
- Modify: `apps/memory-gateway/src/routes/recall.ts`

- [ ] **Step 1: Start local server**

Run:

```bash
cd apps/memory-gateway
PORT=8787 SUPABASE_URL=http://localhost:54321 SUPABASE_SERVICE_ROLE_KEY=test MEMORY_PROVIDER=noop npm run dev
```

Expected: server listens on `http://localhost:8787`.

- [ ] **Step 2: Health check**

Run:

```bash
curl http://localhost:8787/healthz
```

Expected:

```json
{"ok":true}
```

- [ ] **Step 3: Capture event smoke test**

Run:

```bash
curl -X POST http://localhost:8787/v1/memory/events \
  -H 'content-type: application/json' \
  -d '{
    "tenant_id": "00000000-0000-0000-0000-000000000001",
    "user_id": "00000000-0000-0000-0000-000000000002",
    "agent_id": "research-agent",
    "session_id": "s-1",
    "event_type": "agent_turn_completed",
    "source_type": "chat",
    "content": "User prefers concise Chinese technical plans.",
    "structured_payload": {},
    "write_runtime_memory": true
  }'
```

Expected: JSON response includes `event_id`, `runtime_memory_refs`, and `queued_jobs`.

- [ ] **Step 4: Final checks**

Run:

```bash
cd apps/memory-gateway
npm run build
npm test
```

Expected: PASS.
