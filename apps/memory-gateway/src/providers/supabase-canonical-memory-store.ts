import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecallCandidate, RequestScope } from "../domain/types";
import type {
  CanonicalMemoryStore,
  CaptureEventInput,
  RememberInput
} from "./canonical-memory-store";

export class SupabaseCanonicalMemoryStore implements CanonicalMemoryStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async captureEvent(input: CaptureEventInput): Promise<{ eventId: string }> {
    const { data, error } = await this.supabase
      .from("memory_events")
      .insert({
        tenant_id: input.scope.tenantId,
        user_id: input.scope.userId,
        agent_id: input.scope.agentId,
        project_id: input.scope.projectId,
        session_id: input.scope.sessionId,
        task_id: input.scope.taskId,
        event_type: input.eventType,
        source_type: input.sourceType,
        content: input.content,
        structured_payload: input.structuredPayload
      })
      .select("id")
      .single();

    if (error) throw error;
    return { eventId: data.id };
  }

  async remember(input: RememberInput) {
    const { data, error } = await this.supabase
      .from("memory_items")
      .insert({
        tenant_id: input.scope.tenantId,
        owner_type: input.ownerType,
        owner_id: input.ownerId,
        project_id: input.scope.projectId,
        scope: input.memoryScope,
        memory_type: input.memoryType,
        content: input.content,
        confidence: input.confidence ?? 0.8,
        importance: input.importance ?? 0.5,
        stability: 0.8,
        status: "active"
      })
      .select("*")
      .single();

    if (error) throw error;

    const { error: versionError } = await this.supabase.from("memory_versions").insert({
      tenant_id: input.scope.tenantId,
      memory_id: data.id,
      version_number: 1,
      content: input.content,
      structured_payload: {},
      change_reason: "explicit_remember",
      created_by: input.scope.agentId
    });

    if (versionError) throw versionError;

    return mapMemoryRow(data);
  }

  async recall(scope: RequestScope, _query: string, limit: number): Promise<RecallCandidate[]> {
    let query = this.supabase
      .from("memory_items")
      .select("*")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (scope.projectId) {
      query = query.or(`project_id.eq.${scope.projectId},project_id.is.null`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...mapMemoryRow(row),
      recencyScore: 0.5,
      scopeMatch: row.project_id === scope.projectId ? 1 : 0.5
    }));
  }
}

function mapMemoryRow(row: any) {
  return {
    id: row.id,
    layer: "L2" as const,
    tenantId: row.tenant_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    projectId: row.project_id ?? undefined,
    scope: row.scope,
    memoryType: row.memory_type,
    content: row.content,
    confidence: Number(row.confidence),
    importance: Number(row.importance),
    stability: Number(row.stability),
    sensitivity: row.sensitivity,
    status: row.status,
    validUntil: row.valid_until ?? undefined,
    sourceEventIds: row.source_event_ids ?? [],
    updatedAt: row.updated_at
  };
}
