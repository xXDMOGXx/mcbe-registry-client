import { DEFAULT_REGISTRY_KIND, isRegistryKind, type RegistryKind } from "./kinds.js";
import type { FluidPotionId, FluidVesselDoc, LootEntry, RegistryDocument } from "./types.js";

const PACK_KNOWN = new Set(["id", "source", "displayName", "version", "namespace", "creator", "description", "extra"]);
const ITEM_KNOWN = new Set(["id", "tags", "stack", "fuel", "extra"]);
const ID_TAGS_KNOWN = new Set(["id", "tags", "extra"]);
const FLUID_KNOWN = new Set(["id", "kind", "vessels", "texture", "tags", "extra"]);
const TAG_KNOWN = new Set(["id", "domain", "members", "extra"]);
const LOOT_KNOWN = new Set(["id", "entity", "block", "tools", "entries", "extra"]);

/** Overlay catalog kind (every built-in except recipe). */
export type OverlayKind = Exclude<RegistryKind, "recipe">;

/** Wire potion identity. */
export interface PotionWireMsg {
  effectType: string;
  deliveryType: string;
}

/** Wire fluid/gas vessel. */
export interface FluidVesselWireMsg {
  filled: string;
  empty: string;
  amount: number;
  potion: PotionWireMsg | undefined;
}

/** Wire item fuel. */
export interface ItemFuelWireMsg {
  burnTicks: number;
}

/** Wire pack document. */
export interface PackWireMsg {
  id: string;
  source: string | undefined;
  displayName: string | undefined;
  version: string | undefined;
  namespace: string | undefined;
  creator: string | undefined;
  description: string | undefined;
  extensions: string | undefined;
}

/** Wire item document. */
export interface ItemWireMsg {
  id: string;
  tags: string[] | undefined;
  stack: number | undefined;
  fuel: ItemFuelWireMsg | undefined;
  extensions: string | undefined;
}

/** Wire block or entity document. */
export interface IdTagsWireMsg {
  id: string;
  tags: string[] | undefined;
  extensions: string | undefined;
}

/** Wire fluid or gas document. */
export interface FluidWireMsg {
  id: string;
  kind: string | undefined;
  vessels: FluidVesselWireMsg[];
  texture: string | undefined;
  tags: string[] | undefined;
  extensions: string | undefined;
}

/** Wire tag document. */
export interface TagWireMsg {
  id: string;
  domain: string | undefined;
  members: string[] | undefined;
  extensions: string | undefined;
}

/** Wire loot drop row. */
export interface LootEntryWireMsg {
  item: string | undefined;
  tag: string | undefined;
  fluid: string | undefined;
  gas: string | undefined;
  count: number | undefined;
  min: number | undefined;
  max: number | undefined;
  chance: number | undefined;
}

/** Wire loot document. */
export interface LootWireMsg {
  id: string;
  entity: string | undefined;
  block: string | undefined;
  tools: string[] | undefined;
  entries: LootEntryWireMsg[];
  extensions: string | undefined;
}

/** Overlay arrays on `register` / overlay `list`. */
export interface OverlayListFields {
  packs?: PackWireMsg[];
  items?: ItemWireMsg[];
  blocks?: IdTagsWireMsg[];
  entities?: IdTagsWireMsg[];
  fluids?: FluidWireMsg[];
  gases?: FluidWireMsg[];
  tags?: TagWireMsg[];
  loots?: LootWireMsg[];
}

