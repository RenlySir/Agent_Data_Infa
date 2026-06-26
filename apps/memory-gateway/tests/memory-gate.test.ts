import { describe, expect, it } from "vitest";
import { filterRecallCandidates } from "../src/domain/memory-gate";
import type { RecallCandidate, RequestScope } from "../src/domain/types";

const scope: RequestScope = {
  tenantId: "t1",
  userId: "u1",
  agentId: "a1",
  projectId: "p1"
};

function candidate(overrides: Partial<RecallCandidate> = {}): RecallCandidate {
  return {
    id: "m1",
    layer: "L2",
    tenantId: "t1",
    ownerType: "user",
    ownerId: "u1",
    projectId: "p1",
    scope: "user",
    memoryType: "preference",
    content: "Prefers concise Chinese plans.",
    confidence: 0.8,
    importance: 0.7,
    stability: 0.8,
    sensitivity: "normal",
    status: "active",
    sourceEventIds: ["e1"],
    updatedAt: "2026-06-26T00:00:00.000Z",
    ...overrides
  };
}

describe("filterRecallCandidates", () => {
  it("keeps active in-scope memories", () => {
    const result = filterRecallCandidates(scope, [candidate()]);
    expect(result).toHaveLength(1);
  });

  it("rejects cross-tenant memories", () => {
    const result = filterRecallCandidates(scope, [candidate({ tenantId: "t2" })]);
    expect(result).toHaveLength(0);
  });

  it("rejects inactive statuses", () => {
    const result = filterRecallCandidates(scope, [candidate({ status: "superseded" })]);
    expect(result).toHaveLength(0);
  });

  it("rejects expired memories", () => {
    const result = filterRecallCandidates(scope, [
      candidate({ validUntil: "2020-01-01T00:00:00.000Z" })
    ]);
    expect(result).toHaveLength(0);
  });

  it("rejects low-confidence sensitive memories", () => {
    const result = filterRecallCandidates(scope, [
      candidate({ sensitivity: "sensitive", confidence: 0.5 })
    ]);
    expect(result).toHaveLength(0);
  });

  it("rejects project memories when request has no project context", () => {
    const result = filterRecallCandidates(
      { tenantId: "t1", userId: "u1", agentId: "a1" },
      [candidate({ projectId: "p1", scope: "project" })]
    );
    expect(result).toHaveLength(0);
  });
});
