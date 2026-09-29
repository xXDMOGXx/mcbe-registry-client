import { describe, expect, it, vi } from "vitest";
import type { OkReply, RegistryDocument } from "./types.js";
import { registerFilledKinds, type RegisterFilledClient } from "./registerFilled.js";

function fakeClient(opts: {
  ready?: boolean;
  registerReply?: OkReply | undefined;
}): RegisterFilledClient & {
  added: { kind: string; id: string }[];
  registered: { source?: string; kind?: string }[];
  waitCalls: number;
} {
  const added: { kind: string; id: string }[] = [];
  const registered: { source?: string; kind?: string }[] = [];
  let waitCalls = 0;
  return {
    added,
    registered,
    get waitCalls() {
      return waitCalls;
    },
    async waitReady() {
      waitCalls += 1;
      return opts.ready ?? true;
    },
    add(kind, document) {
      added.push({ kind, id: document.id });
    },
    async register(registerOpts) {
      registered.push({ source: registerOpts?.source, kind: registerOpts?.kind });
      return opts.registerReply === undefined && !("registerReply" in opts)
        ? { ok: true }
        : opts.registerReply;
    },
  };
}

describe("registerFilledKinds", () => {
  it("adds and registers only non-empty kinds", async () => {
    const client = fakeClient({});
    const item: RegistryDocument = { id: "mymod:widget" };
    const reply = await registerFilledKinds(client, "mymod", {
      item: [item],
      block: [],
    });
    expect(reply).toEqual({ ok: true });
    expect(client.added).toEqual([{ kind: "item", id: "mymod:widget" }]);
    expect(client.registered).toEqual([{ source: "mymod", kind: "item" }]);
  });

  it("skips wait and register when every kind is empty", async () => {
    const client = fakeClient({ ready: false });
    const reply = await registerFilledKinds(client, "mymod", { item: [] });
    expect(reply).toEqual({ ok: true });
    expect(client.waitCalls).toBe(0);
    expect(client.added).toEqual([]);
    expect(client.registered).toEqual([]);
  });

  it("does not register or warn when the host is missing", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((m: string) => {
      lines.push(m);
    });
    const client = fakeClient({ ready: false });
    const reply = await registerFilledKinds(client, "mymod", {
      item: [{ id: "mymod:widget" }],
    });
    expect(reply).toEqual({ ok: true });
    expect(client.added).toEqual([]);
    expect(client.registered).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("does not register an invalid source", async () => {
    const client = fakeClient({});
    const reply = await registerFilledKinds(client, "YOUR_PACK_ID", {
      item: [{ id: "mymod:widget" }],
    });
    expect(reply).toEqual({ ok: false, err: "bad" });
    expect(client.waitCalls).toBe(0);
    expect(client.registered).toEqual([]);
  });

  it("returns the first failed register reply", async () => {
    const client = fakeClient({ registerReply: { ok: false, err: "fp" } });
    const reply = await registerFilledKinds(client, "mymod", {
      item: [{ id: "mymod:widget" }],
    });
    expect(reply).toEqual({ ok: false, err: "fp" });
  });

  it("treats a timed-out register as not ok", async () => {
    const client = fakeClient({ registerReply: undefined });
    const reply = await registerFilledKinds(client, "mymod", {
      item: [{ id: "mymod:widget" }],
    });
    expect(reply).toEqual({ ok: false });
  });
});
