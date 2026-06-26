import type { MemoryItem, RecallCandidate, RequestScope } from "../domain/types";
import { extractKeywordCounts } from "../domain/keywords";
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

interface StoredEvent {
  id: string;
  input: CaptureEventInput;
  createdAt: string;
}

export class InMemoryCanonicalMemoryStore implements CanonicalMemoryStore {
  readonly events: StoredEvent[] = [];
  readonly memories: MemoryItem[] = [];
  readonly accessLogs: AccessLogEntry[] = [];

  async captureEvent(input: CaptureEventInput): Promise<{ eventId: string }> {
    const eventId = crypto.randomUUID();
    this.events.push({ id: eventId, input, createdAt: new Date().toISOString() });
    return { eventId };
  }

  async remember(input: RememberInput): Promise<MemoryItem> {
    const memory: MemoryItem = {
      id: crypto.randomUUID(),
      layer: "L2",
      tenantId: input.scope.tenantId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      projectId: input.scope.projectId,
      scope: input.memoryScope,
      memoryType: input.memoryType,
      content: input.content,
      confidence: input.confidence ?? 0.8,
      importance: input.importance ?? 0.5,
      stability: 0.8,
      sensitivity: "normal",
      status: "active",
      sourceEventIds: input.sourceEventIds ?? [],
      updatedAt: new Date().toISOString()
    };
    this.memories.push(memory);
    return memory;
  }

  async recall(scope: RequestScope, _query: string, limit: number): Promise<RecallCandidate[]> {
    return this.memories
      .filter((memory) => memory.tenantId === scope.tenantId)
      .filter((memory) => !memory.projectId || memory.projectId === scope.projectId)
      .slice(0, limit)
      .map((memory) => ({
        ...memory,
        recencyScore: 0.5,
        scopeMatch: memory.projectId === scope.projectId ? 1 : 0.5
      }));
  }

  async logAccess(input: AccessLogInput): Promise<{ auditId: string }> {
    const auditId = crypto.randomUUID();
    this.accessLogs.push({ ...input, id: auditId, createdAt: new Date().toISOString() });
    return { auditId };
  }

  async listAccessLogs(scope: RequestScope, limit: number): Promise<AccessLogEntry[]> {
    return this.accessLogs
      .filter((log) => log.tenantId === scope.tenantId)
      .slice(-limit)
      .reverse();
  }

  async listEvents(scope: RequestScope, input: ListEventsInput = {}): Promise<MemoryEventEntry[]> {
    const limit = input.limit ?? 100;
    const eventTypes = new Set(input.eventTypes ?? []);

    return this.events
      .filter((event) => event.input.scope.tenantId === scope.tenantId)
      .filter((event) => !scope.projectId || event.input.scope.projectId === scope.projectId)
      .filter((event) => !input.sourceType || event.input.sourceType === input.sourceType)
      .filter((event) => eventTypes.size === 0 || eventTypes.has(event.input.eventType))
      .slice(-limit)
      .reverse()
      .map((event) => ({
        id: event.id,
        scope: event.input.scope,
        eventType: event.input.eventType,
        sourceType: event.input.sourceType,
        content: event.input.content,
        structuredPayload: event.input.structuredPayload,
        createdAt: event.createdAt
      }));
  }

  async keywordCounts(scope: RequestScope, limit: number): Promise<KeywordCount[]> {
    const eventTexts = this.events
      .filter((event) => event.input.scope.tenantId === scope.tenantId)
      .filter((event) => !scope.projectId || event.input.scope.projectId === scope.projectId)
      .map((event) => event.input.content ?? "");
    const memoryTexts = this.memories
      .filter((memory) => memory.tenantId === scope.tenantId)
      .filter((memory) => !memory.projectId || memory.projectId === scope.projectId)
      .map((memory) => memory.content);

    return extractKeywordCounts([...eventTexts, ...memoryTexts], limit);
  }
}
