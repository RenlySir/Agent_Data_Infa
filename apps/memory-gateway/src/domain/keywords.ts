const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "user",
  "agent",
  "turn",
  "completed"
]);

export interface KeywordCount {
  keyword: string;
  count: number;
}

export function extractKeywordCounts(texts: string[], limit: number): KeywordCount[] {
  const counts = new Map<string, number>();

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9_\u4e00-\u9fa5]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !stopWords.has(word));

    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
    .slice(0, limit);
}
