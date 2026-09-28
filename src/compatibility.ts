import {
  CLIENT_SCHEMA_OUTDATED_WARN,
  HOST_NEEDS_UPDATE_WARN,
  HOST_SCHEMA_OUTDATED_WARN,
} from "./channels.js";

let hostSchemaOutdated = false;
let clientSchemaOutdated = false;
let hostNeedsUpdate = false;

function defaultWarn(message: string): void {
  (globalThis as unknown as { console: { warn: (m: string) => void } }).console.warn(message);
}

/**
 * Emits the host-outdated warning at most once this session.
 */
export function noteHostSchemaOutdated(warn?: (message: string) => void): void {
  if (hostSchemaOutdated) return;
  hostSchemaOutdated = true;
  (warn ?? defaultWarn)(HOST_SCHEMA_OUTDATED_WARN);
}

/**
 * Emits the client-outdated warning at most once this session.
 */
export function noteClientSchemaOutdated(warn?: (message: string) => void): void {
  if (clientSchemaOutdated) return;
  clientSchemaOutdated = true;
  (warn ?? defaultWarn)(CLIENT_SCHEMA_OUTDATED_WARN);
}

/**
 * Emits the host-needs-update warning at most once this session (newer client hello).
 */
export function noteHostNeedsUpdate(warn?: (message: string) => void): void {
  if (hostNeedsUpdate) return;
  hostNeedsUpdate = true;
  (warn ?? defaultWarn)(HOST_NEEDS_UPDATE_WARN);
}

/** Test helper: clear once-per-session schema-mismatch warn state. */
export function resetCompatibilityWarns(): void {
  hostSchemaOutdated = false;
  clientSchemaOutdated = false;
  hostNeedsUpdate = false;
}
