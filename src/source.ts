/** Namespace-like pack id used as a persist / overlay key (`demo`, `digitalstorage`). */
const SOURCE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

/** True when `source` is a legal persist key. */
export function isValidSource(source: string): boolean {
  return SOURCE_PATTERN.test(source);
}
