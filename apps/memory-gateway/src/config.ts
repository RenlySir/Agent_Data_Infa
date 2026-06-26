import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  MEMORY_PROVIDER: z.enum(["noop", "mem0", "mem9"]).default("noop")
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return EnvSchema.parse(env);
}
