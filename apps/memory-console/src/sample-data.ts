import type { ControlPlaneStatus, GateDecision, KeywordCount, Sandbox } from "./api";

export const defaultConfig = {
  gatewayUrl: "http://localhost:8787",
  apiKey: "dev-memory-key",
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  agentId: "research-agent",
  projectId: "00000000-0000-0000-0000-000000000003"
};

export const fallbackStatus: ControlPlaneStatus = {
  runtimeMemory: { provider: "mem0", status: "configured" },
  gateway: { status: "offline", recentRequests: 0, denyCount: 0 },
  consolidator: { status: "idle", queueDepth: 0, promotedToday: 0, failedToday: 0 },
  memoryGate: { status: "enforcing", allowCount: 0, denyCount: 0 }
};

export const fallbackSandboxes: Sandbox[] = [
  {
    id: "local-demo",
    name: "research-sandbox",
    image: "openclaw/local:latest",
    status: "stopped",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    logs: ["demo sandbox ready"]
  }
];

export const fallbackKeywords: KeywordCount[] = [
  { keyword: "memory", count: 18 },
  { keyword: "openclaw", count: 12 },
  { keyword: "gateway", count: 9 },
  { keyword: "sandbox", count: 7 },
  { keyword: "consolidator", count: 5 }
];

export const fallbackDecisions: GateDecision[] = [
  {
    id: "audit-local-1",
    tenantId: defaultConfig.tenantId,
    actorType: "agent",
    actorId: defaultConfig.agentId,
    operation: "memory.recall",
    memoryIds: [],
    requestScope: { projectId: defaultConfig.projectId },
    decision: "allow",
    createdAt: new Date().toISOString()
  }
];
