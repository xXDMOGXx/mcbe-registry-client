import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("mcbe-ipc", () => ({
  default: {},
  PROTO: {
    Int32: {},
    VarInt32: {},
    Float64: {},
    String: {},
    Boolean: {},
    Optional: (s: unknown) => s,
    Array: (s: unknown) => s,
    Map: (k: unknown, v: unknown) => ({ k, v }),
    Object: (s: unknown) => s,
  },
}));

import { noteSchema1Deprecation, resetSchema1DeprecationWarns } from "./deprecation.js";
import {
  noteHostSchemaOutdated,
  noteClientSchemaOutdated,
  noteHostNeedsUpdate,
  resetCompatibilityWarns,
} from "./compatibility.js";
import { createClient } from "./client.js";
import {
  CHANNEL,
  PROTOCOL_SCHEMA,
  JSON_EVENT,
  HOST_SCHEMA_OUTDATED_WARN,
  CLIENT_SCHEMA_OUTDATED_WARN,
  HOST_NEEDS_UPDATE_WARN,
} from "./channels.js";
import type { DiscoveryTransport, PeerIpc, TickClock } from "./ipcTypes.js";
import { canonicalizeRecipes } from "./recipeFingerprint.js";
import type { Recipe } from "./types.js";

describe("noteSchema1Deprecation", () => {
  beforeEach(() => resetSchema1DeprecationWarns());

  it("warns once per pack key", () => {
    const lines: string[] = [];
    const warn = (m: string) => lines.push(m);
    noteSchema1Deprecation("mymod", warn);
    noteSchema1Deprecation("mymod", warn);
    noteSchema1Deprecation("other", warn);
    expect(lines).toHaveLength(2);
  });
});

describe("compatibility warns", () => {
  beforeEach(() => resetCompatibilityWarns());

  it("emits each schema mismatch warn once", () => {
    const lines: string[] = [];
    const warn = (m: string) => lines.push(m);
    noteHostSchemaOutdated(warn);
    noteHostSchemaOutdated(warn);
    noteClientSchemaOutdated(warn);
    noteClientSchemaOutdated(warn);
    noteHostNeedsUpdate(warn);
    noteHostNeedsUpdate(warn);
    expect(lines).toEqual([HOST_SCHEMA_OUTDATED_WARN, CLIENT_SCHEMA_OUTDATED_WARN, HOST_NEEDS_UPDATE_WARN]);
  });
});

