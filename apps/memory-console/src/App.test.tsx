import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
});
