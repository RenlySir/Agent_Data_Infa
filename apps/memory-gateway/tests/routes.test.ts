import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { InMemoryCanonicalMemoryStore } from "../src/providers/in-memory-canonical-memory-store";
import { NoopRuntimeMemoryProvider } from "../src/providers/noop-runtime-memory-provider";

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const projectId = "00000000-0000-0000-0000-000000000003";
const apiKey = "test-memory-key";

function authHeaders(overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${apiKey}`,
    "x-memory-tenant-id": tenantId,
    "x-memory-user-id": userId,
    "x-memory-agent-id": "research-agent",
    ...overrides
  };
}

describe("memory routes", () => {
  it("rejects memory routes without authentication", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        session_id: "s-1",
        event_type: "agent_turn_completed",
        source_type: "chat",
        content: "User prefers concise Chinese technical plans.",
        structured_payload: {},
        write_runtime_memory: true
      }
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects memory routes with an invalid API key", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      headers: authHeaders({ authorization: "Bearer wrong-key" }),
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        session_id: "s-1",
        event_type: "agent_turn_completed",
        source_type: "chat",
        content: "User prefers concise Chinese technical plans.",
        structured_payload: {},
        write_runtime_memory: true
      }
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("captures events using authenticated scope instead of spoofable body scope", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/events",
      headers: authHeaders(),
      payload: {
        tenant_id: "00000000-0000-0000-0000-000000000099",
        user_id: "00000000-0000-0000-0000-000000000098",
        agent_id: "spoofed-agent",
        session_id: "s-1",
        event_type: "agent_turn_completed",
        source_type: "chat",
        content: "User prefers concise Chinese technical plans.",
        structured_payload: {},
        write_runtime_memory: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      runtime_memory_refs: [],
      queued_jobs: ["extract-memory"]
    });
    expect(response.json().event_id).toEqual(expect.any(String));
    expect(store.events[0].input.scope).toMatchObject({
      tenantId,
      userId,
      agentId: "research-agent"
    });
    expect(store.accessLogs[0]).toMatchObject({
      operation: "memory.events.capture",
      decision: "allow"
    });
    await app.close();
  });

  it("remembers and recalls canonical memory", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const remember = await app.inject({
      method: "POST",
      url: "/v1/memory/remember",
      headers: authHeaders({
        "x-memory-project-id": projectId
      }),
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        project_id: projectId,
        owner_type: "user",
        owner_id: userId,
        memory_type: "preference",
        scope: "user",
        content: "User prefers concise Chinese technical plans.",
        confirmed_by_user: true,
        confidence: 0.9,
        importance: 0.8
      }
    });

    expect(remember.statusCode).toBe(200);

    const recall = await app.inject({
      method: "POST",
      url: "/v1/memory/recall",
      headers: authHeaders({
        "x-memory-project-id": projectId
      }),
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        project_id: projectId,
        query: "technical plan preference",
        limit: 5
      }
    });

    expect(recall.statusCode).toBe(200);
    expect(recall.json().memories).toHaveLength(1);
    expect(recall.json().memories[0].content).toContain("concise Chinese");
    expect(recall.json().audit_id).toEqual(expect.any(String));
    await app.close();
  });

  it("rejects explicit remember without source evidence or user confirmation", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/remember",
      headers: authHeaders(),
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        owner_type: "user",
        owner_id: userId,
        memory_type: "preference",
        scope: "user",
        content: "User prefers concise Chinese technical plans."
      }
    });

    expect(response.statusCode).toBe(400);
    expect(store.memories).toHaveLength(0);
    expect(store.accessLogs[0]).toMatchObject({
      operation: "memory.remember",
      decision: "deny"
    });
    await app.close();
  });

  it("rejects explicit remember containing secrets", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/remember",
      headers: authHeaders(),
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        owner_type: "user",
        owner_id: userId,
        memory_type: "fact",
        scope: "user",
        content: "API key is sk-live-1234567890abcdef",
        confirmed_by_user: true
      }
    });

    expect(response.statusCode).toBe(400);
    expect(store.memories).toHaveLength(0);
    await app.close();
  });

  it("does not return project memory when recall omits project context", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    await store.remember({
      scope: {
        tenantId,
        userId,
        agentId: "research-agent",
        projectId
      },
      ownerType: "project",
      ownerId: projectId,
      memoryType: "fact",
      memoryScope: "project",
      content: "Project secret planning memory",
      confidence: 0.9,
      importance: 0.8,
      confirmedByUser: true
    });
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider(), authApiKey: apiKey });

    const response = await app.inject({
      method: "POST",
      url: "/v1/memory/recall",
      headers: authHeaders(),
      payload: {
        tenant_id: tenantId,
        user_id: userId,
        agent_id: "research-agent",
        query: "Project secret planning memory",
        limit: 5
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().memories).toHaveLength(0);
    await app.close();
  });
});
