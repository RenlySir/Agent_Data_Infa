import cors from "@fastify/cors";
import Fastify from "fastify";
import { loadConfig } from "./config";
import { createSupabaseClient } from "./db/supabase";
import type { CanonicalMemoryStore } from "./providers/canonical-memory-store";
import { InMemoryCanonicalMemoryStore } from "./providers/in-memory-canonical-memory-store";
import { NoopRuntimeMemoryProvider } from "./providers/noop-runtime-memory-provider";
import type { RuntimeMemoryProvider } from "./providers/runtime-memory-provider";
import { SupabaseCanonicalMemoryStore } from "./providers/supabase-canonical-memory-store";
import { eventsRoute } from "./routes/events";
import { recallRoute } from "./routes/recall";
import { rememberRoute } from "./routes/remember";

export interface ServerDeps {
  store?: CanonicalMemoryStore;
  runtime?: RuntimeMemoryProvider;
}

export async function buildServer(deps: ServerDeps = {}) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  const store = deps.store ?? buildDefaultStore();
  const runtime = deps.runtime ?? new NoopRuntimeMemoryProvider();

  await app.register(eventsRoute({ store, runtime }));
  await app.register(rememberRoute({ store }));
  await app.register(recallRoute({ store, runtime }));

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
