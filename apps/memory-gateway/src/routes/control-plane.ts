import type { FastifyPluginAsync } from "fastify";
import { getAuthenticatedScope } from "../domain/auth";
import type { CanonicalMemoryStore } from "../providers/canonical-memory-store";

export function controlPlaneRoute(deps: {
  store: CanonicalMemoryStore;
  authApiKey?: string;
}): FastifyPluginAsync {
  return async (app) => {
    app.get("/v1/control-plane/status", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const logs = await deps.store.listAccessLogs(scope, 200);
      const denyCount = logs.filter((log) => log.decision === "deny").length;

      return {
        runtimeMemory: {
          provider: "mem0",
          status: "configured"
        },
        gateway: {
          status: "online",
          recentRequests: logs.length,
          denyCount
        },
        consolidator: {
          status: "idle",
          queueDepth: 0,
          promotedToday: 0,
          failedToday: 0
        },
        memoryGate: {
          status: "enforcing",
          allowCount: logs.length - denyCount,
          denyCount
        }
      };
    });

    app.get("/v1/control-plane/gate-decisions", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const logs = await deps.store.listAccessLogs(scope, 100);
      return {
        decisions: logs.filter((log) => log.operation.startsWith("memory."))
      };
    });
  };
}