/** Overlay object on `get`. */
export interface OverlayGetFields {
  pack?: PackWireMsg;
  item?: ItemWireMsg;
  block?: IdTagsWireMsg;
  entity?: IdTagsWireMsg;
  fluid?: FluidWireMsg;
  gas?: FluidWireMsg;
  tag?: TagWireMsg;
  loot?: LootWireMsg;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(document: RegistryDocument, key: string): string | undefined {
  const value = document[key];
  return typeof value === "string" ? value : undefined;
}

function stringArrayField(document: RegistryDocument, key: string): string[] | undefined {
  const value = document[key];
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const out: string[] = [];
  for (const row of value) {
    if (typeof row === "string" && row.length > 0) out.push(row);
  }
  return out.length > 0 ? out : undefined;
}

function extensionsFromDocument(document: RegistryDocument, known: Set<string>): string | undefined {
  const bag: Record<string, unknown> = {};
  if (document.extra !== undefined && isRecord(document.extra) && Object.keys(document.extra).length > 0) {
    bag.extra = document.extra;
  }
  for (const [key, value] of Object.entries(document)) {
    if (known.has(key) || value === undefined) continue;
    bag[key] = value;
  }
  if (Object.keys(bag).length === 0) return undefined;
  return JSON.stringify(bag);
}

function applyExtensions(document: RegistryDocument, extensions: string | undefined, known: Set<string>): void {
  if (extensions === undefined || extensions.length === 0) return;
  let bag: unknown;
  try {
    bag = JSON.parse(extensions) as unknown;
  } catch {
    return;
  }
  if (!isRecord(bag)) return;
  if (bag.extra !== undefined && isRecord(bag.extra)) {
    document.extra = bag.extra;
  }
  for (const [key, value] of Object.entries(bag)) {
    if (key === "extra" || known.has(key)) continue;
    document[key] = value;
  }
}

function encodePotion(potion: FluidPotionId | undefined): PotionWireMsg | undefined {
  if (potion === undefined) return undefined;
  return { effectType: potion.effectType, deliveryType: potion.deliveryType };
}

function encodeVessel(vessel: FluidVesselDoc): FluidVesselWireMsg {
  return {
    filled: vessel.filled,
    empty: vessel.empty,
    amount: vessel.amount,
    potion: encodePotion(vessel.potion),
  };
}

function decodeVessel(wire: FluidVesselWireMsg): FluidVesselDoc {
  const vessel: FluidVesselDoc = { filled: wire.filled, empty: wire.empty, amount: wire.amount };
  if (wire.potion !== undefined) {
    vessel.potion = { effectType: wire.potion.effectType, deliveryType: wire.potion.deliveryType };
  }
  return vessel;
}

function encodeLootEntry(entry: LootEntry): LootEntryWireMsg {
  return {
    item: entry.item,
    tag: entry.tag,
    fluid: entry.fluid,
    gas: entry.gas,
    count: entry.count,
    min: entry.min,
    max: entry.max,
    chance: entry.chance,
  };
}

function decodeLootEntry(wire: LootEntryWireMsg): LootEntry {
  const entry: LootEntry = {};
  if (wire.item !== undefined) entry.item = wire.item;
  if (wire.tag !== undefined) entry.tag = wire.tag;
  if (wire.fluid !== undefined) entry.fluid = wire.fluid;
  if (wire.gas !== undefined) entry.gas = wire.gas;
  if (wire.count !== undefined) entry.count = wire.count;
  if (wire.min !== undefined) entry.min = wire.min;
  if (wire.max !== undefined) entry.max = wire.max;
  if (wire.chance !== undefined) entry.chance = wire.chance;
  return entry;
}

function vesselsFromDocument(document: RegistryDocument): FluidVesselWireMsg[] {
  const raw = document.vessels;
  if (!Array.isArray(raw)) return [];
  const out: FluidVesselWireMsg[] = [];
  for (const row of raw) {
    if (!isRecord(row) || typeof row.filled !== "string" || typeof row.empty !== "string") continue;
    if (typeof row.amount !== "number") continue;
    const vessel: FluidVesselDoc = { filled: row.filled, empty: row.empty, amount: row.amount };
    if (
      isRecord(row.potion) &&
      typeof row.potion.effectType === "string" &&
      typeof row.potion.deliveryType === "string"
    ) {
      vessel.potion = { effectType: row.potion.effectType, deliveryType: row.potion.deliveryType };
    }
    out.push(encodeVessel(vessel));
  }
  return out;
}

function lootEntriesFromDocument(document: RegistryDocument): LootEntryWireMsg[] {
  const raw = document.entries;
  if (!Array.isArray(raw)) return [];
  const out: LootEntryWireMsg[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const entry: LootEntry = {};
    if (typeof row.item === "string") entry.item = row.item;
    if (typeof row.tag === "string") entry.tag = row.tag;
    if (typeof row.fluid === "string") entry.fluid = row.fluid;
    if (typeof row.gas === "string") entry.gas = row.gas;
    if (typeof row.count === "number") entry.count = row.count;
    if (typeof row.min === "number") entry.min = row.min;
    if (typeof row.max === "number") entry.max = row.max;
    if (typeof row.chance === "number") entry.chance = row.chance;
    out.push(encodeLootEntry(entry));
  }
  return out;
}

function encodeFuel(document: RegistryDocument): ItemFuelWireMsg | undefined {
  const fuel = document.fuel;
  if (!isRecord(fuel) || typeof fuel.burnTicks !== "number") return undefined;
  return { burnTicks: fuel.burnTicks };
}

/** Domain pack → wire. */
export function encodePack(document: RegistryDocument): PackWireMsg {
  return {
    id: document.id,
    source: stringField(document, "source"),
    displayName: stringField(document, "displayName"),
    version: stringField(document, "version"),
    namespace: stringField(document, "namespace"),
    creator: stringField(document, "creator"),
    description: stringField(document, "description"),
    extensions: extensionsFromDocument(document, PACK_KNOWN),
  };
}

/** Wire pack → domain. */
export function decodePack(wire: PackWireMsg): RegistryDocument {
  const document: RegistryDocument = { id: wire.id };
  if (wire.source !== undefined) document.source = wire.source;
  if (wire.displayName !== undefined) document.displayName = wire.displayName;
  if (wire.version !== undefined) document.version = wire.version;
  if (wire.namespace !== undefined) document.namespace = wire.namespace;
  if (wire.creator !== undefined) document.creator = wire.creator;
  if (wire.description !== undefined) document.description = wire.description;
  applyExtensions(document, wire.extensions, PACK_KNOWN);
  return document;
}

/** Domain item → wire. */
export function encodeItem(document: RegistryDocument): ItemWireMsg {
  const stack = document.stack;
  return {
    id: document.id,
    tags: stringArrayField(document, "tags"),
    stack: typeof stack === "number" ? stack : undefined,
    fuel: encodeFuel(document),
    extensions: extensionsFromDocument(document, ITEM_KNOWN),
  };
}

/** Wire item → domain. */
export function decodeItem(wire: ItemWireMsg): RegistryDocument {
  const document: RegistryDocument = { id: wire.id };
  if (wire.tags !== undefined) document.tags = [...wire.tags];
  if (wire.stack !== undefined) document.stack = wire.stack;
  if (wire.fuel !== undefined) document.fuel = { burnTicks: wire.fuel.burnTicks };
  applyExtensions(document, wire.extensions, ITEM_KNOWN);
  return document;
}

/** Domain block or entity → wire. */
export function encodeIdTags(document: RegistryDocument): IdTagsWireMsg {
  return {
    id: document.id,
    tags: stringArrayField(document, "tags"),
    extensions: extensionsFromDocument(document, ID_TAGS_KNOWN),
  };
}

/** Wire block or entity → domain. */
export function decodeIdTags(wire: IdTagsWireMsg): RegistryDocument {
  const document: RegistryDocument = { id: wire.id };
  if (wire.tags !== undefined) document.tags = [...wire.tags];
  applyExtensions(document, wire.extensions, ID_TAGS_KNOWN);
  return document;
}

/** Domain fluid or gas → wire. */
export function encodeFluid(document: RegistryDocument): FluidWireMsg {
  return {
    id: document.id,
    kind: stringField(document, "kind"),
    vessels: vesselsFromDocument(document),
    texture: stringField(document, "texture"),
    tags: stringArrayField(document, "tags"),
    extensions: extensionsFromDocument(document, FLUID_KNOWN),
  };
}

/** Wire fluid or gas → domain. */
export function decodeFluid(wire: FluidWireMsg): RegistryDocument {
  const document: RegistryDocument = {
    id: wire.id,
    vessels: wire.vessels.map(decodeVessel),
  };
  if (wire.kind !== undefined) document.kind = wire.kind;
  if (wire.texture !== undefined) document.texture = wire.texture;
  if (wire.tags !== undefined) document.tags = [...wire.tags];
  applyExtensions(document, wire.extensions, FLUID_KNOWN);
  return document;
}

/** Domain tag → wire. */
export function encodeTag(document: RegistryDocument): TagWireMsg {
  return {
    id: document.id,
    domain: stringField(document, "domain"),
    members: stringArrayField(document, "members"),
    extensions: extensionsFromDocument(document, TAG_KNOWN),
  };
}

/** Wire tag → domain. */
export function decodeTag(wire: TagWireMsg): RegistryDocument {
  const document: RegistryDocument = { id: wire.id };
  if (wire.domain !== undefined) document.domain = wire.domain;
  if (wire.members !== undefined) document.members = [...wire.members];
  applyExtensions(document, wire.extensions, TAG_KNOWN);
  return document;
}

/** Domain loot → wire. */
export function encodeLoot(document: RegistryDocument): LootWireMsg {
  return {
    id: document.id,
    entity: stringField(document, "entity"),
    block: stringField(document, "block"),
    tools: stringArrayField(document, "tools"),
    entries: lootEntriesFromDocument(document),
    extensions: extensionsFromDocument(document, LOOT_KNOWN),
  };
}

/** Wire loot → domain. */
export function decodeLoot(wire: LootWireMsg): RegistryDocument {
  const document: RegistryDocument = {
    id: wire.id,
    entries: wire.entries.map(decodeLootEntry),
  };
  if (wire.entity !== undefined) document.entity = wire.entity;
  if (wire.block !== undefined) document.block = wire.block;
  if (wire.tools !== undefined) document.tools = [...wire.tools];
  applyExtensions(document, wire.extensions, LOOT_KNOWN);
  return document;
}

/** True when `kind` is a non-recipe built-in. */
export function isOverlayKind(kind: string): kind is OverlayKind {
  return isRegistryKind(kind) && kind !== DEFAULT_REGISTRY_KIND;
}

/** Domain overlay document → that kind’s wire object. */
export function encodeOverlayDocument(kind: OverlayKind, document: RegistryDocument): unknown {
  switch (kind) {
    case "pack":
      return encodePack(document);
    case "item":
      return encodeItem(document);
    case "block":
    case "entity":
      return encodeIdTags(document);
    case "fluid":
    case "gas":
      return encodeFluid(document);
    case "tag":
      return encodeTag(document);
    case "loot":
      return encodeLoot(document);
  }
}

/** That kind’s wire object → domain document. */
export function decodeOverlayDocument(kind: OverlayKind, wire: unknown): RegistryDocument | undefined {
  if (!isRecord(wire) || typeof wire.id !== "string") return undefined;
  switch (kind) {
    case "pack":
      return decodePack(wire as unknown as PackWireMsg);
    case "item":
      return decodeItem(wire as unknown as ItemWireMsg);
    case "block":
    case "entity":
      return decodeIdTags(wire as unknown as IdTagsWireMsg);
    case "fluid":
    case "gas": {
      const fluid = wire as unknown as FluidWireMsg;
      return decodeFluid({
        ...fluid,
        vessels: Array.isArray(fluid.vessels) ? fluid.vessels : [],
      });
    }
    case "tag":
      return decodeTag(wire as unknown as TagWireMsg);
    case "loot": {
      const loot = wire as unknown as LootWireMsg;
      return decodeLoot({
        ...loot,
        entries: Array.isArray(loot.entries) ? loot.entries : [],
      });
    }
  }
}

/** Typed `register` / overlay-list arrays for one kind. */
export function overlayListFields(kind: OverlayKind, documents: readonly RegistryDocument[]): OverlayListFields {
  switch (kind) {
    case "pack":
      return { packs: documents.map(encodePack) };
    case "item":
      return { items: documents.map(encodeItem) };
    case "block":
      return { blocks: documents.map(encodeIdTags) };
    case "entity":
      return { entities: documents.map(encodeIdTags) };
    case "fluid":
      return { fluids: documents.map(encodeFluid) };
    case "gas":
      return { gases: documents.map(encodeFluid) };
    case "tag":
      return { tags: documents.map(encodeTag) };
    case "loot":
      return { loots: documents.map(encodeLoot) };
  }
}

function wiresOf(kind: OverlayKind, fields: OverlayListFields): unknown[] {
  switch (kind) {
    case "pack":
      return fields.packs ?? [];
    case "item":
      return fields.items ?? [];
    case "block":
      return fields.blocks ?? [];
    case "entity":
      return fields.entities ?? [];
    case "fluid":
      return fields.fluids ?? [];
    case "gas":
      return fields.gases ?? [];
    case "tag":
      return fields.tags ?? [];
    case "loot":
      return fields.loots ?? [];
  }
}

/** Decode overlay `register` / `list` arrays for one kind. */
export function documentsFromOverlayList(kind: OverlayKind, fields: OverlayListFields): RegistryDocument[] {
  const out: RegistryDocument[] = [];
  for (const wire of wiresOf(kind, fields)) {
    const document = decodeOverlayDocument(kind, wire);
    if (document !== undefined) out.push(document);
  }
  return out;
}

/** True when every overlay array is missing or empty (fingerprint ping). */
export function overlayListsEmpty(fields: OverlayListFields): boolean {
  return wiresOf("pack", fields).length === 0
    && wiresOf("item", fields).length === 0
    && wiresOf("block", fields).length === 0
    && wiresOf("entity", fields).length === 0
    && wiresOf("fluid", fields).length === 0
    && wiresOf("gas", fields).length === 0
    && wiresOf("tag", fields).length === 0
    && wiresOf("loot", fields).length === 0;
}

/** Typed `get` field for one overlay document. */
export function overlayGetFields(kind: OverlayKind, document: RegistryDocument): OverlayGetFields {
  switch (kind) {
    case "pack":
      return { pack: encodePack(document) };
    case "item":
      return { item: encodeItem(document) };
    case "block":
      return { block: encodeIdTags(document) };
    case "entity":
      return { entity: encodeIdTags(document) };
    case "fluid":
      return { fluid: encodeFluid(document) };
    case "gas":
      return { gas: encodeFluid(document) };
    case "tag":
      return { tag: encodeTag(document) };
    case "loot":
      return { loot: encodeLoot(document) };
  }
}

/** Decode overlay `get` for one kind. */
export function documentFromOverlayGet(kind: OverlayKind, fields: OverlayGetFields): RegistryDocument | undefined {
  switch (kind) {
    case "pack":
      return fields.pack !== undefined ? decodePack(fields.pack) : undefined;
    case "item":
      return fields.item !== undefined ? decodeItem(fields.item) : undefined;
    case "block":
      return fields.block !== undefined ? decodeIdTags(fields.block) : undefined;
    case "entity":
      return fields.entity !== undefined ? decodeIdTags(fields.entity) : undefined;
    case "fluid":
      return fields.fluid !== undefined ? decodeFluid(fields.fluid) : undefined;
    case "gas":
      return fields.gas !== undefined ? decodeFluid(fields.gas) : undefined;
    case "tag":
      return fields.tag !== undefined ? decodeTag(fields.tag) : undefined;
    case "loot":
      return fields.loot !== undefined ? decodeLoot(fields.loot) : undefined;
  }
}
