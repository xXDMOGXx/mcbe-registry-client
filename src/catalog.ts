import { compactIngredient, compactRecipe } from "./compactJson.js";
import { DEFAULT_REGISTRY_KIND, isRegistryKind } from "./kinds.js";
import {
  groupRecipeYields,
  postingKey,
  queryMatchCount,
  queryPostingClauses,
  recipeMatchCount,
  recipeMatches,
  recipePostingTokens,
  type TagIndex,
} from "./match.js";
import { isValidSource } from "./source.js";
import type {
  FluidPotionId,
  Ingredient,
  ListEntry,
  ListFilter,
  MatchQuery,
  MatchResult,
  Recipe,
  RegistryDocument,
} from "./types.js";

/** Generic stored document (`id` plus leftover keys). */
export type CatalogDocument = RegistryDocument;

/** I/O table: liquid vs gas. */
export type FluidKind = "liquid" | "gas";

/** One filled container mapping indexed from a fluid/gas document. */
export interface CatalogFluidVessel {
  readonly kind: FluidKind;
  readonly fluidId: string;
  readonly filledTypeId: string;
  readonly emptyTypeId: string;
  /** Base units (`amount` on the document). */
  readonly amount: number;
  readonly potion?: FluidPotionId;
}

/** Filled-container identity used to look up a vessel. */
export interface FluidFillIdentity {
  readonly typeId: string;
  readonly potion?: FluidPotionId;
}

/** Vanilla item/block tag maps seeded at {@link createCatalog}. */
export interface CatalogOptions {
  tags?: {
    item?: TagIndex;
    block?: TagIndex;
  };
}

/** In-memory catalog: recipes keep match indexes; fluid/gas also index vessels. */
export interface Catalog {
  /** Validates and stores a recipe; replaces the same id in place. Optional `source` is the last-writer pack. Returns false when required fields are missing. */
  register(recipe: unknown, source?: string): boolean;
  /** Stores a document of `kind`. Recipe kind uses recipe validation. */
  registerDocument(kind: string, document: unknown, source?: string): boolean;
  /** Deletes recipe `id`, or restores the vanilla backup when `id` was an overlay. Missing id is a no-op. */
  unregister(id: string): void;
  /** Deletes `(kind, id)` with vanilla restore only for recipe overlays. */
  unregisterDocument(kind: string, id: string): void;
  /** Copies the current recipe catalog as the vanilla backup used by {@link dropSource}. */
  snapshotVanilla(): void;
  /** Drops every id owned by `source` (all kinds) and restores vanilla backups for overwritten recipe ids. */
  dropSource(source: string): void;
  /** Replaces that source's documents of `kind` (default recipe). Returns other sources whose ids were overwritten. */
  replaceSource(source: string, documents: readonly unknown[], kind?: string): string[];
  /** Stored recipes currently owned by `source`. */
  recipesForSource(source: string): Recipe[];
  /** Stored documents of `kind` currently owned by `source`. */
  documentsForSource(source: string, kind?: string): CatalogDocument[];
  /** Last-writer packs that currently own at least one document of `kind`. */
  overlaySources(kind?: string): string[];
  /** Last-writer pack for recipe `id`, or undefined when the id is vanilla or session-only. */
  sourceOf(id: string): string | undefined;
  /** Last-writer pack for `(kind, id)`. */
  sourceOfDocument(kind: string, id: string): string | undefined;
  /** Stored recipe for `id`, or undefined. */
  get(id: string): Recipe | undefined;
  /** Stored document for `(kind, id)`, or undefined. */
  getDocument(kind: string, id: string): CatalogDocument | undefined;
  /** All stored recipes in registration order. */
  recipes(): Recipe[];
  /** Compact recipe rows, optionally filtered by station and/or reverse output/leftover item id. */
  list(filter?: ListFilter): ListEntry[];
  /** Documents of `kind` in registration order. Pack/tag/loot/recipe filters are declared indexes. */
  listDocuments(kind: string, filter?: ListFilter): CatalogDocument[];
  /** Matching recipe ids via station/count/token postings, then {@link recipeMatches}. */
  matchIds(query: MatchQuery): string[];
  /** Distinct yields for the same ask as {@link matchIds}. */
  matchResults(query: MatchQuery): MatchResult[];
  /** Vessel for a filled container identity, or undefined if it is an item. */
  fluidVesselOf(identity: FluidFillIdentity): CatalogFluidVessel | undefined;
  /** Vessels that empty into `emptyTypeId` on `kind`. */
  fluidsForEmpty(kind: FluidKind, emptyTypeId: string): readonly CatalogFluidVessel[];
  /** Vessel for `fluidId` that empties into `emptyTypeId` on `kind`. */
  vesselForEmpty(kind: FluidKind, emptyTypeId: string, fluidId: string): CatalogFluidVessel | undefined;
  /** Number of stored documents across all kinds. */
  size(): number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Last path segment of a namespaced id. */
function bareId(typeId: string): string {
  const i = typeId.lastIndexOf(":");
  return i >= 0 ? typeId.slice(i + 1) : typeId;
}

function potionKey(effectType: string, deliveryType: string): string {
  return `${bareId(effectType).toLowerCase()}:${bareId(deliveryType).toLowerCase()}`;
}

function vesselTableKind(kind: string, document: CatalogDocument): FluidKind {
  if (kind === "gas" || document.kind === "gas") return "gas";
  return "liquid";
}

function isFluidKind(kind: string): boolean {
  return kind === "fluid" || kind === "gas";
}

function isIngredient(value: unknown): value is Ingredient {
  if (typeof value === "string") return value.length > 0;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.fluid === "string") return Number.isInteger(obj.amount) && (obj.amount as number) >= 1;
  if (typeof obj.gas === "string") return Number.isInteger(obj.amount) && (obj.amount as number) >= 1;
  return typeof obj.item === "string" || typeof obj.tag === "string";
}

