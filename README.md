# @mcbe-registry/client

Client for the **Bedrock Registry** host pack (Minecraft Bedrock Script API).

The host is a shared catalog: items, blocks, recipes, fluids, tags, loot, and the rest. It does not craft or open screens. You register your pack’s documents and query the catalog.

**Documentation:** [GitHub wiki](https://github.com/xXDMOGXx/mcbe-registry-client/wiki).

```bash
npm install @mcbe-registry/client mcbe-ipc
```

`mcbe-ipc` ([OmniacDev/MCBE-IPC](https://github.com/OmniacDev/MCBE-IPC)) is how packs send messages to each other. Enable **Bedrock Registry** on the world when you query the catalog. List it as a UUID dependency only if your addon cannot function without that catalog. Details: [Installation](https://github.com/xXDMOGXx/mcbe-registry-client/wiki/Installation).

```ts
import { createBedrockClient } from "@mcbe-registry/client/bedrock";
import { BOTTLE, BUCKET } from "@mcbe-registry/client";

const registry = createBedrockClient();
if (await registry.waitReady()) {
  registry.add("item", { id: "mymod:widget", tags: ["mymod:parts"] });
  await registry.register({ source: "mymod", kind: "item" });

  registry.add("fluid", {
    id: "mymod:latex",
    kind: "liquid",
    vessels: [
      { filled: "mymod:latex_bottle", empty: "minecraft:glass_bottle", amount: BOTTLE },
      { filled: "mymod:latex_bucket", empty: "minecraft:bucket", amount: BUCKET },
    ],
  });
  await registry.register({ source: "mymod", kind: "fluid" });

  await registry.get("item", "mymod:widget");
  await registry.list("loot", { block: "minecraft:diamond_ore" });
}
```

A single-file build (`bedrock-registry-client.js`) is on [this client’s GitHub Releases](https://github.com/xXDMOGXx/mcbe-registry-client/releases), plus a fill-in register template (`bedrock-registry-register.js`). Place the `mcbe-ipc` pack build beside the client as `mcbe-ipc.js`.