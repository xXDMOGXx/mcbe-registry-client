import { PROTO } from "mcbe-ipc";

/** Injectable typed MCBE-IPC used by the schema-5 client/host. */
export interface PeerIpc {
  send<S>(channel: string, serializer: PROTO.Serializer<S>, value: S): void;
  invoke<S, D>(
    channel: string,
    serializer: PROTO.Serializer<S>,
    value: S,
    deserializer: PROTO.Deserializer<D>,
  ): Promise<D>;
  on<D>(channel: string, deserializer: PROTO.Deserializer<D>, listener: (value: D) => void): () => void;
  handle<S, D>(
    channel: string,
    deserializer: PROTO.Deserializer<S>,
    serializer: PROTO.Serializer<D>,
    listener: (value: S) => D,
  ): () => void;
}

/** Tick scheduler for client timeouts (Bedrock `system.runTimeout`). */
export interface TickClock {
  runTimeout(callback: () => void, ticks: number): () => void;
}

/** Script-event transport for JSON `ready` / `hello` discovery. */
export interface DiscoveryTransport {
  send(id: string, message: string): void;
  onEvent(handler: (id: string, message: string) => void): () => void;
}

/** @deprecated Use {@link PeerIpc}. Kept as an alias for older imports. */
export type IpcStringApi = PeerIpc;