describe("createClient", () => {
  beforeEach(() => {
    resetCompatibilityWarns();
    vi.restoreAllMocks();
  });

  function fakeClock(): TickClock & { flush(ticks?: number): void } {
    const q: { cb: () => void; at: number }[] = [];
    let now = 0;
    return {
      runTimeout(callback, ticks) {
        const at = now + ticks;
        q.push({ cb: callback, at });
        return () => {
          const i = q.findIndex((e) => e.cb === callback);
          if (i >= 0) q.splice(i, 1);
        };
      },
      flush(ticks = 1) {
        now += ticks;
        const due = q.filter((e) => e.at <= now);
        for (const e of due) {
          const i = q.indexOf(e);
          if (i >= 0) q.splice(i, 1);
          e.cb();
        }
      },
    };
  }

  function fakeDiscovery(): DiscoveryTransport & { emit(id: string, message: string): void } {
    const handlers: ((id: string, message: string) => void)[] = [];
    return {
      send() {},
      onEvent(handler) {
        handlers.push(handler);
        return () => {
          const i = handlers.indexOf(handler);
          if (i >= 0) handlers.splice(i, 1);
        };
      },
      emit(id, message) {
        for (const h of [...handlers]) h(id, message);
      },
    };
  }

  function hangingIpc(): PeerIpc {
    return {
      send() {},
      invoke: () => new Promise(() => {}),
      on: () => () => {},
      handle: () => () => {},
    };
  }

  it("waitReady succeeds on JSON ready schema 4", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, timeoutTicks: 2 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    await expect(client.waitReady()).resolves.toBe(true);
    client.dispose();
  });

  it("waitReady fails immediately on JSON ready schema 3", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((m: string) => {
      lines.push(m);
    });
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, discoveryTimeoutTicks: 20 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: 3, schema: 3 }));
    await expect(client.waitReady()).resolves.toBe(false);
    expect(lines).toContain(HOST_SCHEMA_OUTDATED_WARN);
    client.dispose();
  });

  it("waitReady fails immediately on JSON ready schema 1", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((m: string) => {
      lines.push(m);
    });
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, discoveryTimeoutTicks: 20 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: 1, schema: 1 }));
    await expect(client.waitReady()).resolves.toBe(false);
    expect(lines).toContain(HOST_SCHEMA_OUTDATED_WARN);
    client.dispose();
  });

  it("waitReady fails on JSON ready schema above the client", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((m: string) => {
      lines.push(m);
    });
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, discoveryTimeoutTicks: 20 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: 5, schema: 5 }));
    await expect(client.waitReady()).resolves.toBe(false);
    expect(lines).toContain(CLIENT_SCHEMA_OUTDATED_WARN);
    expect(lines).not.toContain(HOST_SCHEMA_OUTDATED_WARN);
    client.dispose();
  });

  it("waitReady times out with no ready and no mismatch warn", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((m: string) => {
      lines.push(m);
    });
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, discoveryTimeoutTicks: 2 });
    const pending = client.waitReady();
    clock.flush(2);
    await expect(pending).resolves.toBe(false);
    expect(lines).not.toContain(HOST_SCHEMA_OUTDATED_WARN);
    expect(lines).not.toContain(CLIENT_SCHEMA_OUTDATED_WARN);
    client.dispose();
  });

  it("match returns ids over typed IPC", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const ipc: PeerIpc = {
      send() {},
      async invoke(channel, _ser, value) {
        expect(channel).toBe(CHANNEL.match);
        expect(value).toMatchObject({
          station: "minecraft:furnace",
          inputs: [{ item: "minecraft:beef" }],
        });
        return { ids: ["minecraft:furnace_beef"] };
      },
      on: () => () => {},
      handle: () => () => {},
    };
    const client = createClient({ ipc, discovery, clock, timeoutTicks: 5 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    await expect(
      client.match({ station: "minecraft:furnace", inputs: ["minecraft:beef"] }),
    ).resolves.toEqual(["minecraft:furnace_beef"]);
    client.dispose();
  });

  it("match times out to undefined", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, timeoutTicks: 1 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    const pending = client.match({ station: "minecraft:furnace", inputs: ["minecraft:beef"] });
    clock.flush(1);
    await expect(pending).resolves.toBeUndefined();
    client.dispose();
  });

  it("list sends loot tool on the wire", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const ipc: PeerIpc = {
      send() {},
      async invoke(channel, _ser, value) {
        expect(channel).toBe(CHANNEL.list);
        expect(value).toMatchObject({
          kind: "loot",
          block: "addon:ore",
          tool: "none",
        });
        return { entries: [], documents: [] };
      },
      on: () => () => {},
      handle: () => () => {},
    };
    const client = createClient({ ipc, discovery, clock, timeoutTicks: 5 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    await expect(client.list("loot", { block: "addon:ore", tool: "none" })).resolves.toEqual({
      entries: [],
      documents: [],
      sources: [],
    });
    client.dispose();
  });

  it("register fingerprints then skips the full list on match", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const recipe: Recipe = {
      id: "mymod:a",
      stations: ["mymod:x"],
      inputs: ["minecraft:cobblestone"],
      outputs: ["minecraft:gravel"],
    };
    const fp = canonicalizeRecipes([recipe]);
    const invokes: unknown[] = [];
    const ipc: PeerIpc = {
      send() {},
      async invoke(channel, _ser, value) {
        expect(channel).toBe(CHANNEL.register);
        invokes.push(value);
        return { ok: true };
      },
      on: () => () => {},
      handle: () => () => {},
    };
    const kinds: string[] = [];
    const client = createClient({
      ipc,
      discovery,
      clock,
      timeoutTicks: 5,
      onFingerprint: (k) => kinds.push(k),
    });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    client.addRecipe(recipe);
    await client.register({ source: "mymod" });
    expect(invokes).toHaveLength(1);
    expect(invokes[0]).toMatchObject({ source: "mymod", fp, recipes: [] });
    expect(kinds).toEqual(["match"]);
    client.dispose();
  });

  it("register onFingerprint miss then sends full list", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const recipe: Recipe = {
      id: "mymod:a",
      stations: ["mymod:x"],
      inputs: ["minecraft:cobblestone"],
      outputs: ["minecraft:gravel"],
    };
    let n = 0;
    const ipc: PeerIpc = {
      send() {},
      async invoke(_channel, _ser, value) {
        n += 1;
        if (n === 1) return { ok: false, err: "fp" };
        expect((value as { recipes: unknown[] }).recipes).toHaveLength(1);
        return { ok: true };
      },
      on: () => () => {},
      handle: () => () => {},
    };
    const kinds: string[] = [];
    const client = createClient({
      ipc,
      discovery,
      clock,
      timeoutTicks: 5,
      onFingerprint: (k) => kinds.push(k),
    });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    client.addRecipe(recipe);
    await client.register({ source: "mymod" });
    expect(n).toBe(2);
    expect(kinds).toEqual(["miss"]);
    client.dispose();
  });

  it("register item kind pings with kind on the wire", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const invokes: unknown[] = [];
    const ipc: PeerIpc = {
      send() {},
      async invoke(channel, _ser, value) {
        expect(channel).toBe(CHANNEL.register);
        invokes.push(value);
        return { ok: true };
      },
      on: () => () => {},
      handle: () => () => {},
    };
    const client = createClient({ ipc, discovery, clock, timeoutTicks: 5 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    client.add("item", { id: "mymod:widget", extra: { n: 1 } });
    await client.register({ source: "mymod", kind: "item" });
    expect(invokes).toHaveLength(1);
    expect(invokes[0]).toMatchObject({ source: "mymod", kind: "item", recipes: [] });
    client.dispose();
  });

  it("subscribe returns ok and ignores own source on updated", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const updated: Array<(value: unknown) => void> = [];
    const seen: unknown[] = [];
    const ipc: PeerIpc = {
      send() {},
      async invoke(channel, _ser, value) {
        expect(channel).toBe(CHANNEL.subscribe);
        expect(value).toMatchObject({ kinds: ["fluid"], source: "mymod" });
        return { ok: true };
      },
      on(channel, _deser, listener) {
        expect(channel).toBe(CHANNEL.updated);
        updated.push(listener as (value: unknown) => void);
        return () => {};
      },
      handle: () => () => {},
    };
    const client = createClient({ ipc, discovery, clock, timeoutTicks: 5 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    await expect(client.subscribe({ kinds: ["fluid"], source: "mymod" }, (event) => {
      seen.push(event);
    })).resolves.toBe(true);
    updated[0]!({ kind: "fluid", source: "mymod" });
    updated[0]!({ kind: "fluid", source: "other" });
    expect(seen).toEqual([{ kind: "fluid", source: "other" }]);
    client.dispose();
  });

  it("has no RAM catalog until track", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const client = createClient({ ipc: hangingIpc(), discovery, clock, timeoutTicks: 5 });
    expect(client.catalog()).toBeUndefined();
    client.dispose();
  });

  it("track seeds locally, pulls overlay list, and ignores own updated", async () => {
    const clock = fakeClock();
    const discovery = fakeDiscovery();
    const updated: Array<(value: unknown) => void> = [];
    const lists: unknown[] = [];
    const ipc: PeerIpc = {
      send() {},
      async invoke(channel, _ser, value) {
        if (channel === CHANNEL.subscribe) return { ok: true };
        if (channel === CHANNEL.list) {
          lists.push(value);
          const filter = value as { kind?: string; source?: string; vanilla?: boolean; station?: string };
          if (filter.source === "other") {
            return {
              entries: [],
              documents: [JSON.stringify({ id: "other:latex", kind: "liquid", vessels: [] })],
              sources: ["other"],
            };
          }
          return {
            entries: [],
            documents: [JSON.stringify({ id: "addon:oil", kind: "liquid", vessels: [] })],
            sources: ["addon"],
          };
        }
        return { ok: true };
      },
      on(channel, _deser, listener) {
        if (channel === CHANNEL.updated) updated.push(listener as (value: unknown) => void);
        return () => {};
      },
      handle: () => () => {},
    };
    const client = createClient({ ipc, discovery, clock, timeoutTicks: 5 });
    discovery.emit(JSON_EVENT.ready, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
    await expect(
      client.track({
        kinds: ["fluid"],
        source: "mymod",
        seed: [{ kind: "fluid", documents: [{ id: "minecraft:water", kind: "liquid", vessels: [] }] }],
      }),
    ).resolves.toBe(true);
    const replica = client.catalog();
    expect(replica?.getDocument("fluid", "minecraft:water")).toEqual({
      id: "minecraft:water",
      kind: "liquid",
      vessels: [],
    });
    expect(replica?.getDocument("fluid", "addon:oil")).toEqual({
      id: "addon:oil",
      kind: "liquid",
      vessels: [],
    });
    expect(lists[0]).toMatchObject({ kind: "fluid", vanilla: false });
    updated[0]!({ kind: "fluid", source: "mymod" });
    updated[0]!({ kind: "fluid", source: "other" });
    await vi.waitFor(() => {
      expect(replica?.getDocument("fluid", "other:latex")?.id).toBe("other:latex");
    });
    client.add("fluid", { id: "mymod:etchant", kind: "liquid", vessels: [] });
    expect(replica?.getDocument("fluid", "mymod:etchant")?.id).toBe("mymod:etchant");
    client.dispose();
    expect(client.catalog()).toBeUndefined();
  });
});
