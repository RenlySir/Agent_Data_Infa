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

      const runtimeRefs =
        body.write_runtime_memory && body.content
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
