export type MemoryLayer = "L1" | "L2";

export type MemoryScope =
  | "session"
  | "task"
  | "user"
  | "project"
  | "team"
  | "org"
  | "agent";

export type MemoryType =
  | "profile"
  | "preference"
  | "fact"
  | "procedure"
  | "episode"
  | "task_state"
  | "artifact";

export type MemoryStatus =
  | "active"
  | "superseded"
  | "conflicted"
  | "deleted"
  | "expired";

export type Sensitivity = "public" | "normal" | "sensitive" | "secret";

export interface RequestScope {
  tenantId: string;
  userId?: string;
  agentId: string;
  projectId?: string;
  sessionId?: string;
  taskId?: string;
}

export interface MemoryItem {
  id: string;
  layer: MemoryLayer;
  tenantId: string;
  ownerType: string;
  ownerId: string;
  projectId?: string;
  scope: MemoryScope;
  memoryType: MemoryType;
  content: string;
  confidence: number;
  importance: number;
  stability: number;
  sensitivity: Sensitivity;
  status: MemoryStatus;
  validUntil?: string;
  sourceEventIds: string[];
  updatedAt: string;
}

export interface RecallCandidate extends MemoryItem {
  semanticScore?: number;
  keywordScore?: number;
  recencyScore?: number;
  scopeMatch?: number;
  finalScore?: number;
}
