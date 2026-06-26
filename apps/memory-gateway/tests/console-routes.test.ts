import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { InMemoryCanonicalMemoryStore } from "../src/providers/in-memory-canonical-memory-store";
import { NoopRuntimeMemoryProvider } from "../src/providers/noop-runtime-memory-provider";

const apiKey = "test-memory-key";
const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const projectId = "00000000-0000-0000-0000-000000000003";

function authHeaders(extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer ${apiKey}`,
    "x-memory-tenant-id": tenantId,
    "x-memory-user-id": userId,
    "x-memory-agent-id": "research-agent",
    "x-memory-project-id": projectId,
    ...extra
  };
}

describe("console routes", () => {
  it("returns control-plane status", async () => {
    const app = await buildServer({
      store: new InMemoryCanonicalMemoryStore(),
      runtime: new NoopRuntimeMemoryProvider(),
      authApiKey: apiKey
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/control-plane/status",
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      runtimeMemory: { provider: "mem0", status: "configured" },
      gateway: { status: "online" },
      consolidator: { status: "idle" },
      memoryGate: { status: "enforcing" }
    });
    await app.close();
  });

  it("creates, starts, and stops OpenClaw sandboxes", async () => {
    const app = await buildServer({
      store: new InMemoryCanonicalMemoryStore(),
      runtime: new NoopRuntimeMemoryProvider(),
      authApiKey: apiKey
    });

    const created = await app.inject({
      method: "POST",
      url: "/v1/openclaw/sandboxes",
      headers: authHeaders(),
      payload: {
        name: "research-sandbox",
        image: "openclaw/local:latest"
      }
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      name: "research-sandbox",
      status: "created"
    });

    const id = created.json().id;
    const started = await app.inject({
      method: "POST",
      url: `/v1/openclaw/sandboxes/${id}/start`,
      headers: authHeaders()
    });
    expect(started.json()).toMatchObject({ id, status: "running" });

    const stopped = await app.inject({
      method: "POST",
      url: `/v1/openclaw/sandboxes/${id}/stop`,
      headers: authHeaders()
    });
    expect(stopped.json()).toMatchObject({ id, status: "stopped" });

    const list = await app.inject({
      method: "GET",
      url: "/v1/openclaw/sandboxes",
      headers: authHeaders()
    });
    expect(list.json().sandboxes).toHaveLength(1);
    expect(list.json().sandboxes[0]).toMatchObject({ id, status: "stopped" });
    await app.close();
  });

  it("allows browser preflight requests for OpenClaw sandbox deletion", async () => {
    const app = await buildServer({
      store: new InMemoryCanonicalMemoryStore(),
      runtime: new NoopRuntimeMemoryProvider(),
      authApiKey: apiKey
    });

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/openclaw/sandboxes/sandbox-1",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization,content-type"
      }
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("DELETE");
    await app.close();
  });

  it("returns keyword rankings sorted by count", async () => {
    const store = new InMemoryCanonicalMemoryStore();
    await store.captureEvent({
      scope: { tenantId, userId, agentId: "research-agent", projectId, sessionId: "s-1" },
      eventType: "agent_turn_completed",
      sourceType: "chat",
      content: "memory gateway memory gate openclaw memory",
      structuredPayload: {},
      writeRuntimeMemory: false
    });
    const app = await buildServer({
      store,
      runtime: new NoopRuntimeMemoryProvider(),
      authApiKey: apiKey
    });

    const response = await app.inject({
      method: "GET",
      url: "/v1/analytics/keywords?limit=3",
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().keywords[0]).toMatchObject({
      keyword: "memory",
      count: 3
    });
    await app.close();
  });
});
