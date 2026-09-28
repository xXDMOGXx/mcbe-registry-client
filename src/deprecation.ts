import { SCHEMA1_DEPRECATION_WARN } from "./channels.js";

const warned = new Set<string>();

function defaultWarn(message: string): void {
  (globalThis as unknown as { console: { warn: (m: string) => void } }).console.warn(message);
}

/**
 * Emits the schema-1 deprecation warning at most once per pack key this session.
 * `packKey` is `source` when present, otherwise a stable legacy bucket.
 */
export function noteSchema1Deprecation(packKey: string, warn: (message: string) => void = defaultWarn): void {
  const key = packKey.length > 0 ? packKey : "_anonymous_json";
  if (warned.has(key)) return;
  warned.add(key);
  warn(SCHEMA1_DEPRECATION_WARN);
}

/** Test helper: clear once-per-pack warn state. */
export function resetSchema1DeprecationWarns(): void {
  warned.clear();
}
