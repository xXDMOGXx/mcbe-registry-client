import { REGISTRY_KINDS, type RegistryKind } from "./kinds.js";
import { isValidSource } from "./source.js";
import type { OkReply, RegistryDocument } from "./types.js";

/** Client slice used by {@link registerFilledKinds}. */
export type RegisterFilledClient = {
  waitReady(): Promise<boolean>;
  add(kind: string, document: RegistryDocument): void;
  register(opts?: { source?: string; kind?: string }): Promise<OkReply | undefined>;
};

/** Per-kind document lists. Missing or empty kinds are not registered. */
export type FilledKindDocuments = Partial<Record<RegistryKind, readonly RegistryDocument[]>>;

/**
 * Waits for a schema-5 host, then `add`s and `register`s each non-empty kind.
 * Invalid `source` or a missing host skips register with no warn.
 */
export async function registerFilledKinds(
  client: RegisterFilledClient,
  source: string,
  documents: FilledKindDocuments,
): Promise<OkReply> {
  if (!isValidSource(source)) return { ok: false, err: "bad" };
  const filled: RegistryKind[] = [];
  for (const kind of REGISTRY_KINDS) {
    const list = documents[kind];
    if (list !== undefined && list.length > 0) filled.push(kind);
  }
  if (filled.length === 0) return { ok: true };
  const ready = await client.waitReady();
  if (!ready) return { ok: true };
  for (const kind of filled) {
    const list = documents[kind];
    if (list === undefined) continue;
    for (const document of list) client.add(kind, document);
    const reply = await client.register({ source, kind });
    if (reply === undefined) return { ok: false };
    if (!reply.ok) return reply;
  }
  return { ok: true };
}
