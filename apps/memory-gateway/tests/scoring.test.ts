import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../src/domain/scoring";
import type { RecallCandidate } from "../src/domain/types";

const base: RecallCandidate = {
  id: "m1",
  layer: "L2",
  tenantId: "t1",
  ownerType: "user",
  ownerId: "u1",
  scope: "user",
  memoryType: "preference",
  content: "Prefers concise Chinese plans.",
  confidence: 0.8,
  importance: 0.7,
  stability: 0.8,
  sensitivity: "normal",
  status: "active",
  sourceEventIds: ["e1"],
  updatedAt: "2026-06-26T00:00:00.000Z"
};

describe("scoreCandidate", () => {
  it("prioritizes semantic, keyword, recency, importance, confidence, and scope match", () => {
    const scored = scoreCandidate({
      ...base,
      semanticScore: 1,
      keywordScore: 1,
      recencyScore: 1,
      scopeMatch: 1
    });

    expect(scored.finalScore).toBeCloseTo(0.3 + 0.2 + 0.15 + 0.105 + 0.08 + 0.1, 5);
  });

  it("defaults missing optional scores to zero", () => {
    const scored = scoreCandidate(base);
    expect(scored.finalScore).toBeCloseTo(0.105 + 0.08, 5);
  });
});
