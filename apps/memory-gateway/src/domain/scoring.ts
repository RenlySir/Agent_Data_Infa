import type { RecallCandidate } from "./types";

export function scoreCandidate(candidate: RecallCandidate): RecallCandidate {
  const semanticScore = candidate.semanticScore ?? 0;
  const keywordScore = candidate.keywordScore ?? 0;
  const recencyScore = candidate.recencyScore ?? 0;
  const scopeMatch = candidate.scopeMatch ?? 0;

  const finalScore =
    0.3 * semanticScore +
    0.2 * keywordScore +
    0.15 * recencyScore +
    0.15 * candidate.importance +
    0.1 * candidate.confidence +
    0.1 * scopeMatch;

  return {
    ...candidate,
    finalScore
  };
}

export function rankCandidates(candidates: RecallCandidate[]): RecallCandidate[] {
  return candidates
    .map(scoreCandidate)
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0));
}
