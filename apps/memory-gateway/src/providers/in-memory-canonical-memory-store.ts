import type { MemoryItem, RecallCandidate, RequestScope } from "../domain/types";
import type {
  CanonicalMemoryStore,
  CaptureEventInput,
  RememberInput
} from "./canonical-memory-store";

interface StoredEvent {
  id: string;
  input: CaptureEventInput;
}

export class InMemoryCanonicalMemoryStore implements CanonicalMemoryStore {
  readonly events: StoredEvent[] = [];
  readonly memories: MemoryItem[] = [];

  async captureEvent(input: CaptureEventInput): Promise<{ eventId: string }> {
    const eventId = crypto.randomUUID();
    this.events.push({ id: eventId, input });
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
      sourceEventIds: [],
      updatedAt: new Date().toISOString()
    };
    this.memories.push(memory);
    return memory;
  }

  async recall(scope: RequestScope, _query: string, limit: number): Promise<RecallCandidate[]> {
    return this.memories
      .filter((memory) => memory.tenantId === scope.tenantId)
      .filter((memory) => !memory.projectId || !scope.projectId || memory.projectId === scope.projectId)
      .slice(0, limit)
      .map((memory) => ({
        ...memory,
        recencyScore: 0.5,
        scopeMatch: memory.projectId === scope.projectId ? 1 : 0.5
      }));
  }
}
