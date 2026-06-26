import type { FastifyRequest } from "fastify";
import type { RequestScope } from "./types";

export class AuthError extends Error {
  statusCode = 401;

  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export function getAuthenticatedScope(request: FastifyRequest, expectedApiKey?: string): RequestScope {
  if (expectedApiKey) {
    const authorization = readHeader(request, "authorization");
    if (authorization !== `Bearer ${expectedApiKey}`) {
      throw new AuthError("Invalid memory gateway API key");
    }
  }

  const tenantId = readHeader(request, "x-memory-tenant-id");
  const agentId = readHeader(request, "x-memory-agent-id");
  const userId = readHeader(request, "x-memory-user-id");
  const projectId = readHeader(request, "x-memory-project-id");

  if (!tenantId || !agentId) {
    throw new AuthError("Missing memory authentication headers");
  }

  return {
    tenantId,
    userId,
    agentId,
    projectId
  };
}

function readHeader(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  if (Array.isArray(value)) return value[0];
  return value;
}
