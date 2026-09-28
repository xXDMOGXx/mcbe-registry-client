import { describe, expect, it } from "vitest";
import { BOTTLE, createCatalog } from "./index.js";

describe("catalog fluid vessels", () => {
  it("indexes filled buckets and potion bottles from fluid documents", () => {
    const catalog = createCatalog();
    catalog.registerDocument("fluid", {
      id: "minecraft:water",
      kind: "liquid",
      vessels: [
        { filled: "minecraft:water_bucket", empty: "minecraft:bucket", amount: 3000 },
        {
          filled: "minecraft:potion",
          empty: "minecraft:glass_bottle",
          amount: BOTTLE,
          potion: { effectType: "minecraft:water", deliveryType: "Consume" },
        },
      ],
    });
    expect(catalog.fluidVesselOf({ typeId: "minecraft:water_bucket" })?.fluidId).toBe("minecraft:water");
    expect(catalog.fluidVesselOf({ typeId: "minecraft:potion" })).toBeUndefined();
    expect(
      catalog.fluidVesselOf({
        typeId: "minecraft:potion",
        potion: { effectType: "minecraft:water", deliveryType: "Consume" },
      })?.amount,
    ).toBe(BOTTLE);
    expect(catalog.fluidsForEmpty("liquid", "minecraft:bucket").map((row) => row.fluidId)).toEqual(["minecraft:water"]);
  });

  it("replaceSource for one pack leaves other fluids indexed", () => {
    const catalog = createCatalog();
    catalog.registerDocument("fluid", {
      id: "minecraft:water",
      kind: "liquid",
      vessels: [{ filled: "minecraft:water_bucket", empty: "minecraft:bucket", amount: 3000 }],
    });
    catalog.replaceSource(
      "addon",
      [
        {
          id: "addon:latex",
          kind: "liquid",
          vessels: [{ filled: "addon:latex_bottle", empty: "minecraft:glass_bottle", amount: BOTTLE }],
        },
      ],
      "fluid",
    );
    expect(catalog.fluidVesselOf({ typeId: "addon:latex_bottle" })?.fluidId).toBe("addon:latex");
    expect(catalog.fluidVesselOf({ typeId: "minecraft:water_bucket" })?.fluidId).toBe("minecraft:water");
    catalog.replaceSource("addon", [], "fluid");
    expect(catalog.fluidVesselOf({ typeId: "addon:latex_bottle" })).toBeUndefined();
    expect(catalog.fluidVesselOf({ typeId: "minecraft:water_bucket" })?.fluidId).toBe("minecraft:water");
  });
});
