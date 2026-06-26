import type { SupabaseClient } from "@supabase/supabase-js";
import { extractKeywordCounts } from "../domain/keywords";
import type { RecallCandidate, RequestScope } from "../domain/types";
import type {
  CaptureEventInput,
  AccessLogInput,
  AccessLogEntry,
  CanonicalMemoryStore,
  KeywordCount,
  ListEventsInput,
  MemoryEventEntry,
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
        status: "active",
        source_event_ids: input.sourceEventIds ?? []
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
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row) => ({
      ...mapMemoryRow(row),
      recencyScore: 0.5,
      scopeMatch: row.project_id === scope.projectId ? 1 : 0.5
    }));
  }

  async logAccess(input: AccessLogInput): Promise<{ auditId: string }> {
    const { data, error } = await this.supabase
      .from("memory_access_logs")
      .insert({
        tenant_id: input.tenantId,
        actor_type: input.actorType,
        actor_id: input.actorId,
        operation: input.operation,
        memory_ids: input.memoryIds ?? [],
        request_scope: input.requestScope,
        decision: input.decision,
        reason: input.reason
      })
      .select("id")
      .single();

    if (error) throw error;
    return { auditId: data.id };
  }

  async listAccessLogs(scope: RequestScope, limit: number): Promise<AccessLogEntry[]> {
    const { data, error } = await this.supabase
      .from("memory_access_logs")
      .select("*")
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      operation: row.operation,
      memoryIds: row.memory_ids ?? [],
      requestScope: row.request_scope ?? {},
      decision: row.decision,
      reason: row.reason ?? undefined,
      createdAt: row.created_at
    }));
  }

  async listEvents(scope: RequestScope, input: ListEventsInput = {}): Promise<MemoryEventEntry[]> {
    const limit = input.limit ?? 100;
    let query = this.supabase
      .from("memory_events")
      .select(
        "id, tenant_id, user_id, agent_id, project_id, session_id, task_id, event_type, source_type, content, structured_payload, created_at"
      )
      .eq("tenant_id", scope.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope.projectId) {
      query = query.eq("project_id", scope.projectId);
    }
    if (input.sourceType) {
      query = query.eq("source_type", input.sourceType);
    }
    if (input.eventTypes?.length) {
      query = query.in("event_type", input.eventTypes);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? []).map((row) => ({
      id: row.id,
      scope: {
        tenantId: row.tenant_id,
        userId: row.user_id ?? undefined,
        agentId: row.agent_id,
        projectId: row.project_id ?? undefined,
        sessionId: row.session_id,
        taskId: row.task_id ?? undefined
      },
      eventType: row.event_type,
      sourceType: row.source_type,
      content: row.content ?? undefined,
      structuredPayload: row.structured_payload ?? {},
      createdAt: row.created_at
    }));
  }

  async keywordCounts(scope: RequestScope, limit: number): Promise<KeywordCount[]> {
    let query = this.supabase
      .from("memory_items")
      .select("content, project_id")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "active")
      .limit(500);

    if (scope.projectId) {
      query = query.or(`project_id.eq.${scope.projectId},project_id.is.null`);
    } else {
      query = query.is("project_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return extractKeywordCounts((data ?? []).map((row) => row.content ?? ""), limit);
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
