import { system } from "@minecraft/server";
import { createClient, type RecipeRegistryClient } from "./client.js";
import { peerIpcFromMcbe } from "./mcbeIpc.js";
import { clockFromSystem, discoveryFromSystem } from "./systemAdapters.js";

/** Live schema-4 client using world `system` and upstream `mcbe-ipc`. */
export function createBedrockClient(timeoutTicks?: number): RecipeRegistryClient {
  return createClient({
    ipc: peerIpcFromMcbe(),
    discovery: discoveryFromSystem(system),
    clock: clockFromSystem(system),
    timeoutTicks,
  });
}
