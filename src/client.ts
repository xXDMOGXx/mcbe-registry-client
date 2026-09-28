import { CHANNEL, JSON_EVENT, PROTOCOL_SCHEMA } from "./channels.js";
import { createCatalog, type Catalog } from "./catalog.js";
import { noteClientSchemaOutdated, noteHostSchemaOutdated } from "./compatibility.js";
import type { DiscoveryTransport, PeerIpc, TickClock } from "./ipcTypes.js";
import { DEFAULT_REGISTRY_KIND } from "./kinds.js";
import {
  GetAsk,
  GetReply,
  Hello,
  ListFilter as ListFilterProto,
  ListReply,
  MatchQuery as MatchQueryProto,
  MatchReply,
  OkReply as OkReplyProto,
  RegisterAsk as RegisterAskProto,
  ResultReply,
  UnregisterAsk,
  SubscribeAsk as SubscribeAskProto,
  KindUpdated as KindUpdatedProto,
} from "./proto.js";
import { canonicalizeDocuments, canonicalizeRecipes } from "./recipeFingerprint.js";
import {
  decodeListEntry,
  decodeMatchQuery,
  decodeMatchResult,
  decodeRecipe,
  encodeListEntry,
  encodeMatchQuery,
  encodeMatchResult,
  encodeRecipe,
} from "./recipeWire.js";
import type {
  CatalogList,
  KindUpdated,
  ListFilter,
  MatchQuery,
  MatchResult,
  OkReply,
  Recipe,
  RegistryDocument,
  SubscribeAsk,
  TrackAsk,
} from "./types.js";

/** Default client wait for data IPC reply, in ticks. */
export const DEFAULT_TIMEOUT_TICKS = 5;

/** Default {@link RecipeRegistryClient.waitReady} discovery window, in ticks (~5s at 20 TPS). */
export const DEFAULT_DISCOVERY_TIMEOUT_TICKS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDocument(raw: string): RegistryDocument | undefined {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || typeof parsed.id !== "string") return undefined;
    return parsed as RegistryDocument;
  } catch {
    return undefined;
  }
}

/** Numeric `schema`, else `v`, on JSON ready / IPC hello. */
export function advertisedSchema(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.schema === "number" && Number.isFinite(value.schema)) return value.schema;
  if (typeof value.v === "number" && Number.isFinite(value.v)) return value.v;
  return undefined;
}

function withTimeout<T>(clock: TickClock, ticks: number, promise: Promise<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    const cancel = clock.runTimeout(() => resolve(undefined), ticks);
    void promise.then(
      (value) => {
        cancel();
        resolve(value);
      },
      () => {
        cancel();
        resolve(undefined);
      },
    );
  });
}

/** Schema-4 Bedrock Registry client (typed IPC data + JSON discovery). */
export interface RecipeRegistryClient {
  waitReady(): Promise<boolean>;
  catalogMinecraft(): string | undefined;
  addRecipe(recipe: Recipe): void;
  /** Queues a document for {@link RecipeRegistryClient.register} of that `kind`. */
  add(kind: string, document: RegistryDocument): void;
  clearRecipes(): void;
  register(opts?: { source?: string; kind?: string }): Promise<OkReply | undefined>;
  unregister(ids: string[]): Promise<void>;
  match(query: MatchQuery): Promise<string[] | undefined>;
  result(query: MatchQuery): Promise<MatchResult[] | undefined>;
  get(kindOrId: string, id?: string): Promise<Recipe | RegistryDocument | undefined>;
  list(kindOrFilter?: string | ListFilter, filter?: ListFilter): Promise<CatalogList>;
  subscribe(opts: SubscribeAsk, onUpdate: (event: KindUpdated) => void): Promise<boolean | undefined>;
  /**
   * Seeds a RAM catalog, `subscribe`s, overlay-`list`s, and keeps it in sync.
   * No replica exists until this is called.
   */
  track(opts: TrackAsk): Promise<boolean | undefined>;
  /** Tracked RAM catalog, or `undefined` when `track` has not run. */
  catalog(): Catalog | undefined;
  dispose(): void;
}

