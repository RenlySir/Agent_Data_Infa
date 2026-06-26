import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the operational console shell with fallback data", async () => {
    render(<App />);

    expect(await screen.findByText("Operational Overview")).toBeInTheDocument();
    expect(screen.getByText("Runtime memory is mem0 only")).toBeInTheDocument();
    expect(screen.getByText("mem0")).toBeInTheDocument();
    expect(screen.getByText("research-sandbox")).toBeInTheDocument();
  });

  it("opens the OpenClaw sandbox management tab", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "OpenClaw" }));

    expect(await screen.findByText("OpenClaw Sandbox Runtime")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create sandbox" })).toBeInTheDocument();
  });

  it("shows recall results in the memory workbench", async () => {
    const fetchMock = stubOnlineApi();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Memory" }));
    await userEvent.click(screen.getByRole("button", { name: "Run recall" }));

    expect(await screen.findByText("User prefers durable memory dashboards.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8787/v1/memory/recall",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uses keyword rows to run a keyword recall", async () => {
    const fetchMock = stubOnlineApi();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Keywords" }));
    await userEvent.click(await screen.findByRole("button", { name: "memory" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "http://localhost:8787/v1/memory/recall",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("\"query\":\"memory\"")
        })
      );
    });
    expect(await screen.findByText("User prefers durable memory dashboards.")).toBeInTheDocument();
  });

  it("runs a real gateway health check from the control plane", async () => {
    const fetchMock = stubOnlineApi();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Control Plane" }));
    await userEvent.click(await screen.findByRole("button", { name: "Health check" }));

    expect(await screen.findByText("Gateway health")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:8787/healthz", expect.any(Object));
    });
  });

  it("keeps the OpenClaw create result visible after refreshing sandbox data", async () => {
    stubOnlineApi();
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "OpenClaw" }));
    await userEvent.click(await screen.findByRole("button", { name: "Create sandbox" }));

    expect(await screen.findByText("OpenClaw sandbox created")).toBeInTheDocument();
    expect(screen.queryByText("Refresh result")).not.toBeInTheDocument();
  });
});

function stubOnlineApi() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/healthz")) {
      return Response.json({ ok: true });
    }
    if (url.endsWith("/v1/control-plane/status")) {
      return Response.json({
        runtimeMemory: { provider: "mem0", status: "configured" },
        gateway: { status: "online", recentRequests: 1, denyCount: 0 },
        consolidator: { status: "idle", queueDepth: 0, promotedToday: 0, failedToday: 0 },
        memoryGate: { status: "enforcing", allowCount: 1, denyCount: 0 }
      });
    }
    if (url.endsWith("/v1/openclaw/sandboxes") && init?.method === "POST") {
      return Response.json({
        id: "sandbox-2",
        name: "research-sandbox",
        image: "openclaw/local:latest",
        status: "created",
        createdAt: "2026-06-26T08:01:00.000Z",
        updatedAt: "2026-06-26T08:01:00.000Z",
        logs: ["created sandbox"]
      });
    }
    if (url.endsWith("/v1/openclaw/sandboxes")) {
      return Response.json({
        sandboxes: [
          {
            id: "sandbox-1",
            name: "research-sandbox",
            image: "openclaw/local:latest",
            status: "created",
            createdAt: "2026-06-26T08:00:00.000Z",
            updatedAt: "2026-06-26T08:00:00.000Z",
            logs: ["created sandbox"]
          }
        ]
      });
    }
    if (url.endsWith("/v1/analytics/keywords?limit=12")) {
      return Response.json({
        keywords: [
          { keyword: "memory", count: 4 },
          { keyword: "openclaw", count: 2 }
        ]
      });
    }
    if (url.endsWith("/v1/control-plane/gate-decisions")) {
      return Response.json({ decisions: [] });
    }
    if (url.endsWith("/v1/memory/recall")) {
      expect(init?.method).toBe("POST");
      return Response.json({
        audit_id: "audit-1",
        memories: [
          {
            id: "memory-1",
            layer: "L2",
            content: "User prefers durable memory dashboards.",
            memoryType: "preference",
            scope: "user",
            confidence: 0.9,
            importance: 0.8,
            updatedAt: "2026-06-26T08:00:00.000Z"
          }
        ]
      });
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
