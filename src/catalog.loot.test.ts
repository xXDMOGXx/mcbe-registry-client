import { describe, expect, it } from "vitest";
import { LOOT_TOOL_NONE, createCatalog } from "./index.js";

describe("catalog loot indexes", () => {
  it("lists by entity, block, and drop item", () => {
    const catalog = createCatalog();
    catalog.registerDocument("loot", {
      id: "addon:stone",
      block: "addon:stone",
      entries: [{ item: "addon:pebble" }],
    });
    catalog.registerDocument("loot", {
      id: "addon:mob",
      entity: "addon:mob",
      entries: [{ item: "minecraft:gunpowder" }, { item: "addon:pebble" }],
    });
    expect(catalog.listDocuments("loot", { block: "addon:stone" }).map((row) => row.id)).toEqual(["addon:stone"]);
    expect(catalog.listDocuments("loot", { entity: "addon:mob" }).map((row) => row.id)).toEqual(["addon:mob"]);
    expect(catalog.listDocuments("loot", { item: "addon:pebble" }).map((row) => row.id).sort()).toEqual([
      "addon:mob",
      "addon:stone",
    ]);
    expect(catalog.listDocuments("loot", { block: "addon:stone", item: "addon:pebble" }).map((row) => row.id)).toEqual([
      "addon:stone",
    ]);
    expect(catalog.listDocuments("loot", { entity: "addon:mob", item: "minecraft:stick" })).toEqual([]);
  });

  it("lists by harvest tool including empty hand", () => {
    const catalog = createCatalog();
    catalog.registerDocument("loot", {
      id: "addon:ore",
      block: "addon:ore",
      tools: ["minecraft:iron_pickaxe", LOOT_TOOL_NONE],
      entries: [{ item: "addon:gem" }],
    });
    expect(catalog.listDocuments("loot", { tool: "minecraft:iron_pickaxe" }).map((row) => row.id)).toEqual(["addon:ore"]);
    expect(catalog.listDocuments("loot", { tool: LOOT_TOOL_NONE }).map((row) => row.id)).toEqual(["addon:ore"]);
    expect(catalog.listDocuments("loot", { tool: "minecraft:shears" })).toEqual([]);
  });

  it("restores vanilla loot when the overlay source drops", () => {
    const catalog = createCatalog();
    catalog.registerDocument("loot", {
      id: "addon:ore",
      block: "addon:ore",
      entries: [{ item: "addon:gem" }],
    });
    catalog.snapshotVanilla();
    catalog.registerDocument(
      "loot",
      {
        id: "addon:ore",
        block: "addon:ore",
        entries: [{ item: "other:fake" }],
      },
      "other",
    );
    expect(catalog.listDocuments("loot", { item: "other:fake" }).map((row) => row.id)).toEqual(["addon:ore"]);
    catalog.dropSource("other");
    expect(catalog.listDocuments("loot", { item: "addon:gem" }).map((row) => row.id)).toEqual(["addon:ore"]);
    expect(catalog.listDocuments("loot", { item: "other:fake" })).toEqual([]);
  });
});
