import { describe, expect, it } from "vitest";
import { decodeItem, encodeItem, encodeLoot, overlayListFields } from "./overlayWire.js";
import { documentHasBadAmount } from "./catalog.js";

describe("overlayWire", () => {
  it("round-trips extra on an item without JSON-stringifying the document body", () => {
    const document = { id: "mymod:widget", extra: { n: 1 } };
    const wire = encodeItem(document);
    expect(wire).toEqual({
      id: "mymod:widget",
      tags: undefined,
      stack: undefined,
      fuel: undefined,
      extensions: JSON.stringify({ extra: { n: 1 } }),
    });
    expect(decodeItem(wire)).toEqual(document);
    expect(overlayListFields("item", [document]).items).toEqual([wire]);
  });

  it("round-trips loot chance as percent 25", () => {
    const document = {
      id: "mymod:drops",
      entity: "mymod:mob",
      entries: [{ item: "minecraft:stick", chance: 25 }],
    };
    const wire = encodeLoot(document);
    expect(wire.entries[0]?.chance).toBe(25);
    expect(wire.entries[0]?.chance).not.toBe(250);
  });

  it("rejects loot chance 1000 and accepts 25", () => {
    expect(documentHasBadAmount("loot", { id: "x", entries: [{ item: "minecraft:stick", chance: 1000 }] })).toBe(true);
    expect(documentHasBadAmount("loot", { id: "x", entries: [{ item: "minecraft:stick", chance: 25 }] })).toBe(false);
    expect(documentHasBadAmount("loot", { id: "x", entries: [{ item: "minecraft:stick", chance: 100 }] })).toBe(false);
  });
});
