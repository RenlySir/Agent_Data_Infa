import type { RecallCandidate, RequestScope } from "./types";

const blockedStatuses = new Set(["superseded", "conflicted", "deleted", "expired"]);

export function filterRecallCandidates(
  requestScope: RequestScope,
  candidates: RecallCandidate[],
  now: Date = new Date()
): RecallCandidate[] {
  return candidates.filter((candidate) => {
    if (candidate.tenantId !== requestScope.tenantId) return false;
    if (blockedStatuses.has(candidate.status)) return false;
    if (candidate.validUntil && new Date(candidate.validUntil) <= now) return false;
    if (candidate.projectId && requestScope.projectId && candidate.projectId !== requestScope.projectId) {
      return false;
    }
    if (candidate.sensitivity === "secret") return false;
    if (candidate.sensitivity === "sensitive" && candidate.confidence < 0.8) return false;
    return true;
  });
}
