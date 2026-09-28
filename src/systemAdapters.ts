import type { DiscoveryTransport, TickClock } from "./ipcTypes.js";

/** Bedrock `system` slice for discovery + timeouts. */
export interface BedrockSystem {
  sendScriptEvent(id: string, message: string): void;
  runTimeout(callback: () => void, tickDelay?: number): number;
  clearRun(id: number): void;
  afterEvents: {
    scriptEventReceive: {
      subscribe(callback: (event: { id: string; message: string }) => void): unknown;
      unsubscribe(callback: unknown): void;
    };
  };
}

/** Discovery transport over Bedrock script events. */
export function discoveryFromSystem(sys: BedrockSystem): DiscoveryTransport {
  return {
    send(id, message) {
      sys.sendScriptEvent(id, message);
    },
    onEvent(handler) {
      const callback = (event: { id: string; message: string }) => handler(event.id, event.message);
      sys.afterEvents.scriptEventReceive.subscribe(callback);
      return () => sys.afterEvents.scriptEventReceive.unsubscribe(callback);
    },
  };
}

/** Tick clock over Bedrock `system.runTimeout`. */
export function clockFromSystem(sys: BedrockSystem): TickClock {
  return {
    runTimeout(callback, ticks) {
      const id = sys.runTimeout(callback, ticks);
      return () => sys.clearRun(id);
    },
  };
}
