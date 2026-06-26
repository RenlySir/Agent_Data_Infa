import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAuthenticatedScope } from "../domain/auth";
import { validateRememberWrite } from "../domain/write-gate";
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
  source_event_ids: z.array(z.string().uuid()).default([]),
  confirmed_by_user: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
  importance: z.number().min(0).max(1).optional()
});

export function rememberRoute(deps: { store: CanonicalMemoryStore; authApiKey?: string }): FastifyPluginAsync {
  return async (app) => {
    app.post("/v1/memory/remember", async (request, reply) => {
      const body = RememberBody.parse(request.body);
      const authScope = getAuthenticatedScope(request, deps.authApiKey);
      const writeDecision = validateRememberWrite({
        content: body.content,
        confirmedByUser: body.confirmed_by_user,
        sourceEventIds: body.source_event_ids
      });

      if (!writeDecision.allowed) {
        await deps.store.logAccess({
          tenantId: authScope.tenantId,
          actorType: "agent",
          actorId: authScope.agentId,
          operation: "memory.remember",
          requestScope: { ...authScope },
          decision: "deny",
          reason: writeDecision.reason
        });
        return reply.status(400).send({
          error: "bad_request",
          message: writeDecision.reason
        });
      }

      const memory = await deps.store.remember({
        scope: {
          tenantId: authScope.tenantId,
          userId: authScope.userId,
          agentId: authScope.agentId,
          projectId: authScope.projectId
        },
        ownerType: body.owner_type,
        ownerId: body.owner_id,
        memoryType: body.memory_type,
        memoryScope: body.scope,
        content: body.content,
        confidence: body.confidence,
        importance: body.importance,
        sourceEventIds: body.source_event_ids,
        confirmedByUser: body.confirmed_by_user
      });
      await deps.store.logAccess({
        tenantId: authScope.tenantId,
        actorType: "agent",
        actorId: authScope.agentId,
        operation: "memory.remember",
        memoryIds: [memory.id],
        requestScope: { ...authScope },
        decision: "allow"
      });
      return memory;
    });
  };
}
