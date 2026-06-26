import type { MemoryItem, RecallCandidate, RequestScope } from "../domain/types";

export interface CaptureEventInput {
  scope: RequestScope;
  eventType: string;
  sourceType: string;
  content?: string;
  structuredPayload: Record<string, unknown>;
  writeRuntimeMemory: boolean;
}

export interface RememberInput {
  scope: RequestScope;
  ownerType: string;
  ownerId: string;
  memoryType: MemoryItem["memoryType"];
  memoryScope: MemoryItem["scope"];
  content: string;
  confidence?: number;
  importance?: number;
  sourceEventIds?: string[];
  confirmedByUser?: boolean;
}

export interface AccessLogInput {
  tenantId: string;
  actorType: string;
  actorId: string;
  operation: string;
  memoryIds?: string[];
  requestScope: Record<string, unknown>;
  decision: "allow" | "deny";
  reason?: string;
}

export interface CanonicalMemoryStore {
  captureEvent(input: CaptureEventInput): Promise<{ eventId: string }>;
  remember(input: RememberInput): Promise<MemoryItem>;
  recall(scope: RequestScope, query: string, limit: number): Promise<RecallCandidate[]>;
  logAccess(input: AccessLogInput): Promise<{ auditId: string }>;
}
