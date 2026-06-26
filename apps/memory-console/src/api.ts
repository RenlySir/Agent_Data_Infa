export interface ConsoleConfig {
  gatewayUrl: string;
  apiKey: string;
  tenantId: string;
  userId: string;
  agentId: string;
  projectId: string;
}

export interface Sandbox {
  id: string;
  name: string;
  image: string;
  status: "created" | "running" | "stopped" | "deleted";
  createdAt: string;
  updatedAt: string;
  logs: string[];
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

export interface ControlPlaneStatus {
  runtimeMemory: { provider: string; status: string };
  gateway: { status: string; recentRequests: number; denyCount: number };
  consolidator: { status: string; queueDepth: number; promotedToday: number; failedToday: number };
  memoryGate: { status: string; allowCount: number; denyCount: number };
}

export interface GateDecision {
  id: string;
  tenantId: string;
  actorType: string;
  actorId: string;
  operation: string;
  memoryIds: string[];
  requestScope: Record<string, unknown>;
  decision: "allow" | "deny";
  reason?: string;
  createdAt: string;
}

export interface RecallMemory {
  id: string;
  layer?: string;
  content: string;
  memoryType?: string;
  scope?: string;
  confidence?: number;
  importance?: number;
  updatedAt?: string;
}

export interface RecallResponse {
  memories: RecallMemory[];
  audit_id: string;
}

export function headers(config: ConsoleConfig) {
  return {
    authorization: `Bearer ${config.apiKey}`,
    "x-memory-tenant-id": config.tenantId,
    "x-memory-user-id": config.userId,
    "x-memory-agent-id": config.agentId,
    "x-memory-project-id": config.projectId,
    "content-type": "application/json"
  };
}

function mergeHeaders(config: ConsoleConfig, initHeaders?: HeadersInit): HeadersInit {
  return {
    ...headers(config),
    ...(initHeaders instanceof Headers ? Object.fromEntries(initHeaders.entries()) : initHeaders)
  };
}

export async function requestJson<T>(
  config: ConsoleConfig,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${config.gatewayUrl}${path}`, {
    ...init,
    headers: mergeHeaders(config, init.headers)
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}
