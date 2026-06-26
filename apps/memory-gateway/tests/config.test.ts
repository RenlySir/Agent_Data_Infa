import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("requires a memory gateway API key", () => {
    expect(() => loadConfig({ PORT: "8787" })).toThrow();
  });

  it("loads gateway configuration when API key is present", () => {
    expect(
      loadConfig({
        PORT: "8787",
        MEMORY_GATEWAY_API_KEY: "dev-memory-key"
      })
    ).toMatchObject({
      PORT: 8787,
      MEMORY_GATEWAY_API_KEY: "dev-memory-key",
      MEMORY_PROVIDER: "noop"
    });
  });

  it("only allows noop and mem0 runtime memory providers", () => {
    expect(() =>
      loadConfig({
        PORT: "8787",
        MEMORY_GATEWAY_API_KEY: "dev-memory-key",
        MEMORY_PROVIDER: "mem9"
      })
    ).toThrow();
  });
});