/** True when a fluid/gas amount is missing or not a positive integer. */
export function documentHasBadAmount(kind: string, document: unknown): boolean {
  if (typeof document !== "object" || document === null || Array.isArray(document)) return false;
  const obj = document as Record<string, unknown>;
  if (kind === "fluid" || kind === "gas") {
    if (!Array.isArray(obj.vessels)) return true;
    for (const vessel of obj.vessels) {
      if (typeof vessel !== "object" || vessel === null || Array.isArray(vessel)) return true;
      const amount = (vessel as { amount?: unknown }).amount;
      if (!Number.isInteger(amount) || (amount as number) < 1) return true;
    }
    return false;
  }
  if (kind === "loot") {
    if (!Array.isArray(obj.entries)) return true;
    for (const entry of obj.entries) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return true;
      const row = entry as Record<string, unknown>;
      for (const key of ["count", "min", "max", "chance"] as const) {
        const value = row[key];
        if (value === undefined) continue;
        if (!Number.isInteger(value)) return true;
      }
      const chance = row.chance;
      if (chance !== undefined && ((chance as number) < 1 || (chance as number) > 1000)) return true;
    }
    return false;
  }
  if (kind !== "recipe") return false;
  const visit = (ing: unknown): boolean => {
    if (typeof ing !== "object" || ing === null || Array.isArray(ing)) return false;
    const row = ing as Record<string, unknown>;
    if (typeof row.fluid !== "string" && typeof row.gas !== "string") return false;
    return !Number.isInteger(row.amount) || (row.amount as number) < 1;
  };
  const lists = [obj.inputs, obj.outputs];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const ing of list) {
      if (visit(ing)) return true;
    }
  }
  if (obj.leftover !== undefined && visit(obj.leftover)) return true;
  if (obj.key !== undefined && typeof obj.key === "object" && obj.key !== null) {
    for (const ing of Object.values(obj.key as Record<string, unknown>)) {
      if (visit(ing)) return true;
    }
  }
  return false;
}

function isDocument(value: unknown): value is CatalogDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return isNonEmptyString(obj.id);
}

function cloneDocument(value: CatalogDocument): CatalogDocument {
  return { ...value };
}

/** Catalog kinds whose document `tags` write membership for that domain. */
const OVERLAY_TAG_KINDS = new Set(["item", "block", "entity", "fluid", "gas"]);
/** Membership owner for vanilla tag snapshots (not a persist `source`). */
const VANILLA_TAG_OWNER = "\0vanilla";

function stringField(document: CatalogDocument, key: string): string | undefined {
  const value = document[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tagsField(document: CatalogDocument): string[] {
  const tags = document.tags;
  if (!Array.isArray(tags)) return [];
  return tags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
}

function membersField(document: CatalogDocument): string[] {
  const members = document.members;
  if (!Array.isArray(members)) return [];
  return members.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function tagOwner(source: string | undefined, documentId: string): string {
  return source !== undefined ? source : `\0session:${documentId}`;
}

function isRecipe(value: unknown): value is Recipe {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (!isNonEmptyString(obj.id)) return false;
  if (!Array.isArray(obj.stations) || obj.stations.length < 1 || !obj.stations.every(isNonEmptyString)) return false;
  if (!Array.isArray(obj.inputs) || !obj.inputs.every(isIngredient)) return false;
  if (!Array.isArray(obj.outputs) || !obj.outputs.every(isIngredient)) return false;
  return true;
}

function ingredientInputId(ingredient: Ingredient): string | undefined {
  if (typeof ingredient === "string") return ingredient;
  return ingredient.item ?? ingredient.fluid ?? ingredient.gas;
}

function addIndex(map: Map<string, Set<string>>, key: string, recipeId: string): void {
  let set = map.get(key);
  if (set === undefined) {
    set = new Set();
    map.set(key, set);
  }
  set.add(recipeId);
}

function removeIndex(map: Map<string, Set<string>>, key: string, recipeId: string): void {
  const set = map.get(key);
  if (set === undefined) return;
  set.delete(recipeId);
  if (set.size === 0) map.delete(key);
}

function indexOutputs(recipe: Recipe, byOutput: Map<string, Set<string>>, byLeftover: Map<string, Set<string>>, byInput: Map<string, Set<string>>, add: boolean): void {
  const write = add ? addIndex : removeIndex;
  for (const output of recipe.outputs) {
    const id = ingredientInputId(output);
    if (id !== undefined) write(byOutput, id, recipe.id);
  }
  for (const input of recipe.inputs) {
    const id = ingredientInputId(input);
    if (id !== undefined) write(byInput, id, recipe.id);
  }
  if (recipe.leftover !== undefined) {
    const id = ingredientInputId(recipe.leftover);
    if (id !== undefined) write(byLeftover, id, recipe.id);
  }
}

function toListEntry(recipe: Recipe): ListEntry {
  const entry: ListEntry = { id: recipe.id, stations: recipe.stations };
  if (recipe.type !== undefined) entry.type = recipe.type;
  if (recipe.leftover !== undefined) entry.leftover = compactIngredient(recipe.leftover);
  return entry;
}

function recipeTags(tokens: readonly string[]): string[] {
  const tags: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("t:")) tags.push(token.slice(2));
  }
  return tags;
}

function unionPostings(postings: Map<string, Set<string>>, station: string, count: number, tokens: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const token of tokens) {
    const set = postings.get(postingKey(station, count, token));
    if (set === undefined) continue;
    for (const id of set) out.add(id);
  }
  return out;
}

