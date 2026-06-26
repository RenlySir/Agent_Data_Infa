import type { RecallCandidate } from "../domain/types";
import type {
  RuntimeMemoryProvider,
  RuntimeMemoryRef,
  RuntimeMemorySearch,
  RuntimeMemoryWrite
} from "./runtime-memory-provider";

export class NoopRuntimeMemoryProvider implements RuntimeMemoryProvider {
  async write(_input: RuntimeMemoryWrite): Promise<RuntimeMemoryRef[]> {
    return [];
  }

  async search(_input: RuntimeMemorySearch): Promise<RecallCandidate[]> {
    return [];
  }

  async delete(_id: string): Promise<void> {
    return;
  }
}
