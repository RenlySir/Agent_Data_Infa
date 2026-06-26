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
