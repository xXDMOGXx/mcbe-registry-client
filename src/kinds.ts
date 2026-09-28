/** Built-in catalog kinds. There is no `machine` kind. */
export const REGISTRY_KINDS = [
  "pack",
  "recipe",
  "item",
  "block",
  "entity",
  "fluid",
  "gas",
  "tag",
  "loot",
] as const;

/** One of {@link REGISTRY_KINDS}. */
export type RegistryKind = (typeof REGISTRY_KINDS)[number];

/** Kind used when `register` / `get` / `list` omit `kind`. */
export const DEFAULT_REGISTRY_KIND: RegistryKind = "recipe";

const KIND_SET = new Set<string>(REGISTRY_KINDS);

/** True when `value` is a built-in catalog kind. */
export function isRegistryKind(value: string): value is RegistryKind {
  return KIND_SET.has(value);
}
