import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { InMemoryCanonicalMemoryStore } from "../src/providers/in-memory-canonical-memory-store";
import { NoopRuntimeMemoryProvider } from "../src/providers/noop-runtime-memory-provider";

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const projectId = "00000000-0000-0000-0000-000000000003";

describe("memory routes", () => {
  it("captures events", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider() });

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

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      runtime_memory_refs: [],
      queued_jobs: ["extract-memory"]
    });
    expect(response.json().event_id).toEqual(expect.any(String));
    await app.close();
  });

  it("remembers and recalls canonical memory", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    const app = await buildServer({ store, runtime: new NoopRuntimeMemoryProvider() });

    const remember = await app.inject({
      method: "POST",
      url: "/v1/memory/remember",
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
        confidence: 0.9,
        importance: 0.8
      }
    });

    expect(remember.statusCode).toBe(200);

    const recall = await app.inject({
      method: "POST",
      url: "/v1/memory/recall",
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
    await app.close();
  });
});
