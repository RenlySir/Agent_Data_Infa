import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAuthenticatedScope } from "../domain/auth";
import type { RequestScope } from "../domain/types";
import type { CanonicalMemoryStore } from "../providers/canonical-memory-store";
import type {
  OpenClawSandboxProvider,
  OpenClawSandboxSnapshot,
  SandboxStatus
} from "../providers/openclaw-sandbox-provider";

const CreateSandboxBody = z.object({
  name: z.string().min(1),
  image: z.string().min(1).default("openclaw/local:latest")
});

export function openClawRoute(deps: {
  store: CanonicalMemoryStore;
  openclaw: OpenClawSandboxProvider;
  authApiKey?: string;
}): FastifyPluginAsync {
  return async (app) => {
    app.get("/v1/openclaw/sandboxes", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      return {
        sandboxes: await listSandboxSnapshots(deps.store, scope)
      };
    });

    app.post("/v1/openclaw/sandboxes", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const body = CreateSandboxBody.parse(request.body);
      const now = new Date().toISOString();
      const sandbox: OpenClawSandboxSnapshot = {
        id: crypto.randomUUID(),
        name: body.name,
        image: body.image,
        status: "created",
        createdAt: now,
        updatedAt: now,
        logs: [`${now} created sandbox ${body.name}`]
      };
      await deps.openclaw.provision(scope, sandbox);
      await recordSandboxEvent(deps.store, scope, "openclaw_sandbox_created", sandbox);
      return sandbox;
    });

    app.post("/v1/openclaw/sandboxes/:id/start", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
      const current = await getSandboxSnapshot(deps.store, scope, id);
      const sandbox = transitionSandbox(current, "running", "started");
      await deps.openclaw.start(scope, sandbox);
      await recordSandboxEvent(deps.store, scope, "openclaw_sandbox_started", sandbox);
      return sandbox;
    });

    app.post("/v1/openclaw/sandboxes/:id/stop", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
      const current = await getSandboxSnapshot(deps.store, scope, id);
      const sandbox = transitionSandbox(current, "stopped", "stopped");
      await deps.openclaw.stop(scope, sandbox);
      await recordSandboxEvent(deps.store, scope, "openclaw_sandbox_stopped", sandbox);
      return sandbox;
    });

    app.delete("/v1/openclaw/sandboxes/:id", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
      const current = await getSandboxSnapshot(deps.store, scope, id);
      const sandbox = transitionSandbox(current, "deleted", "deleted");
      await deps.openclaw.remove(scope, sandbox);
      await recordSandboxEvent(deps.store, scope, "openclaw_sandbox_deleted", sandbox);
      return sandbox;
    });
  };
}

async function recordSandboxEvent(
  store: CanonicalMemoryStore,
  scope: RequestScope,
  eventType: string,
  sandbox: OpenClawSandboxSnapshot
) {
  await store.captureEvent({
    scope: {
      ...scope,
      sessionId: `openclaw-${eventType}`
    },
    eventType,
    sourceType: "openclaw",
    content: `${eventType} ${sandbox.name}`,
    structuredPayload: { sandbox },
    writeRuntimeMemory: false
  });
}

async function getSandboxSnapshot(
  store: CanonicalMemoryStore,
  scope: RequestScope,
  id: string
): Promise<OpenClawSandboxSnapshot> {
  const sandbox = (await listSandboxSnapshots(store, scope)).find((candidate) => candidate.id === id);
  if (!sandbox) {
    const error = new Error("OpenClaw sandbox not found") as Error & { statusCode: number };
    error.statusCode = 404;
    throw error;
  }
  return sandbox;
}

async function listSandboxSnapshots(
  store: CanonicalMemoryStore,
  scope: RequestScope
): Promise<OpenClawSandboxSnapshot[]> {
  const events = await store.listEvents(scope, {
    sourceType: "openclaw",
    eventTypes: [
      "openclaw_sandbox_created",
      "openclaw_sandbox_started",
      "openclaw_sandbox_stopped",
      "openclaw_sandbox_deleted"
    ],
    limit: 500
  });
  const snapshots = new Map<string, OpenClawSandboxSnapshot>();

  for (const event of [...events].reverse()) {
    const sandbox = event.structuredPayload.sandbox;
    if (isSandboxSnapshot(sandbox)) {
      snapshots.set(sandbox.id, sandbox);
    }
  }

  return [...snapshots.values()]
    .filter((sandbox) => sandbox.status !== "deleted")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function transitionSandbox(
  sandbox: OpenClawSandboxSnapshot,
  status: SandboxStatus,
  verb: string
): OpenClawSandboxSnapshot {
  const now = new Date().toISOString();
  return {
    ...sandbox,
    status,
    updatedAt: now,
    logs: [`${now} ${verb} sandbox ${sandbox.name}`, ...sandbox.logs]
  };
}

function isSandboxSnapshot(value: unknown): value is OpenClawSandboxSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.image === "string" &&
    isSandboxStatus(candidate.status) &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.logs) &&
    candidate.logs.every((log) => typeof log === "string")
  );
}

function isSandboxStatus(value: unknown): value is SandboxStatus {
  return value === "created" || value === "running" || value === "stopped" || value === "deleted";
}
