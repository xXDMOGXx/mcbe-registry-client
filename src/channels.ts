/**
 * Schema 4 wire: MCBE-IPC typed PROTO channels and advertised protocol version.
 * JSON `bedrockregistry:ready` / `hello` carry `schema: 4` for discovery only.
 */

/** Advertised host protocol (`ready.schema` / IPC hello). */
export const PROTOCOL_SCHEMA = 4;

/** Legacy constant; schema-1 JSON data envelopes are no longer served. */
export const JSON_V1 = 1;

/** IPC channel names (MCBE-IPC `invoke` / `handle`). */
export const CHANNEL = {
  hello: "bedrockregistry.hello",
  register: "bedrockregistry.register",
  unregister: "bedrockregistry.unregister",
  match: "bedrockregistry.match",
  result: "bedrockregistry.result",
  get: "bedrockregistry.get",
  list: "bedrockregistry.list",
  subscribe: "bedrockregistry.subscribe",
  updated: "bedrockregistry.updated",
} as const;

/** JSON discovery events (dual discovery). */
export const JSON_EVENT = {
  ready: "bedrockregistry:ready",
  hello: "bedrockregistry:hello",
} as const;

/** Content-log / BDS warning for schema-1 JSON callers. */
export const SCHEMA1_DEPRECATION_WARN =
  "[bedrock-registry] schema 1 (JSON) is deprecated; this world needs Bedrock Registry schema 4. Notify the addon author to update to @mcbe-registry/client.";

/** Client saw a host `schema`/`v` below {@link PROTOCOL_SCHEMA}. */
export const HOST_SCHEMA_OUTDATED_WARN =
  "[bedrock-registry] Bedrock Registry is outdated; this world needs a host that speaks schema 4. Update the Bedrock Registry pack.";

/** Client saw a host `schema` above {@link PROTOCOL_SCHEMA}. */
export const CLIENT_SCHEMA_OUTDATED_WARN =
  "[bedrock-registry] This addon is outdated; Bedrock Registry speaks a newer schema. Update this addon.";

/** Host saw IPC hello with client schema above {@link PROTOCOL_SCHEMA}. */
export const HOST_NEEDS_UPDATE_WARN =
  "[bedrock-registry] A newer addon needs a newer Bedrock Registry pack. Update Bedrock Registry.";

/** Content-log line after a host that owns the claim broadcasts `ready` (`console.log`). */
export const HOST_LOADED_MESSAGE = "Bedrock Registry has successfully loaded";
