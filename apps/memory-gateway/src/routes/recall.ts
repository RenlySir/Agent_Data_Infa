import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAuthenticatedScope } from "../domain/auth";
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
  authApiKey?: string;
}): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/memory/recall", async (request) => {
      const body = RecallBody.parse(request.body);
      const authScope = getAuthenticatedScope(request, deps.authApiKey);
      const scope = {
        tenantId: authScope.tenantId,
        userId: authScope.userId,
        agentId: authScope.agentId,
        projectId: authScope.projectId,
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
      const audit = await deps.store.logAccess({
        tenantId: scope.tenantId,
        actorType: "agent",
        actorId: scope.agentId,
        operation: "memory.recall",
        memoryIds: memories.map((memory) => memory.id),
        requestScope: { ...scope },
        decision: "allow"
      });

      return {
        memories,
        audit_id: audit.auditId
      };
    });
  };
}
