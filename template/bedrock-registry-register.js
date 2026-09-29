/**
 * Bedrock Registry — register template (schema 5).
 * Set SOURCE, uncomment and edit the kinds you ship, leave the rest empty.
 * Call registerPack() from your pack entry. No query. Host is optional.
 *
 * Drop-in: keep this file next to bedrock-registry-client.js and mcbe-ipc.js.
 * npm: change the import below to "@mcbe-registry/client/bedrock".
 *
 * Pack row: `id` is get("pack", id); `source` is the pack-index owner
 * (`list("pack", { source })`); `namespace` is the type-id prefix (`mymod:`).
 * Persist `SOURCE` on register is who owns every table. Use the same string
 * for all four unless you know you need them split.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- uncommented examples below */
import {
  BOTTLE,
  BUCKET,
  createBedrockClient,
  mb,
  registerFilledKinds,
} from "./bedrock-registry-client.js";

/** Persist pack id: lowercase letter, then letters, digits, or `_`. */
const SOURCE = "YOUR_PACK_ID";

const pack = [
  // {
  //   id: SOURCE,
  //   source: SOURCE,
  //   namespace: SOURCE,
  //   displayName: "My Mod",
  //   version: "1.0.0",
  //   creator: "you",
  // },
];

const item = [
  // { id: `${SOURCE}:widget`, tags: [`${SOURCE}:parts`] },
];

const block = [
  // { id: `${SOURCE}:crusher` },
  // { id: `${SOURCE}:widget_ore` },
];

const entity = [
  // { id: `${SOURCE}:golem` },
];

const fluid = [
  // {
  //   id: `${SOURCE}:latex`,
  //   kind: "liquid",
  //   vessels: [
  //     { filled: `${SOURCE}:latex_bottle`, empty: "minecraft:glass_bottle", amount: BOTTLE },
  //     { filled: `${SOURCE}:latex_bucket`, empty: "minecraft:bucket", amount: BUCKET },
  //     { filled: `${SOURCE}:latex_cell`, empty: `${SOURCE}:empty_cell`, amount: mb(250) },
  //   ],
  // },
];

const gas = [
  // {
  //   id: `${SOURCE}:steam`,
  //   kind: "gas",
  //   vessels: [{ filled: `${SOURCE}:steam_tank`, empty: `${SOURCE}:tank`, amount: BUCKET }],
  // },
];

const tag = [
  // { id: `${SOURCE}:parts`, domain: "item", members: [`${SOURCE}:widget`] },
];

const loot = [
  // {
  //   id: `${SOURCE}:crusher_drops`,
  //   block: `${SOURCE}:crusher`,
  //   tools: [
  //     "minecraft:netherite_pickaxe",
  //     "minecraft:diamond_pickaxe",
  //     "minecraft:iron_pickaxe",
  //   ],
  //   entries: [{ item: `${SOURCE}:widget`, chance: 100 }],
  // },
];

const recipe = [
  // {
  //   id: `${SOURCE}:widget_from_cobble`,
  //   stations: ["minecraft:crafting_table"],
  //   pattern: ["###", "# #", "###"],
  //   key: { "#": "minecraft:cobblestone" },
  //   outputs: [`${SOURCE}:widget`],
  // },
  // {
  //   id: `${SOURCE}:widget_shapeless`,
  //   stations: ["minecraft:crafting_table"],
  //   inputs: ["minecraft:cobblestone", "minecraft:stick"],
  //   outputs: [`${SOURCE}:widget`],
  // },
  // {
  //   id: `${SOURCE}:smelt_widget_ore`,
  //   stations: ["minecraft:furnace"],
  //   inputs: [`${SOURCE}:widget_ore`],
  //   outputs: [`${SOURCE}:widget`],
  // },
  // {
  //   id: `${SOURCE}:crush_cobble`,
  //   stations: [`${SOURCE}:crusher`],
  //   inputs: ["minecraft:cobblestone"],
  //   outputs: ["minecraft:gravel"],
  // },
];

/** Registers filled kinds when a schema-5 host is already in the world. */
export async function registerPack() {
  const registry = createBedrockClient();
  return registerFilledKinds(registry, SOURCE, {
    pack,
    item,
    block,
    entity,
    fluid,
    gas,
    tag,
    loot,
    recipe,
  });
}