function intersectSets(sets: Set<string>[]): Set<string> {
  if (sets.length === 0) return new Set();
  let smallest = sets[0]!;
  for (let i = 1; i < sets.length; i++) {
    if (sets[i]!.size < smallest.size) smallest = sets[i]!;
  }
  const out = new Set<string>();
  for (const id of smallest) {
    let ok = true;
    for (const set of sets) {
      if (set !== smallest && !set.has(id)) {
        ok = false;
        break;
      }
    }
    if (ok) out.add(id);
  }
  return out;
}

function priorityOf(recipe: Recipe): number {
  return recipe.priority ?? 0;
}

/** Empty catalog. Vanilla snapshot should be registered first so it wins equal-priority ties. */
export function createCatalog(options?: CatalogOptions): Catalog {
  const order: string[] = [];
  const seqById = new Map<string, number>();
  let nextSeq = 0;
  const byId = new Map<string, Recipe>();
  const byOutput = new Map<string, Set<string>>();
  const byLeftover = new Map<string, Set<string>>();
  const byInput = new Map<string, Set<string>>();
  const postings = new Map<string, Set<string>>();
  const tagRef = new Map<string, number>();
  const byStation = new Map<string, Set<string>>();
  const byStationOrder = new Map<string, string[]>();
  const vanillaById = new Map<string, Recipe>();
  const vanillaOtherByKind = new Map<string, Map<string, CatalogDocument>>();
  const sourceOfId = new Map<string, string>();
  const idsBySource = new Map<string, Map<string, Set<string>>>();
  const otherByKind = new Map<
    string,
    {
      order: string[];
      seqById: Map<string, number>;
      nextSeq: number;
      byId: Map<string, CatalogDocument>;
      sourceOfId: Map<string, string>;
    }
  >();
  const byFilled = new Map<string, CatalogFluidVessel>();
  const byPotion = new Map<string, CatalogFluidVessel>();
  const byEmptyKind = new Map<string, CatalogFluidVessel[]>();
  const byEmptyFluid = new Map<string, CatalogFluidVessel>();
  const fluidVesselsById = new Map<string, CatalogFluidVessel[]>();
  const pairOwners = new Map<string, Map<string, Map<string, Set<string>>>>();
  const membersByTag = new Map<string, Map<string, Set<string>>>();
  const itemTagIndex: Record<string, string[]> = {};
  const overlayByOwner = new Map<string, Map<string, Map<string, readonly string[]>>>();
  const tagDocByOwner = new Map<string, Map<string, Map<string, readonly string[]>>>();
  const byPackSource = new Map<string, Set<string>>();
  const byPackNamespace = new Map<string, Set<string>>();
  const byPackCreator = new Map<string, Set<string>>();
  const byPackDisplayName = new Map<string, Set<string>>();
  const byTagDomain = new Map<string, Set<string>>();
  const byLootEntity = new Map<string, Set<string>>();
  const byLootBlock = new Map<string, Set<string>>();
  const byLootItem = new Map<string, Set<string>>();
  const byLootFluid = new Map<string, Set<string>>();
  const byLootGas = new Map<string, Set<string>>();
  const byLootTool = new Map<string, Set<string>>();

  const addPair = (domain: string, member: string, tag: string, owner: string): void => {
    let members = pairOwners.get(domain);
    if (members === undefined) {
      members = new Map();
      pairOwners.set(domain, members);
    }
    let tags = members.get(member);
    if (tags === undefined) {
      tags = new Map();
      members.set(member, tags);
    }
    let owners = tags.get(tag);
    if (owners === undefined) {
      owners = new Set();
      tags.set(tag, owners);
    }
    if (owners.has(owner)) return;
    owners.add(owner);
    if (owners.size !== 1) return;
    let byTag = membersByTag.get(domain);
    if (byTag === undefined) {
      byTag = new Map();
      membersByTag.set(domain, byTag);
    }
    let set = byTag.get(tag);
    if (set === undefined) {
      set = new Set();
      byTag.set(tag, set);
    }
    set.add(member);
    if (domain === "item") {
      const current = itemTagIndex[member];
      itemTagIndex[member] = current === undefined ? [tag] : [...current, tag];
    }
  };

  const removePair = (domain: string, member: string, tag: string, owner: string): void => {
    const members = pairOwners.get(domain);
    const tags = members?.get(member);
    const owners = tags?.get(tag);
    if (owners === undefined || !owners.delete(owner)) return;
    if (owners.size > 0) return;
    tags!.delete(tag);
    if (tags!.size === 0) members!.delete(member);
    if (members!.size === 0) pairOwners.delete(domain);
    const byTag = membersByTag.get(domain);
    const set = byTag?.get(tag);
    if (set !== undefined) {
      set.delete(member);
      if (set.size === 0) byTag!.delete(tag);
      if (byTag!.size === 0) membersByTag.delete(domain);
    }
    if (domain === "item") {
      const current = itemTagIndex[member];
      if (current === undefined) return;
      const next = current.filter((row) => row !== tag);
      if (next.length === 0) delete itemTagIndex[member];
      else itemTagIndex[member] = next;
    }
  };

  const nested3 = <V>(root: Map<string, Map<string, Map<string, V>>>, a: string, b: string): Map<string, V> => {
    let mid = root.get(a);
    if (mid === undefined) {
      mid = new Map();
      root.set(a, mid);
    }
    let inner = mid.get(b);
    if (inner === undefined) {
      inner = new Map();
      mid.set(b, inner);
    }
    return inner;
  };

  const setOverlayTags = (owner: string, domain: string, member: string, tags: readonly string[]): void => {
    const inner = nested3(overlayByOwner, owner, domain);
    const previous = inner.get(member);
    if (previous !== undefined) {
      for (const tag of previous) removePair(domain, member, tag, owner);
    }
    if (tags.length === 0) {
      inner.delete(member);
      return;
    }
    inner.set(member, tags);
    for (const tag of tags) addPair(domain, member, tag, owner);
  };

  const clearOverlayMember = (owner: string, domain: string, member: string): void => {
    const tags = overlayByOwner.get(owner)?.get(domain)?.get(member);
    if (tags === undefined) return;
    for (const tag of tags) removePair(domain, member, tag, owner);
    overlayByOwner.get(owner)?.get(domain)?.delete(member);
  };

  const clearOverlayOwnerDomain = (owner: string, domain: string): void => {
    const members = overlayByOwner.get(owner)?.get(domain);
    if (members === undefined) return;
    for (const [member, tags] of members) {
      for (const tag of tags) removePair(domain, member, tag, owner);
    }
    overlayByOwner.get(owner)?.delete(domain);
  };

  const clearOverlayOwner = (owner: string): void => {
    const domains = overlayByOwner.get(owner);
    if (domains === undefined) return;
    for (const domain of [...domains.keys()]) clearOverlayOwnerDomain(owner, domain);
    overlayByOwner.delete(owner);
  };

  const setTagDocMembers = (owner: string, domain: string, tagId: string, members: readonly string[]): void => {
    const inner = nested3(tagDocByOwner, owner, domain);
    const previous = inner.get(tagId);
    if (previous !== undefined) {
      for (const member of previous) removePair(domain, member, tagId, owner);
    }
    if (members.length === 0) {
      inner.delete(tagId);
      return;
    }
    inner.set(tagId, members);
    for (const member of members) addPair(domain, member, tagId, owner);
  };

  const clearTagDocOwner = (owner: string): void => {
    const domains = tagDocByOwner.get(owner);
    if (domains === undefined) return;
    for (const [domain, tags] of domains) {
      for (const [tagId, members] of tags) {
        for (const member of members) removePair(domain, member, tagId, owner);
      }
    }
    tagDocByOwner.delete(owner);
  };

  const indexPackField = (map: Map<string, Set<string>>, key: string | undefined, id: string, add: boolean): void => {
    if (key === undefined) return;
    if (add) addIndex(map, key, id);
    else removeIndex(map, key, id);
  };

  const writePackIndexes = (document: CatalogDocument, add: boolean): void => {
    indexPackField(byPackSource, stringField(document, "source") ?? document.id, document.id, add);
    indexPackField(byPackNamespace, stringField(document, "namespace"), document.id, add);
    indexPackField(byPackCreator, stringField(document, "creator"), document.id, add);
    indexPackField(byPackDisplayName, stringField(document, "displayName"), document.id, add);
  };

  const writeTagDomainIndex = (document: CatalogDocument, add: boolean): void => {
    const domain = stringField(document, "domain");
    if (domain === undefined) return;
    if (add) addIndex(byTagDomain, domain, document.id);
    else removeIndex(byTagDomain, domain, document.id);
  };

  /** Reverse indexes for `list("loot")` (`entity` / `block` / `tool` / drop ids). */
  const writeLootIndexes = (document: CatalogDocument, add: boolean): void => {
    const write = add ? addIndex : removeIndex;
    const entity = stringField(document, "entity");
    if (entity !== undefined) write(byLootEntity, entity, document.id);
    const block = stringField(document, "block");
    if (block !== undefined) write(byLootBlock, block, document.id);
    const tools = document.tools;
    if (Array.isArray(tools)) {
      for (const tool of tools) {
        if (typeof tool === "string" && tool.length > 0) write(byLootTool, tool, document.id);
      }
    }
    const entries = document.entries;
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.item === "string" && row.item.length > 0) write(byLootItem, row.item, document.id);
      if (typeof row.fluid === "string" && row.fluid.length > 0) write(byLootFluid, row.fluid, document.id);
      if (typeof row.gas === "string" && row.gas.length > 0) write(byLootGas, row.gas, document.id);
    }
  };

  const seedVanilla = (domain: string, index: TagIndex | undefined): void => {
    if (index === undefined) return;
    for (const [member, tags] of Object.entries(index)) {
      if (tags.length === 0) continue;
      setOverlayTags(VANILLA_TAG_OWNER, domain, member, [...tags]);
    }
  };
  seedVanilla("item", options?.tags?.item);
  seedVanilla("block", options?.tags?.block);

  const addFilledKey = (key: string, value: CatalogFluidVessel): void => {
    byFilled.set(key, value);
    byFilled.set(bareId(key), value);
  };

  const vesselMatchesFluid = (vessel: CatalogFluidVessel, fluidId: string): boolean => {
    return vessel.fluidId === fluidId || bareId(vessel.fluidId) === bareId(fluidId);
  };

  const unindexFluid = (id: string): void => {
    const vessels = fluidVesselsById.get(id) ?? fluidVesselsById.get(bareId(id));
    if (vessels === undefined) return;
    const fluidId = vessels[0]?.fluidId ?? id;
    for (const vessel of vessels) {
      if (vessel.potion) {
        byPotion.delete(potionKey(vessel.potion.effectType, vessel.potion.deliveryType));
      } else {
        byFilled.delete(vessel.filledTypeId);
        byFilled.delete(bareId(vessel.filledTypeId));
      }
      const emptyKey = `${vessel.kind}:${bareId(vessel.emptyTypeId)}`;
      const list = (byEmptyKind.get(emptyKey) ?? []).filter((row) => !vesselMatchesFluid(row, fluidId));
      if (list.length === 0) byEmptyKind.delete(emptyKey);
      else byEmptyKind.set(emptyKey, list);
      byEmptyFluid.delete(`${emptyKey}:${bareId(vessel.fluidId)}`);
    }
    fluidVesselsById.delete(fluidId);
    fluidVesselsById.delete(bareId(fluidId));
  };

  const indexFluid = (kind: string, document: CatalogDocument): void => {
    unindexFluid(document.id);
    const table = vesselTableKind(kind, document);
    const vessels: CatalogFluidVessel[] = [];
    const rows = document.vessels;
    if (!Array.isArray(rows)) {
      fluidVesselsById.set(document.id, vessels);
      return;
    }
    for (const row of rows) {
      if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
      const rec = row as { filled?: unknown; empty?: unknown; amount?: unknown; potion?: FluidPotionId };
      if (typeof rec.filled !== "string" || typeof rec.empty !== "string" || typeof rec.amount !== "number") continue;
      const vessel: CatalogFluidVessel = rec.potion
        ? {
            kind: table,
            fluidId: document.id,
            filledTypeId: rec.filled,
            emptyTypeId: rec.empty,
            amount: rec.amount,
            potion: rec.potion,
          }
        : {
            kind: table,
            fluidId: document.id,
            filledTypeId: rec.filled,
            emptyTypeId: rec.empty,
            amount: rec.amount,
          };
      vessels.push(vessel);
      if (vessel.potion) {
        byPotion.set(potionKey(vessel.potion.effectType, vessel.potion.deliveryType), vessel);
      } else {
        addFilledKey(vessel.filledTypeId, vessel);
      }
      const emptyKey = `${vessel.kind}:${bareId(vessel.emptyTypeId)}`;
      const list = byEmptyKind.get(emptyKey) ?? [];
      list.push(vessel);
      byEmptyKind.set(emptyKey, list);
      byEmptyFluid.set(`${emptyKey}:${bareId(vessel.fluidId)}`, vessel);
    }
    fluidVesselsById.set(document.id, vessels);
    fluidVesselsById.set(bareId(document.id), vessels);
  };

  const kindSet = (source: string, kind: string): Set<string> => {
    let kinds = idsBySource.get(source);
    if (kinds === undefined) {
      kinds = new Map();
      idsBySource.set(source, kinds);
    }
    let set = kinds.get(kind);
    if (set === undefined) {
      set = new Set();
      kinds.set(kind, set);
    }
    return set;
  };

  const otherStore = (kind: string) => {
    let store = otherByKind.get(kind);
    if (store === undefined) {
      store = {
        order: [],
        seqById: new Map(),
        nextSeq: 0,
        byId: new Map(),
        sourceOfId: new Map(),
      };
      otherByKind.set(kind, store);
    }
    return store;
  };

  const addToStation = (station: string, id: string): void => {
    let set = byStation.get(station);
    if (set === undefined) {
      set = new Set();
      byStation.set(station, set);
      byStationOrder.set(station, []);
    }
    if (set.has(id)) return;
    set.add(id);
    byStationOrder.get(station)!.push(id);
  };

  const removeFromStation = (station: string, id: string): void => {
    const set = byStation.get(station);
    if (set === undefined || !set.delete(id)) return;
    const arr = byStationOrder.get(station)!;
    const index = arr.indexOf(id);
    if (index !== -1) arr.splice(index, 1);
    if (set.size === 0) {
      byStation.delete(station);
      byStationOrder.delete(station);
    }
  };

  const writeMatchIndex = (recipe: Recipe, add: boolean): void => {
    const count = recipeMatchCount(recipe);
    const tokens = recipePostingTokens(recipe);
    const write = add ? addIndex : removeIndex;
    for (const station of recipe.stations) {
      if (add) addToStation(station, recipe.id);
      else removeFromStation(station, recipe.id);
      for (const token of tokens) write(postings, postingKey(station, count, token), recipe.id);
    }
    const delta = add ? 1 : -1;
    for (const tag of recipeTags(tokens)) {
      const next = (tagRef.get(tag) ?? 0) + delta;
      if (next <= 0) tagRef.delete(tag);
      else tagRef.set(tag, next);
    }
  };

  const matchingHits = (query: MatchQuery): Recipe[] => {
    const count = queryMatchCount(query);
    if (count === 0) return [];
    const clauses = queryPostingClauses(query, itemTagIndex, (tag) => tagRef.has(tag));
    if (clauses.length === 0) return [];
    const unions: Set<string>[] = [];
    for (const tokens of clauses) {
      const union = unionPostings(postings, query.station, count, tokens);
      if (union.size === 0) return [];
      unions.push(union);
    }
    const candidates = intersectSets(unions);
    const hits: Recipe[] = [];
    for (const id of candidates) {
      const recipe = byId.get(id);
      if (recipe === undefined) continue;
      if (!recipeMatches(recipe, query, itemTagIndex)) continue;
      hits.push(recipe);
    }
    hits.sort((a, b) => {
      const byPriority = priorityOf(b) - priorityOf(a);
      if (byPriority !== 0) return byPriority;
      return (seqById.get(a.id) ?? 0) - (seqById.get(b.id) ?? 0);
    });
    return hits;
  };

  const detachSource = (id: string, source: string, kind: string = DEFAULT_REGISTRY_KIND): void => {
    const kinds = idsBySource.get(source);
    if (kinds === undefined) return;
    const set = kinds.get(kind);
    if (set === undefined) return;
    set.delete(id);
    if (set.size === 0) kinds.delete(kind);
    if (kinds.size === 0) idsBySource.delete(source);
  };

  const put = (stored: Recipe, source: string | undefined): void => {
    const previous = byId.get(stored.id);
    if (previous !== undefined) {
      indexOutputs(previous, byOutput, byLeftover, byInput, false);
      writeMatchIndex(previous, false);
      const prevSource = sourceOfId.get(stored.id);
      if (prevSource !== undefined && prevSource !== source) detachSource(stored.id, prevSource, DEFAULT_REGISTRY_KIND);
    } else {
      order.push(stored.id);
      seqById.set(stored.id, nextSeq++);
    }
    byId.set(stored.id, stored);
    indexOutputs(stored, byOutput, byLeftover, byInput, true);
    writeMatchIndex(stored, true);
    if (source !== undefined) {
      sourceOfId.set(stored.id, source);
      kindSet(source, DEFAULT_REGISTRY_KIND).add(stored.id);
    } else {
      sourceOfId.delete(stored.id);
    }
  };

  const putOther = (kind: string, stored: CatalogDocument, source: string | undefined): void => {
    const bucket = otherStore(kind);
    const previous = bucket.byId.get(stored.id);
    const prevSource = previous !== undefined ? bucket.sourceOfId.get(stored.id) : undefined;
    if (previous !== undefined) {
      if (kind === "pack") writePackIndexes(previous, false);
      if (kind === "tag") writeTagDomainIndex(previous, false);
      if (kind === "loot") writeLootIndexes(previous, false);
      if (prevSource !== undefined && prevSource !== source) detachSource(stored.id, prevSource, kind);
    } else {
      bucket.order.push(stored.id);
      bucket.seqById.set(stored.id, bucket.nextSeq++);
    }
    bucket.byId.set(stored.id, stored);
    if (source !== undefined) {
      bucket.sourceOfId.set(stored.id, source);
      kindSet(source, kind).add(stored.id);
    } else {
      bucket.sourceOfId.delete(stored.id);
    }
    if (isFluidKind(kind)) indexFluid(kind, stored);
    if (kind === "pack") writePackIndexes(stored, true);
    if (kind === "loot") writeLootIndexes(stored, true);
    if (kind === "tag") {
      const nextOwner = tagOwner(source, stored.id);
      if (previous !== undefined) {
        const prevDomain = stringField(previous, "domain");
        const prevOwner = tagOwner(prevSource, stored.id);
        if (prevDomain !== undefined && prevOwner === nextOwner) {
          setTagDocMembers(prevOwner, prevDomain, stored.id, []);
        }
      }
      writeTagDomainIndex(stored, true);
      const domain = stringField(stored, "domain");
      if (domain !== undefined) setTagDocMembers(nextOwner, domain, stored.id, membersField(stored));
    }
    if (OVERLAY_TAG_KINDS.has(kind)) {
      if (prevSource === undefined && source !== undefined) {
        clearOverlayMember(tagOwner(undefined, stored.id), kind, stored.id);
      }
      setOverlayTags(tagOwner(source, stored.id), kind, stored.id, tagsField(stored));
    }
  };

  const deleteId = (id: string): void => {
    const previous = byId.get(id);
    if (previous === undefined) return;
    indexOutputs(previous, byOutput, byLeftover, byInput, false);
    writeMatchIndex(previous, false);
    byId.delete(id);
    seqById.delete(id);
    sourceOfId.delete(id);
    const index = order.indexOf(id);
    if (index !== -1) order.splice(index, 1);
  };

  const deleteOther = (kind: string, id: string): void => {
    const bucket = otherByKind.get(kind);
    if (bucket === undefined) return;
    const previous = bucket.byId.get(id);
    if (previous === undefined) return;
    const src = bucket.sourceOfId.get(id);
    if (isFluidKind(kind)) unindexFluid(id);
    if (kind === "pack") writePackIndexes(previous, false);
    if (kind === "loot") writeLootIndexes(previous, false);
    if (kind === "tag") {
      writeTagDomainIndex(previous, false);
      const domain = stringField(previous, "domain");
      if (domain !== undefined) setTagDocMembers(tagOwner(src, id), domain, id, []);
    }
    if (OVERLAY_TAG_KINDS.has(kind)) clearOverlayMember(tagOwner(src, id), kind, id);
    bucket.byId.delete(id);
    bucket.seqById.delete(id);
    bucket.sourceOfId.delete(id);
    const index = bucket.order.indexOf(id);
    if (index !== -1) bucket.order.splice(index, 1);
  };

  return {
    register(recipe, source) {
      return this.registerDocument(DEFAULT_REGISTRY_KIND, recipe, source);
    },
    registerDocument(kind, document, source) {
      if (!isRegistryKind(kind)) return false;
      const owner = source !== undefined && isValidSource(source) ? source : undefined;
      if (kind === DEFAULT_REGISTRY_KIND) {
        if (!isRecipe(document)) return false;
        put(compactRecipe(document), owner);
        return true;
      }
      if (!isDocument(document)) return false;
      putOther(kind, cloneDocument(document), owner);
      return true;
    },
    unregister(id) {
      this.unregisterDocument(DEFAULT_REGISTRY_KIND, id);
    },
    unregisterDocument(kind, id) {
      if (kind === DEFAULT_REGISTRY_KIND) {
        const previous = byId.get(id);
        if (previous === undefined) return;
        const src = sourceOfId.get(id);
        if (src !== undefined) detachSource(id, src, kind);
        const vanilla = vanillaById.get(id);
        if (src !== undefined && vanilla !== undefined) {
          put(vanilla, undefined);
          return;
        }
        deleteId(id);
        return;
      }
      const bucket = otherByKind.get(kind);
      if (bucket === undefined) return;
      const src = bucket.sourceOfId.get(id);
      if (src !== undefined) detachSource(id, src, kind);
      const vanilla = vanillaOtherByKind.get(kind)?.get(id);
      if (src !== undefined && vanilla !== undefined) {
        if (OVERLAY_TAG_KINDS.has(kind)) clearOverlayMember(src, kind, id);
        if (kind === "tag") {
          const previous = bucket.byId.get(id);
          const domain = previous !== undefined ? stringField(previous, "domain") : undefined;
          if (domain !== undefined) setTagDocMembers(src, domain, id, []);
        }
        putOther(kind, vanilla, undefined);
        return;
      }
      deleteOther(kind, id);
    },
    snapshotVanilla() {
      vanillaById.clear();
      for (const [id, recipe] of byId) vanillaById.set(id, recipe);
      vanillaOtherByKind.clear();
      for (const [kind, bucket] of otherByKind) {
        const copy = new Map<string, CatalogDocument>();
        for (const [id, doc] of bucket.byId) copy.set(id, cloneDocument(doc));
        vanillaOtherByKind.set(kind, copy);
      }
    },
    dropSource(source) {
      clearOverlayOwner(source);
      clearTagDocOwner(source);
      const kinds = idsBySource.get(source);
      if (kinds === undefined) return;
      for (const [kind, ids] of [...kinds]) {
        for (const id of [...ids]) this.unregisterDocument(kind, id);
      }
    },
    replaceSource(source, documents, kind = DEFAULT_REGISTRY_KIND) {
      const resolved = isRegistryKind(kind) ? kind : DEFAULT_REGISTRY_KIND;
      if (OVERLAY_TAG_KINDS.has(resolved)) clearOverlayOwnerDomain(source, resolved);
      if (resolved === "tag") clearTagDocOwner(source);
      const owned = [...(idsBySource.get(source)?.get(resolved) ?? [])];
      for (const id of owned) this.unregisterDocument(resolved, id);
      const stolen: string[] = [];
      const seen = new Set<string>();
      for (const document of documents) {
        if (resolved === DEFAULT_REGISTRY_KIND) {
          if (!isRecipe(document)) continue;
          const prev = sourceOfId.get(document.id);
          if (prev !== undefined && prev !== source && !seen.has(prev)) {
            seen.add(prev);
            stolen.push(prev);
          }
          this.registerDocument(resolved, document, source);
          continue;
        }
        if (!isDocument(document)) continue;
        const prev = otherByKind.get(resolved)?.sourceOfId.get(document.id);
        if (prev !== undefined && prev !== source && !seen.has(prev)) {
          seen.add(prev);
          stolen.push(prev);
        }
        this.registerDocument(resolved, document, source);
      }
      return stolen;
    },
    recipesForSource(source) {
      return this.documentsForSource(source, DEFAULT_REGISTRY_KIND) as Recipe[];
    },
    overlaySources(kind = DEFAULT_REGISTRY_KIND) {
      const sources: string[] = [];
      for (const [source, kinds] of idsBySource) {
        if ((kinds.get(kind)?.size ?? 0) > 0) sources.push(source);
      }
      return sources;
    },
    documentsForSource(source, kind = DEFAULT_REGISTRY_KIND) {
      const ids = idsBySource.get(source)?.get(kind);
      if (ids === undefined) return [];
      const documents: CatalogDocument[] = [];
      if (kind === DEFAULT_REGISTRY_KIND) {
        for (const id of ids) {
          const recipe = byId.get(id);
          if (recipe !== undefined) documents.push(recipe);
        }
        return documents;
      }
      const bucket = otherByKind.get(kind);
      if (bucket === undefined) return [];
      for (const id of ids) {
        const doc = bucket.byId.get(id);
        if (doc !== undefined) documents.push(doc);
      }
      return documents;
    },
    sourceOf(id) {
      return sourceOfId.get(id);
    },
    sourceOfDocument(kind, id) {
      if (kind === DEFAULT_REGISTRY_KIND) return sourceOfId.get(id);
      return otherByKind.get(kind)?.sourceOfId.get(id);
    },
    get(id) {
      return byId.get(id);
    },
    getDocument(kind, id) {
      if (kind === DEFAULT_REGISTRY_KIND) return byId.get(id);
      return otherByKind.get(kind)?.byId.get(id);
    },
    recipes() {
      return order.map((id) => byId.get(id)!);
    },
    list(filter) {
      const outputSet = filter?.output !== undefined ? byOutput.get(filter.output) : undefined;
      const leftoverSet = filter?.leftover !== undefined ? byLeftover.get(filter.leftover) : undefined;
      const inputSet = filter?.input !== undefined ? byInput.get(filter.input) : undefined;
      if (filter?.output !== undefined && outputSet === undefined) return [];
      if (filter?.leftover !== undefined && leftoverSet === undefined) return [];
      if (filter?.input !== undefined && inputSet === undefined) return [];
      const ids = filter?.station !== undefined ? (byStationOrder.get(filter.station) ?? []) : order;
      const entries: ListEntry[] = [];
      for (const id of ids) {
        if (outputSet !== undefined && !outputSet.has(id)) continue;
        if (leftoverSet !== undefined && !leftoverSet.has(id)) continue;
        if (inputSet !== undefined && !inputSet.has(id)) continue;
        entries.push(toListEntry(byId.get(id)!));
      }
      return entries;
    },
    listDocuments(kind, filter) {
      if (kind === DEFAULT_REGISTRY_KIND) {
        return this.list(filter).map((entry) => byId.get(entry.id)!);
      }
      if (kind === "tag" && filter?.id !== undefined) {
        const domain = filter.domain ?? "item";
        const members = membersByTag.get(domain)?.get(filter.id);
        if (members === undefined) return [];
        return [...members].sort().map((id) => ({ id }));
      }
      const bucket = otherByKind.get(kind);
      if (bucket === undefined) return [];
      if (kind === "pack") {
        const sets: Set<string>[] = [];
        if (filter?.source !== undefined) {
          const set = byPackSource.get(filter.source);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.namespace !== undefined) {
          const set = byPackNamespace.get(filter.namespace);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.creator !== undefined) {
          const set = byPackCreator.get(filter.creator);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.displayName !== undefined) {
          const set = byPackDisplayName.get(filter.displayName);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (sets.length === 0) {
          return bucket.order.map((id) => bucket.byId.get(id)!);
        }
        const allowed = intersectSets(sets);
        const out: CatalogDocument[] = [];
        for (const id of allowed) {
          const doc = bucket.byId.get(id);
          if (doc !== undefined) out.push(doc);
        }
        return out;
      }
      if (kind === "tag" && filter?.domain !== undefined) {
        const ids = byTagDomain.get(filter.domain);
        if (ids === undefined) return [];
        const out: CatalogDocument[] = [];
        for (const id of ids) {
          const doc = bucket.byId.get(id);
          if (doc !== undefined) out.push(doc);
        }
        return out;
      }
      if (kind === "loot") {
        const sets: Set<string>[] = [];
        if (filter?.entity !== undefined) {
          const set = byLootEntity.get(filter.entity);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.block !== undefined) {
          const set = byLootBlock.get(filter.block);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.tool !== undefined) {
          const set = byLootTool.get(filter.tool);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.item !== undefined) {
          const set = byLootItem.get(filter.item);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.fluid !== undefined) {
          const set = byLootFluid.get(filter.fluid);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (filter?.gas !== undefined) {
          const set = byLootGas.get(filter.gas);
          if (set === undefined) return [];
          sets.push(set);
        }
        if (sets.length === 0) {
          return bucket.order.map((id) => bucket.byId.get(id)!);
        }
        const allowed = intersectSets(sets);
        const out: CatalogDocument[] = [];
        for (const id of allowed) {
          const doc = bucket.byId.get(id);
          if (doc !== undefined) out.push(doc);
        }
        return out;
      }
      return bucket.order.map((id) => bucket.byId.get(id)!);
    },
    matchIds(query) {
      return matchingHits(query).map((recipe) => recipe.id);
    },
    matchResults(query) {
      return groupRecipeYields(matchingHits(query));
    },
    fluidVesselOf(identity) {
      if (identity.potion) {
        const row = byPotion.get(potionKey(identity.potion.effectType, identity.potion.deliveryType));
        if (row && bareId(row.filledTypeId) === bareId(identity.typeId)) return row;
        return undefined;
      }
      return byFilled.get(identity.typeId) ?? byFilled.get(bareId(identity.typeId));
    },
    fluidsForEmpty(kind, emptyTypeId) {
      return byEmptyKind.get(`${kind}:${bareId(emptyTypeId)}`) ?? [];
    },
    vesselForEmpty(kind, emptyTypeId, fluidId) {
      return byEmptyFluid.get(`${kind}:${bareId(emptyTypeId)}:${bareId(fluidId)}`);
    },
    size() {
      let n = byId.size;
      for (const bucket of otherByKind.values()) n += bucket.byId.size;
      return n;
    },
  };
}
