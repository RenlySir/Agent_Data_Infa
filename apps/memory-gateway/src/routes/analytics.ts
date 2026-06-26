import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getAuthenticatedScope } from "../domain/auth";
import type { CanonicalMemoryStore } from "../providers/canonical-memory-store";

const KeywordQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export function analyticsRoute(deps: {
  store: CanonicalMemoryStore;
  authApiKey?: string;
}): FastifyPluginAsync {
  return async (app) => {
    app.get("/v1/analytics/keywords", async (request) => {
      const scope = getAuthenticatedScope(request, deps.authApiKey);
      const query = KeywordQuery.parse(request.query);
      return {
        keywords: await deps.store.keywordCounts(scope, query.limit)
      };
    });
  };
}
