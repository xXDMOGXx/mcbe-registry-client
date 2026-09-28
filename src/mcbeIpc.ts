import IPC from "mcbe-ipc";
import type { PeerIpc } from "./ipcTypes.js";

/** Live MCBE-IPC adapter for typed `PROTO` payloads. */
export function peerIpcFromMcbe(): PeerIpc {
  return {
    send(channel, serializer, value) {
      IPC.send(channel, serializer, value);
    },
    invoke(channel, serializer, value, deserializer) {
      return IPC.invoke(channel, serializer, value, deserializer);
    },
    on(channel, deserializer, listener) {
      return IPC.on(channel, deserializer, listener);
    },
    handle(channel, deserializer, serializer, listener) {
      return IPC.handle(channel, deserializer, serializer, listener);
    },
  };
}

/** @deprecated Use {@link peerIpcFromMcbe}. */
export function ipcStringFromMcbe(): PeerIpc {
  return peerIpcFromMcbe();
}
