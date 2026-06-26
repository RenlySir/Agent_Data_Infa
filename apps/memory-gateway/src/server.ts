import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadConfig } from "./config";
import { createSupabaseClient } from "./db/supabase";
import { AuthError } from "./domain/auth";
import type { CanonicalMemoryStore } from "./providers/canonical-memory-store";
import { InMemoryCanonicalMemoryStore } from "./providers/in-memory-canonical-memory-store";
import { NoopRuntimeMemoryProvider } from "./providers/noop-runtime-memory-provider";
import {
  InMemoryOpenClawSandboxProvider,
  type OpenClawSandboxProvider
} from "./providers/openclaw-sandbox-provider";
import type { RuntimeMemoryProvider } from "./providers/runtime-memory-provider";
import { SupabaseCanonicalMemoryStore } from "./providers/supabase-canonical-memory-store";
import { analyticsRoute } from "./routes/analytics";
import { controlPlaneRoute } from "./routes/control-plane";
import { eventsRoute } from "./routes/events";
import { openClawRoute } from "./routes/openclaw";
import { recallRoute } from "./routes/recall";
import { rememberRoute } from "./routes/remember";

export interface ServerDeps {
  store?: CanonicalMemoryStore;
  runtime?: RuntimeMemoryProvider;
  openclaw?: OpenClawSandboxProvider;
  authApiKey?: string;
}

export async function buildServer(deps: ServerDeps = {}) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({
        error: "unauthorized",
        message: error.message
      });
    }

    return reply.send(error);
  });

  const store = deps.store ?? buildDefaultStore();
  const runtime = deps.runtime ?? new NoopRuntimeMemoryProvider();
  const openclaw = deps.openclaw ?? new InMemoryOpenClawSandboxProvider();
  const authApiKey = deps.authApiKey ?? loadConfig().MEMORY_GATEWAY_API_KEY;

  await app.register(eventsRoute({ store, runtime, authApiKey }));
  await app.register(rememberRoute({ store, authApiKey }));
  await app.register(recallRoute({ store, runtime, authApiKey }));
  await app.register(controlPlaneRoute({ store, authApiKey }));
  await app.register(openClawRoute({ store, openclaw, authApiKey }));
  await app.register(analyticsRoute({ store, authApiKey }));

  app.get("/healthz", async () => ({ ok: true }));

  return app;
}

function buildDefaultStore(): CanonicalMemoryStore {
  const config = loadConfig();
  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    return new SupabaseCanonicalMemoryStore(createSupabaseClient(config));
  }
  return new InMemoryCanonicalMemoryStore();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildServer();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}