/** Options for {@link createClient}. */
export interface CreateClientOptions {
  ipc: PeerIpc;
  discovery: DiscoveryTransport;
  clock: TickClock;
  timeoutTicks?: number;
  /** `waitReady` window; defaults to {@link DEFAULT_DISCOVERY_TIMEOUT_TICKS}. */
  discoveryTimeoutTicks?: number;
  /** Schema-mismatch lines; defaults to `console.warn`. */
  warn?: (message: string) => void;
  /** Called once per `register({ source })`: fingerprint ping match vs full-list miss. */
  onFingerprint?: (result: "match" | "miss") => void;
}

/** Client bound to injected IPC + JSON discovery; times out to unavailable. */
export function createClient(options: CreateClientOptions): RecipeRegistryClient {
  const timeoutTicks = options.timeoutTicks ?? DEFAULT_TIMEOUT_TICKS;
  const discoveryTimeoutTicks = options.discoveryTimeoutTicks ?? DEFAULT_DISCOVERY_TIMEOUT_TICKS;
  const warn = options.warn;
  const pendingByKind = new Map<string, RegistryDocument[]>();
  const unsubs: (() => void)[] = [];

  function pendingOf(kind: string): RegistryDocument[] {
    let list = pendingByKind.get(kind);
    if (list === undefined) {
      list = [];
      pendingByKind.set(kind, list);
    }
    return list;
  }
  let ready = false;
  let incompatible = false;
  let minecraft: string | undefined;
  let wake: (() => void) | undefined;

  const applyAdvertised = (seen: number | undefined, catalogMinecraft: string | undefined): void => {
    if (seen === undefined) return;
    if (seen === PROTOCOL_SCHEMA) {
      ready = true;
      if (catalogMinecraft !== undefined) minecraft = catalogMinecraft;
      return;
    }
    incompatible = true;
    if (seen < PROTOCOL_SCHEMA) noteHostSchemaOutdated(warn);
    else noteClientSchemaOutdated(warn);
  };

  unsubs.push(
    options.discovery.onEvent((id, message) => {
    if (id !== JSON_EVENT.ready) return;
    let body: unknown;
    try {
      body = JSON.parse(message) as unknown;
    } catch {
      return;
    }
    applyAdvertised(advertisedSchema(body), isRecord(body) && typeof body.minecraft === "string" ? body.minecraft : undefined);
    wake?.();
    }),
  );

  async function invokeRegister(payload: {
    source?: string;
    kind: string;
    fp?: string;
    recipes: Recipe[];
    documents?: string[];
  }): Promise<OkReply | undefined> {
    return await withTimeout(
      options.clock,
      timeoutTicks,
      options.ipc.invoke(
        CHANNEL.register,
        RegisterAskProto,
        {
          source: payload.source,
          kind: payload.kind === DEFAULT_REGISTRY_KIND ? undefined : payload.kind,
          fp: payload.fp,
          recipes: payload.recipes.map(encodeRecipe),
          documents: payload.documents,
        },
        OkReplyProto,
      ),
    );
  }

  let replica: Catalog | undefined;
  const trackedKinds = new Set<string>();
  let ownSource: string | undefined;
  const overlayByKind = new Map<string, ListFilter>();

  function overlayFilterFor(kind: string): ListFilter {
    return overlayByKind.get(kind) ?? { vanilla: false };
  }

  function applyListed(kind: string, listed: CatalogList): void {
    if (replica === undefined) return;
    const bySource = new Map<string, RegistryDocument[]>();
    listed.documents.forEach((document, i) => {
      const source = listed.sources[i];
      if (source === undefined) return;
      const rows = bySource.get(source) ?? [];
      rows.push(document);
      bySource.set(source, rows);
    });
    for (const [source, documents] of bySource) {
      replica.replaceSource(source, documents, kind);
    }
  }

  function rememberOverlay(kind: string, opts: TrackAsk): void {
    const merged: ListFilter = {
      ...(opts.filter ?? {}),
      ...(opts.filters?.[kind] ?? {}),
      vanilla: opts.filters?.[kind]?.vanilla ?? opts.filter?.vanilla ?? false,
    };
    overlayByKind.set(kind, merged);
  }

  const client: RecipeRegistryClient = {
    async waitReady() {
      if (ready) return true;
      if (incompatible) return false;
      options.discovery.send(JSON_EVENT.hello, JSON.stringify({ v: PROTOCOL_SCHEMA, schema: PROTOCOL_SCHEMA }));
      if (ready) return true;
      if (incompatible) return false;
      const ipcHello = withTimeout(
        options.clock,
        discoveryTimeoutTicks,
        options.ipc.invoke(CHANNEL.hello, Hello, { schema: PROTOCOL_SCHEMA, minecraft: undefined }, Hello),
      );
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (value: boolean) => {
          if (settled) return;
          settled = true;
          wake = undefined;
          cancelTimeout();
          resolve(value);
        };
        const cancelTimeout = options.clock.runTimeout(() => finish(ready), discoveryTimeoutTicks);
        wake = () => {
          if (ready) finish(true);
          else if (incompatible) finish(false);
        };
        void ipcHello.then((hello) => {
          if (hello !== undefined) applyAdvertised(hello.schema, hello.minecraft);
          wake?.();
        });
        wake();
      });
    },
    catalogMinecraft() {
      return minecraft;
    },
    addRecipe(recipe) {
      pendingOf(DEFAULT_REGISTRY_KIND).push(recipe);
      if (replica !== undefined && trackedKinds.has(DEFAULT_REGISTRY_KIND)) {
        replica.register(recipe, ownSource);
      }
    },
    add(kind, document) {
      pendingOf(kind).push(document);
      if (replica !== undefined && trackedKinds.has(kind)) {
        replica.registerDocument(kind, document, ownSource);
      }
    },
    clearRecipes() {
      pendingByKind.delete(DEFAULT_REGISTRY_KIND);
    },
    async register(opts) {
      const source = opts?.source;
      const kind = opts?.kind ?? DEFAULT_REGISTRY_KIND;
      const queued = pendingOf(kind);
      const recipes = kind === DEFAULT_REGISTRY_KIND ? (queued as Recipe[]) : [];
      const documents =
        kind === DEFAULT_REGISTRY_KIND ? undefined : queued.map((doc) => JSON.stringify(doc));
      const fp =
        kind === DEFAULT_REGISTRY_KIND
          ? canonicalizeRecipes(recipes)
          : canonicalizeDocuments(queued);
      if (source !== undefined) {
        const ping = await invokeRegister({ source, kind, fp, recipes: [], documents: undefined });
        if (ping?.ok) {
          options.onFingerprint?.("match");
          return ping;
        }
        options.onFingerprint?.("miss");
      }
      return await invokeRegister({ source, kind, fp, recipes, documents });
    },
    async unregister(ids) {
      await withTimeout(
        options.clock,
        timeoutTicks,
        options.ipc.invoke(CHANNEL.unregister, UnregisterAsk, { ids }, OkReplyProto),
      );
    },
    async match(query) {
      const reply = await withTimeout(
        options.clock,
        timeoutTicks,
        options.ipc.invoke(CHANNEL.match, MatchQueryProto, encodeMatchQuery(query), MatchReply),
      );
      if (reply === undefined) return undefined;
      return reply.ids ?? [];
    },
    async result(query) {
      const reply = await withTimeout(
        options.clock,
        timeoutTicks,
        options.ipc.invoke(CHANNEL.result, MatchQueryProto, encodeMatchQuery(query), ResultReply),
      );
      if (reply === undefined) return undefined;
      return (reply.results ?? []).map(decodeMatchResult);
    },
    async get(kindOrId: string, id?: string) {
      const kind = id === undefined ? DEFAULT_REGISTRY_KIND : kindOrId;
      const docId = id === undefined ? kindOrId : id;
      const reply = await withTimeout(
        options.clock,
        timeoutTicks,
        options.ipc.invoke(
          CHANNEL.get,
          GetAsk,
          { kind: kind === DEFAULT_REGISTRY_KIND ? undefined : kind, id: docId },
          GetReply,
        ),
      );
      if (reply === undefined) return undefined;
      if (kind === DEFAULT_REGISTRY_KIND) {
        return reply.recipe !== undefined ? decodeRecipe(reply.recipe) : undefined;
      }
      if (reply.document === undefined) return undefined;
      try {
        const parsed = JSON.parse(reply.document) as unknown;
        if (!isRecord(parsed) || typeof parsed.id !== "string") return undefined;
        return parsed as RegistryDocument;
      } catch {
        return undefined;
      }
    },
    async list(kindOrFilter?: string | ListFilter, filter?: ListFilter): Promise<CatalogList> {
      const empty: CatalogList = { entries: [], documents: [], sources: [] };
      const kind =
        typeof kindOrFilter === "string" ? kindOrFilter : (kindOrFilter?.kind ?? DEFAULT_REGISTRY_KIND);
      const f = typeof kindOrFilter === "string" ? filter : kindOrFilter;
      const reply = await withTimeout(
        options.clock,
        timeoutTicks,
        options.ipc.invoke(
          CHANNEL.list,
          ListFilterProto,
          {
            kind: kind === DEFAULT_REGISTRY_KIND ? undefined : kind,
            station: f?.station,
            output: f?.output,
            leftover: f?.leftover,
            input: f?.input,
            source: f?.source,
            vanilla: f?.vanilla,
            namespace: f?.namespace,
            creator: f?.creator,
            displayName: f?.displayName,
            domain: f?.domain,
            id: f?.id,
            entity: f?.entity,
            block: f?.block,
            tool: f?.tool,
            item: f?.item,
            fluid: f?.fluid,
            gas: f?.gas,
          },
          ListReply,
        ),
      );
      if (reply === undefined) return empty;
      const documents: RegistryDocument[] = [];
      for (const raw of reply.documents ?? []) {
        const doc = parseDocument(raw);
        if (doc !== undefined) documents.push(doc);
      }
      const sources = [...(reply.sources ?? [])];
      return {
        entries: reply.entries.map(decodeListEntry),
        documents,
        sources,
      };
    },
    async subscribe(opts, onUpdate) {
      const kinds = new Set(opts.kinds);
      const ignoreSource = opts.source;
      unsubs.push(
        options.ipc.on(CHANNEL.updated, KindUpdatedProto, (wire) => {
          if (!kinds.has(wire.kind)) return;
          if (ignoreSource !== undefined && wire.source === ignoreSource) return;
          const event: KindUpdated = { kind: wire.kind };
          if (wire.source !== undefined) event.source = wire.source;
          if (wire.dropped === true) event.dropped = true;
          onUpdate(event);
        }),
      );
      const reply = await withTimeout(
        options.clock,
        timeoutTicks,
        options.ipc.invoke(
          CHANNEL.subscribe,
          SubscribeAskProto,
          { kinds: opts.kinds, source: opts.source },
          OkReplyProto,
        ),
      );
      if (reply === undefined) return undefined;
      return reply.ok;
    },
    async track(opts) {
      if (replica === undefined) replica = createCatalog({ tags: opts.tags });
      if (opts.source !== undefined) ownSource = opts.source;
      for (const kind of opts.kinds) {
        trackedKinds.add(kind);
        rememberOverlay(kind, opts);
      }
      for (const seed of opts.seed ?? []) {
        trackedKinds.add(seed.kind);
        for (const document of seed.documents) {
          replica.registerDocument(seed.kind, document);
        }
      }
      const subscribed = await client.subscribe({ kinds: opts.kinds, source: opts.source }, (event) => {
        void (async () => {
          const source = event.source;
          if (source === undefined || replica === undefined) return;
          if (event.dropped === true) {
            replica.replaceSource(source, [], event.kind);
            return;
          }
          const filter = overlayFilterFor(event.kind);
          const listed = await client.list({
            kind: event.kind === DEFAULT_REGISTRY_KIND ? undefined : event.kind,
            source,
            station: filter.station,
            output: filter.output,
            leftover: filter.leftover,
            input: filter.input,
            vanilla: false,
          });
          replica.replaceSource(source, listed.documents, event.kind);
        })();
      });
      if (subscribed !== true) return subscribed;
      for (const kind of opts.kinds) {
        const filter = overlayFilterFor(kind);
        const listed = await client.list({
          kind: kind === DEFAULT_REGISTRY_KIND ? undefined : kind,
          station: filter.station,
          output: filter.output,
          leftover: filter.leftover,
          input: filter.input,
          source: filter.source,
          vanilla: filter.vanilla ?? false,
        });
        applyListed(kind, listed);
      }
      return true;
    },
    catalog() {
      return replica;
    },
    dispose() {
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      replica = undefined;
      trackedKinds.clear();
      overlayByKind.clear();
      ownSource = undefined;
    },
  };
  return client;
}

/** Re-export wire helpers used by the host when encoding list/result rows. */
export { encodeListEntry, encodeMatchResult, encodeRecipe, decodeMatchQuery, decodeRecipe };
