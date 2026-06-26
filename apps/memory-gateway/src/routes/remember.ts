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
