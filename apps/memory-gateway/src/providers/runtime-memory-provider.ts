import type { RecallCandidate, RequestScope } from "../domain/types";

export interface RuntimeMemoryWrite {
  scope: RequestScope;
  content: string;
  metadata: Record<string, unknown>;
}

export interface RuntimeMemorySearch {
  scope: RequestScope;
  query: string;
  limit: number;
}

export interface RuntimeMemoryRef {
  id: string;
  provider: string;
}

export interface RuntimeMemoryProvider {
  write(input: RuntimeMemoryWrite): Promise<RuntimeMemoryRef[]>;
  search(input: RuntimeMemorySearch): Promise<RecallCandidate[]>;
  delete(id: string): Promise<void>;
}
