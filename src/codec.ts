/**
 * Domain payloads ride MCBE-IPC as a single string (compact JSON).
 * Closed queries stay JSON objects; open Recipe/`extra` round-trip verbatim.
 */

function stripEmpty(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripEmpty);
  if (typeof value !== "object" || value === null) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === undefined || child === null) continue;
    out[key] = stripEmpty(child);
  }
  return out;
}

/** Compact JSON for an IPC string payload. */
export function encodePayload(value: unknown): string {
  return JSON.stringify(stripEmpty(value));
}

/** Parse an IPC string payload; malformed → undefined. */
export function decodePayload(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
