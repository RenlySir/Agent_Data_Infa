import type { RequestScope } from "../domain/types";

export type SandboxStatus = "created" | "running" | "stopped" | "deleted";

export interface OpenClawSandboxSnapshot {
  id: string;
  name: string;
  image: string;
  status: SandboxStatus;
  createdAt: string;
  updatedAt: string;
  logs: string[];
}

export interface OpenClawSandbox {
  id: string;
  tenantId: string;
  projectId?: string;
  name: string;
  image: string;
  status: SandboxStatus;
  createdAt: string;
  updatedAt: string;
  logs: string[];
}

export interface OpenClawSandboxProvider {
  provision(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot>;
  start(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot>;
  stop(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot>;
  remove(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot>;
}

export class InMemoryOpenClawSandboxProvider implements OpenClawSandboxProvider {
  private readonly sandboxes = new Map<string, OpenClawSandbox>();

  async list(scope: RequestScope): Promise<OpenClawSandbox[]> {
    return [...this.sandboxes.values()]
      .filter((sandbox) => sandbox.tenantId === scope.tenantId)
      .filter((sandbox) => !scope.projectId || sandbox.projectId === scope.projectId)
      .filter((sandbox) => sandbox.status !== "deleted")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async provision(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot> {
    const sandbox: OpenClawSandbox = {
      ...input,
      tenantId: scope.tenantId,
      projectId: scope.projectId
    };
    this.sandboxes.set(sandbox.id, sandbox);
    return input;
  }

  async start(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot> {
    this.upsertSandbox(scope, input);
    return input;
  }

  async stop(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot> {
    this.upsertSandbox(scope, input);
    return input;
  }

  async remove(scope: RequestScope, input: OpenClawSandboxSnapshot): Promise<OpenClawSandboxSnapshot> {
    this.sandboxes.delete(input.id);
    return input;
  }

  private upsertSandbox(scope: RequestScope, input: OpenClawSandboxSnapshot): void {
    this.sandboxes.set(input.id, {
      ...input,
      tenantId: scope.tenantId,
      projectId: scope.projectId
    });
  }
}
