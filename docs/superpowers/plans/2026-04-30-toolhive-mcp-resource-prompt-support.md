# Toolhive MCP Resource and Prompt Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manifest-driven `resources` and `prompts` support to the existing Toolhive MCP server, verify it locally, deploy it to the Worker, and live-test the exposed MCP methods on the real endpoint.

**Architecture:** Keep the current tool architecture intact and extend it in parallel. `src/mcp/protocol.ts` and `src/mcp/router.ts` will advertise and dispatch `resources` and `prompts`, while new manifest/catalog/registry files define and project the capability surface exactly like the existing tool system. The first release stays text-first and Claude-client-oriented: four built-in resources, three user-facing prompts, generated README summaries, and regression coverage proving discovery, lookup, validation, and docs stay aligned.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers, Wrangler, JSON-RPC, Vite SSR module loading

---

## File Structure

### Existing files to modify

- `src/mcp/protocol.ts` — add `resources` and `prompts` to the initialize capability payload
- `src/mcp/router.ts` — dispatch `resources/list`, `resources/read`, `prompts/list`, and `prompts/get`
- `src/mcp/schema.ts` — add schema/types shared by resource and prompt projections
- `src/mcp/validate.ts` — reuse or lightly generalize local schema validation for prompt arguments
- `scripts/render-readme.ts` — load resource/prompt manifests and generate summary blocks for both README files
- `README.md` — accept generated resource/prompt summary changes
- `README.zh-CN.md` — accept generated resource/prompt summary changes

### New files to create

- `src/mcp/resource-manifest.ts` — source-of-truth resource entries and runtime/static handlers
- `src/mcp/resource-catalog.ts` — project resource manifest entries into MCP definitions and handler maps
- `src/mcp/resource-registry.ts` — expose enabled resources and URI lookup
- `src/mcp/prompt-manifest.ts` — source-of-truth prompt entries and render handlers
- `src/mcp/prompt-catalog.ts` — project prompt manifest entries into MCP definitions and handler maps
- `src/mcp/prompt-registry.ts` — expose enabled prompts and name lookup
- `tests/mcp/resource-prompt-registry.test.ts` — manifest projection, lookup, README summary, and runtime-resource tests
- `tests/mcp/router-resource-prompt.test.ts` — initialize, list, read, get, and validation regression tests

### Files intentionally left alone

- `src/tools/**` — no tool handler changes are required for this feature
- `src/lib/mcp-auth.ts` — auth behavior remains as-is; resources/prompts inherit current request context only
- `src/worker.ts` — keep `/mcp`, `/healthz`, `/readyz`, and `/version` endpoint layout unchanged
- `src/mcp/tool-manifest.ts`, `src/mcp/tool-catalog.ts`, `src/mcp/tool-registry.ts` — no behavior changes beyond reuse from runtime resources

### Responsibility boundaries

- `resource-manifest.ts` owns built-in resource content and runtime snapshots
- `resource-catalog.ts` owns MCP resource definition projection and handler maps
- `resource-registry.ts` owns URI lookup and enabled-resource exposure
- `prompt-manifest.ts` owns built-in prompt templates and argument schemas
- `prompt-catalog.ts` owns MCP prompt definition projection and handler maps
- `prompt-registry.ts` owns prompt name lookup and enabled-prompt exposure
- `router-resource-prompt.test.ts` owns JSON-RPC behavior for new methods
- `resource-prompt-registry.test.ts` owns manifest-to-definition projection, runtime snapshots, and README generation expectations

---

### Task 1: Add failing tests for protocol discovery and resource/prompt registries

**Files:**
- Create: `tests/mcp/resource-prompt-registry.test.ts`
- Create: `tests/mcp/router-resource-prompt.test.ts`
- Reference: `tests/mcp/tool-registry.test.ts`
- Reference: `src/mcp/router.ts`
- Reference: `src/mcp/protocol.ts`

- [ ] **Step 1: Write the failing registry tests**

```ts
// tests/mcp/resource-prompt-registry.test.ts
// @ts-expect-error Vitest loads raw markdown via Vite in tests.
import readme from "../../README.md?raw";
// @ts-expect-error Vitest loads raw markdown via Vite in tests.
import readmeZhCn from "../../README.zh-CN.md?raw";
import { describe, expect, it } from "vitest";
import { buildResourceDefinitions, buildResourceHandlerMap } from "../../src/mcp/resource-catalog";
import { getEnabledResources, findEnabledResource } from "../../src/mcp/resource-registry";
import { buildPromptDefinitions, buildPromptHandlerMap } from "../../src/mcp/prompt-catalog";
import { getEnabledPrompts, findEnabledPrompt } from "../../src/mcp/prompt-registry";
import type { ResourceManifestEntry } from "../../src/mcp/resource-manifest";
import type { PromptManifestEntry } from "../../src/mcp/prompt-manifest";

const resourceManifest: ResourceManifestEntry[] = [
  {
    uri: "resource://toolhive/overview",
    name: "overview",
    description: "Service overview.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () => ({
      contents: [
        {
          uri: "resource://toolhive/overview",
          mimeType: "text/markdown",
          text: "# Toolhive MCP"
        }
      ]
    })
  }
];

const promptManifest: PromptManifestEntry[] = [
  {
    name: "choose_tool_for_task",
    description: "Choose the best Toolhive MCP tool for a task.",
    arguments: {
      type: "object",
      properties: {
        task: { type: "string", minLength: 1 }
      },
      required: ["task"],
      additionalProperties: false
    },
    handler: async ({ task }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Pick the best Toolhive MCP tool for: ${task}`
          }
        }
      ]
    })
  }
];

describe("resource and prompt manifest infrastructure", () => {
  it("projects resource manifest entries into MCP resource definitions", () => {
    expect(buildResourceDefinitions(resourceManifest)).toEqual([
      {
        uri: "resource://toolhive/overview",
        name: "overview",
        description: "Service overview.",
        mimeType: "text/markdown"
      }
    ]);
  });

  it("builds resource handler maps from manifest entries", async () => {
    const handler = buildResourceHandlerMap(resourceManifest).get("resource://toolhive/overview");

    await expect(
      handler?.({ env: {}, request: new Request("https://example.com/mcp", { method: "POST" }) })
    ).resolves.toEqual({
      contents: [
        {
          uri: "resource://toolhive/overview",
          mimeType: "text/markdown",
          text: "# Toolhive MCP"
        }
      ]
    });
  });

  it("exposes manifest-backed built-in resources and resolves them by URI", () => {
    const resources = getEnabledResources({});
    const uris = resources.map((resource) => resource.uri);

    expect(uris).toContain("resource://toolhive/overview");
    expect(uris).toContain("resource://toolhive/auth");
    expect(uris).toContain("resource://toolhive/catalog");
    expect(uris).toContain("resource://toolhive/runtime/enabled");
    expect(findEnabledResource("resource://toolhive/runtime/enabled", {} )?.name).toBe("runtime-enabled");
  });

  it("projects prompt manifest entries into MCP prompt definitions", () => {
    expect(buildPromptDefinitions(promptManifest)).toEqual([
      {
        name: "choose_tool_for_task",
        description: "Choose the best Toolhive MCP tool for a task.",
        arguments: [
          {
            name: "task",
            required: true,
            description: undefined
          }
        ]
      }
    ]);
  });

  it("builds prompt handler maps from manifest entries", async () => {
    const handler = buildPromptHandlerMap(promptManifest).get("choose_tool_for_task");

    await expect(handler?.({ task: "Look up docs" }, { env: {}, request: new Request("https://example.com/mcp", { method: "POST" }) })).resolves.toEqual({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Pick the best Toolhive MCP tool for: Look up docs"
          }
        }
      ]
    });
  });

  it("exposes manifest-backed built-in prompts and resolves them by name", () => {
    const prompts = getEnabledPrompts({});
    const names = prompts.map((prompt) => prompt.name);

    expect(names).toContain("choose_tool_for_task");
    expect(names).toContain("research_with_sources");
    expect(names).toContain("developer_utility_workflow");
    expect(findEnabledPrompt("research_with_sources", {} )?.name).toBe("research_with_sources");
  });

  it("documents resources and prompts in generated README content", () => {
    expect(readme).toContain("Built-in resources");
    expect(readme).toContain("resource://toolhive/overview");
    expect(readme).toContain("resource://toolhive/runtime/enabled");
    expect(readme).toContain("Built-in prompts");
    expect(readme).toContain("choose_tool_for_task");
    expect(readme).toContain("research_with_sources");

    expect(readmeZhCn).toContain("内置 Resources");
    expect(readmeZhCn).toContain("resource://toolhive/overview");
    expect(readmeZhCn).toContain("内置 Prompts");
    expect(readmeZhCn).toContain("developer_utility_workflow");
  });
});
```

- [ ] **Step 2: Write the failing router tests**

```ts
// tests/mcp/router-resource-prompt.test.ts
import { describe, expect, it } from "vitest";
import { handleJsonRpc } from "../../src/mcp/router";

const request = new Request("https://example.com/mcp", {
  method: "POST",
  headers: { "content-type": "application/json" }
});

async function getBody(response: Response) {
  return response.json() as Promise<any>;
}

describe("resource and prompt JSON-RPC methods", () => {
  it("initialize advertises resources and prompts", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, {}, request);
    const body = await getBody(response);

    expect(body.result.capabilities).toMatchObject({
      tools: {},
      resources: {},
      prompts: {}
    });
  });

  it("lists manifest-backed resources", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "resources/list" }, {}, request);
    const body = await getBody(response);

    expect(body.result.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uri: "resource://toolhive/overview" }),
        expect.objectContaining({ uri: "resource://toolhive/runtime/enabled" })
      ])
    );
  });

  it("reads a known resource", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/read",
        params: { uri: "resource://toolhive/overview" }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.result.contents).toEqual([
      expect.objectContaining({
        uri: "resource://toolhive/overview",
        mimeType: "text/markdown"
      })
    ]);
  });

  it("rejects an unknown resource", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "resources/read",
        params: { uri: "resource://toolhive/missing" }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.error).toEqual({
      code: -32602,
      message: "Unknown resource: resource://toolhive/missing"
    });
  });

  it("lists manifest-backed prompts", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 1, method: "prompts/list" }, {}, request);
    const body = await getBody(response);

    expect(body.result.prompts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "choose_tool_for_task" }),
        expect.objectContaining({ name: "research_with_sources" })
      ])
    );
  });

  it("gets a prompt with validated arguments", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/get",
        params: {
          name: "choose_tool_for_task",
          arguments: { task: "Find the latest React docs" }
        }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.result.messages).toEqual([
      {
        role: "user",
        content: {
          type: "text",
          text: expect.stringContaining("Find the latest React docs")
        }
      }
    ]);
  });

  it("rejects prompt calls with invalid arguments", async () => {
    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "prompts/get",
        params: {
          name: "choose_tool_for_task",
          arguments: {}
        }
      },
      {},
      request
    );
    const body = await getBody(response);

    expect(body.error).toEqual({
      code: -32602,
      message: "Invalid params"
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run:

```bash
npm test -- tests/mcp/resource-prompt-registry.test.ts
npm test -- tests/mcp/router-resource-prompt.test.ts
```

Expected: FAIL with module-not-found or missing-method failures because the new manifest/catalog/registry files and router cases do not exist yet.

- [ ] **Step 4: Commit the failing-test checkpoint**

```bash
git add tests/mcp/resource-prompt-registry.test.ts tests/mcp/router-resource-prompt.test.ts
git commit -m "test: add failing coverage for MCP resources and prompts"
```

---

### Task 2: Implement resource and prompt manifest/catalog/registry layers

**Files:**
- Create: `src/mcp/resource-manifest.ts`
- Create: `src/mcp/resource-catalog.ts`
- Create: `src/mcp/resource-registry.ts`
- Create: `src/mcp/prompt-manifest.ts`
- Create: `src/mcp/prompt-catalog.ts`
- Create: `src/mcp/prompt-registry.ts`
- Modify: `src/mcp/schema.ts`
- Modify: `src/mcp/validate.ts`
- Test: `tests/mcp/resource-prompt-registry.test.ts`

- [ ] **Step 1: Add the shared schema types**

```ts
// src/mcp/schema.ts
export type ResourceDefinition = {
  uri: string;
  name: string;
  title?: string;
  description: string;
  mimeType: string;
};

export type ResourceContents = {
  uri: string;
  mimeType: string;
  text: string;
};

export type PromptArgumentDefinition = {
  name: string;
  title?: string;
  description?: string;
  required?: boolean;
};

export type PromptDefinition = {
  name: string;
  title?: string;
  description: string;
  arguments?: PromptArgumentDefinition[];
};
```

- [ ] **Step 2: Create the resource manifest with the four built-in resources**

```ts
// src/mcp/resource-manifest.ts
import type { AppEnv } from "../lib/env";
import { getEnabledTools } from "./tool-registry";
import type { ResourceContents, ResourceDefinition } from "./schema";
import { getEnabledPrompts } from "./prompt-registry";

export type ResourceReadResult = {
  contents: ResourceContents[];
};

export type ResourceHandlerContext = {
  env: AppEnv;
  request: Request;
};

export type ResourceHandler = (context: ResourceHandlerContext) => Promise<ResourceReadResult>;

export type ResourceManifestEntry = ResourceDefinition & {
  kind: "static" | "runtime";
  requiresAuth?: boolean;
  handler: ResourceHandler;
};

function markdownResource(uri: string, text: string): ResourceReadResult {
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text
      }
    ]
  };
}

export const resourceManifestEntries: ResourceManifestEntry[] = [
  {
    uri: "resource://toolhive/overview",
    name: "overview",
    description: "Service overview for Toolhive MCP.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () =>
      markdownResource(
        "resource://toolhive/overview",
        [
          "# Toolhive MCP",
          "",
          "Toolhive MCP is a remote HTTP MCP server running on Cloudflare Workers.",
          "It exposes tools, resources, and prompts from a single `/mcp` endpoint for Claude-compatible clients."
        ].join("\n")
      )
  },
  {
    uri: "resource://toolhive/auth",
    name: "auth",
    description: "Authentication methods supported by Toolhive MCP.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () =>
      markdownResource(
        "resource://toolhive/auth",
        [
          "# Toolhive MCP Authentication",
          "",
          "Supported auth methods:",
          "- Bearer",
          "- x-api-key / API key",
          "- query `key`",
          "",
          "Protected MCP methods currently follow the existing server auth behavior."
        ].join("\n")
      )
  },
  {
    uri: "resource://toolhive/catalog",
    name: "catalog",
    description: "Static capability directory for Toolhive MCP.",
    mimeType: "text/markdown",
    kind: "static",
    handler: async () =>
      markdownResource(
        "resource://toolhive/catalog",
        [
          "# Toolhive MCP Capability Catalog",
          "",
          "This server exposes:",
          "- tools for web fetch, search, developer utilities, time, weather, and paper lookups",
          "- resources for service docs and runtime snapshots",
          "- prompts for end-user task setup"
        ].join("\n")
      )
  },
  {
    uri: "resource://toolhive/runtime/enabled",
    name: "runtime-enabled",
    description: "Runtime snapshot of enabled tools, resources, and prompts.",
    mimeType: "application/json",
    kind: "runtime",
    handler: async ({ env }) => ({
      contents: [
        {
          uri: "resource://toolhive/runtime/enabled",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              tools: getEnabledTools(env).map((tool) => tool.name),
              resources: resourceManifestEntries.map((resource) => resource.uri),
              prompts: getEnabledPrompts(env).map((prompt) => prompt.name)
            },
            null,
            2
          )
        }
      ]
    })
  }
];
```

- [ ] **Step 3: Create the resource catalog and registry**

```ts
// src/mcp/resource-catalog.ts
import type { ResourceDefinition } from "./schema";
import type { ResourceHandler, ResourceManifestEntry } from "./resource-manifest";

export function buildResourceDefinitions(entries: ResourceManifestEntry[]): ResourceDefinition[] {
  return entries.map(({ uri, name, title, description, mimeType }) => ({
    uri,
    name,
    ...(title ? { title } : {}),
    description,
    mimeType
  }));
}

export function buildResourceHandlerMap(entries: ResourceManifestEntry[]): Map<string, ResourceHandler> {
  return new Map(entries.map((entry) => [entry.uri, entry.handler] as const));
}
```

```ts
// src/mcp/resource-registry.ts
import type { AppEnv } from "../lib/env";
import { buildResourceDefinitions } from "./resource-catalog";
import { resourceManifestEntries } from "./resource-manifest";

export function getEnabledResources(_env: AppEnv) {
  return buildResourceDefinitions(resourceManifestEntries);
}

export function findEnabledResource(uri: string, _env: AppEnv) {
  return resourceManifestEntries.find((resource) => resource.uri === uri);
}
```

- [ ] **Step 4: Create the prompt manifest with the three built-in prompts**

```ts
// src/mcp/prompt-manifest.ts
import type { AppEnv } from "../lib/env";
import type { JsonSchema, PromptDefinition } from "./schema";

export type PromptMessage = {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
};

export type PromptGetResult = {
  messages: PromptMessage[];
};

export type PromptHandlerContext = {
  env: AppEnv;
  request: Request;
};

export type PromptHandler = (args: Record<string, unknown>, context: PromptHandlerContext) => Promise<PromptGetResult>;

export type PromptManifestEntry = PromptDefinition & {
  argumentsSchema: JsonSchema;
  handler: PromptHandler;
};

function userPrompt(text: string): PromptGetResult {
  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text
        }
      }
    ]
  };
}

export const promptManifestEntries: PromptManifestEntry[] = [
  {
    name: "choose_tool_for_task",
    description: "Help choose the best Toolhive MCP tool for a task.",
    arguments: [{ name: "task", required: true, description: "User task description." }],
    argumentsSchema: {
      type: "object",
      properties: {
        task: { type: "string", minLength: 1, description: "User task description." }
      },
      required: ["task"],
      additionalProperties: false
    },
    handler: async ({ task }) =>
      userPrompt([
        "Choose the best Toolhive MCP tool for the following task.",
        "Explain which tool should be called first and why.",
        `Task: ${task}`
      ].join("\n"))
  },
  {
    name: "research_with_sources",
    description: "Set up source-backed research using Toolhive MCP capabilities.",
    arguments: [{ name: "topic", required: true, description: "Research topic." }],
    argumentsSchema: {
      type: "object",
      properties: {
        topic: { type: "string", minLength: 1, description: "Research topic." }
      },
      required: ["topic"],
      additionalProperties: false
    },
    handler: async ({ topic }) =>
      userPrompt([
        "Research the topic below using Toolhive MCP tools.",
        "Prefer source-backed findings and cite the URLs or provider outputs you used.",
        `Topic: ${topic}`
      ].join("\n"))
  },
  {
    name: "developer_utility_workflow",
    description: "Set up a small developer-utility task with Toolhive MCP.",
    arguments: [{ name: "job", required: true, description: "Utility job to perform." }],
    argumentsSchema: {
      type: "object",
      properties: {
        job: { type: "string", minLength: 1, description: "Utility job to perform." }
      },
      required: ["job"],
      additionalProperties: false
    },
    handler: async ({ job }) =>
      userPrompt([
        "Use the Toolhive MCP developer utilities to complete the following job.",
        "Return the result directly and mention which utility was used.",
        `Job: ${job}`
      ].join("\n"))
  }
];
```

- [ ] **Step 5: Create the prompt catalog and registry**

```ts
// src/mcp/prompt-catalog.ts
import type { PromptDefinition } from "./schema";
import type { PromptHandler, PromptManifestEntry } from "./prompt-manifest";

export function buildPromptDefinitions(entries: PromptManifestEntry[]): PromptDefinition[] {
  return entries.map(({ name, title, description, arguments: args }) => ({
    name,
    ...(title ? { title } : {}),
    description,
    arguments: args
  }));
}

export function buildPromptHandlerMap(entries: PromptManifestEntry[]): Map<string, PromptHandler> {
  return new Map(entries.map((entry) => [entry.name, entry.handler] as const));
}
```

```ts
// src/mcp/prompt-registry.ts
import type { AppEnv } from "../lib/env";
import { buildPromptDefinitions } from "./prompt-catalog";
import { promptManifestEntries } from "./prompt-manifest";

export function getEnabledPrompts(_env: AppEnv) {
  return buildPromptDefinitions(promptManifestEntries);
}

export function findEnabledPrompt(name: string, _env: AppEnv) {
  return promptManifestEntries.find((prompt) => prompt.name === name);
}
```

- [ ] **Step 6: Run the registry tests until they pass**

Run:

```bash
npm test -- tests/mcp/resource-prompt-registry.test.ts
```

Expected: PASS. The new manifest, projection, and lookup helpers should satisfy the registry tests before the router is touched.

- [ ] **Step 7: Commit the manifest/registry layer**

```bash
git add src/mcp/schema.ts src/mcp/validate.ts src/mcp/resource-manifest.ts src/mcp/resource-catalog.ts src/mcp/resource-registry.ts src/mcp/prompt-manifest.ts src/mcp/prompt-catalog.ts src/mcp/prompt-registry.ts tests/mcp/resource-prompt-registry.test.ts
git commit -m "feat(mcp): add manifest-backed resources and prompts"
```

---

### Task 3: Wire the new MCP methods into protocol and router

**Files:**
- Modify: `src/mcp/protocol.ts`
- Modify: `src/mcp/router.ts`
- Test: `tests/mcp/router-resource-prompt.test.ts`
- Reference: `src/mcp/jsonrpc.ts`

- [ ] **Step 1: Update `initializeResult()` to advertise the new capabilities**

```ts
// src/mcp/protocol.ts
export function initializeResult() {
  return {
    protocolVersion: "2025-06-18",
    capabilities: {
      tools: {},
      resources: {},
      prompts: {}
    },
    serverInfo: SERVER_INFO
  };
}
```

- [ ] **Step 2: Add resource and prompt router branches**

```ts
// src/mcp/router.ts
import { findEnabledPrompt, getEnabledPrompts } from "./prompt-registry";
import { findEnabledResource, getEnabledResources } from "./resource-registry";
import { buildPromptHandlerMap } from "./prompt-catalog";
import { promptManifestEntries } from "./prompt-manifest";
import { buildResourceHandlerMap } from "./resource-catalog";
import { resourceManifestEntries } from "./resource-manifest";

const resourceHandlerMap = buildResourceHandlerMap(resourceManifestEntries);
const promptHandlerMap = buildPromptHandlerMap(promptManifestEntries);

export async function handleJsonRpc(request: JsonRpcRequest, env: Env, originalRequest: Request): Promise<Response> {
  if (isProtectedMcpMethod(request.method) && !isAuthorizedMcpRequest(originalRequest, env)) {
    return jsonRpcError(request.id ?? null, -32600, "Unauthorized", { status: 401 });
  }

  switch (request.method) {
    case "initialize":
      return jsonRpcResult(request.id ?? null, initializeResult());
    case "tools/list":
      return jsonRpcResult(request.id ?? null, {
        tools: getEnabledTools(env, { disabledTools: getDisabledTools(originalRequest) })
      });
    case "resources/list":
      return jsonRpcResult(request.id ?? null, {
        resources: getEnabledResources(env)
      });
    case "resources/read": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const uri = "uri" in params ? (params as { uri?: unknown }).uri : undefined;
      if (typeof uri !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const resource = findEnabledResource(uri, env);
      if (!resource) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown resource: ${uri}`);
      }

      const result = await resourceHandlerMap.get(resource.uri)?.({ env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, result);
    }
    case "prompts/list":
      return jsonRpcResult(request.id ?? null, {
        prompts: getEnabledPrompts(env)
      });
    case "prompts/get": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const name = "name" in params ? (params as { name?: unknown }).name : undefined;
      if (typeof name !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const prompt = findEnabledPrompt(name, env);
      if (!prompt) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown prompt: ${name}`);
      }

      const args = "arguments" in params ? (params as { arguments?: unknown }).arguments ?? {} : {};
      const validationErrorMessage = validateToolArguments(prompt.argumentsSchema, args);
      if (validationErrorMessage) {
        return jsonRpcError(request.id ?? null, -32602, validationErrorMessage);
      }

      const result = await promptHandlerMap.get(prompt.name)?.(args as Record<string, unknown>, { env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, result);
    }
    case "tools/call":
      // keep the existing tool dispatch path unchanged
```

- [ ] **Step 3: Run the router tests until they pass**

Run:

```bash
npm test -- tests/mcp/router-resource-prompt.test.ts
```

Expected: PASS. `initialize`, `resources/list`, `resources/read`, `prompts/list`, and `prompts/get` should now work with the manifest-backed helpers.

- [ ] **Step 4: Run the existing MCP regression tests to verify no tool regressions**

Run:

```bash
npm test -- tests/mcp/tool-registry.test.ts
```

Expected: PASS. Existing tool discovery, aliasing, and README assertions should still hold.

- [ ] **Step 5: Commit the protocol and router changes**

```bash
git add src/mcp/protocol.ts src/mcp/router.ts tests/mcp/router-resource-prompt.test.ts
git commit -m "feat(mcp): expose resource and prompt RPC methods"
```

---

### Task 4: Generate README support for resources and prompts

**Files:**
- Modify: `scripts/render-readme.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Test: `tests/mcp/resource-prompt-registry.test.ts`

- [ ] **Step 1: Extend the README generator summary types and module loading**

```ts
// scripts/render-readme.ts
type ResourceSummary = {
  uri: string;
  mimeType: string;
  kind: "static" | "runtime";
};

type PromptSummary = {
  name: string;
};

async function collectResourceSummary() {
  const vite = await createServer({ appType: "custom", server: { middlewareMode: true } });

  try {
    const manifestModule = await vite.ssrLoadModule("/src/mcp/resource-manifest.ts");
    const entries = manifestModule.resourceManifestEntries as Array<{
      uri: string;
      mimeType: string;
      kind: "static" | "runtime";
    }>;

    return entries.map((entry) => ({
      uri: entry.uri,
      mimeType: entry.mimeType,
      kind: entry.kind
    }));
  } finally {
    await vite.close();
  }
}

async function collectPromptSummary() {
  const vite = await createServer({ appType: "custom", server: { middlewareMode: true } });

  try {
    const manifestModule = await vite.ssrLoadModule("/src/mcp/prompt-manifest.ts");
    const entries = manifestModule.promptManifestEntries as Array<{ name: string }>;
    return entries.map((entry) => ({ name: entry.name }));
  } finally {
    await vite.close();
  }
}
```

- [ ] **Step 2: Add resource and prompt sections to the generated block**

```ts
function renderBlock(locale: Locale, toolEntries: ManifestSummary[], resourceEntries: ResourceSummary[], promptEntries: PromptSummary[]): string {
  if (locale === "zh-CN") {
    return [
      markerStart,
      "### 自动生成的工具快照",
      "",
      `演示地址：\`${demoUrl}\``,
      "",
      "支持的认证方式：",
      "",
      "- Bearer",
      "- x-api-key / API key",
      "- query `key`",
      "",
      "基于 manifest 的工具列表：",
      "",
      `- 原生工具：${formatToolList(getToolNames(toolEntries, "native", false))}`,
      `- Paper 工具：${formatToolList(getPaperToolNames(toolEntries, false))}`,
      `- 需环境变量的 Paper 工具：${formatToolList(getPaperToolNames(toolEntries, true))}`,
      `- 外部工具：${formatToolList(getToolNames(toolEntries, "external", false).filter((name) => !name.startsWith("paper_")))}`,
      `- 需环境变量的外部工具：${formatToolList(getToolNames(toolEntries, "external", true).filter((name) => !name.startsWith("paper_")))}`,
      `- 开发者工具：${formatToolList(getToolNames(toolEntries, "devutils", false))}`,
      "",
      "内置 Resources：",
      ...resourceEntries.map((entry) => `- \`${entry.uri}\` (${entry.mimeType}, ${entry.kind})`),
      "",
      "内置 Prompts：",
      `- ${formatToolList(promptEntries.map((entry) => entry.name))}`,
      "",
      "- 运行 `npm run render:readme` 可根据 manifests 刷新此区块。",
      markerEnd
    ].join("\n");
  }

  return [
    markerStart,
    "### Generated tool snapshot",
    "",
    `Demo endpoint: \`${demoUrl}\``,
    "",
    "Supported auth:",
    "",
    "- Bearer",
    "- x-api-key / API key",
    "- query `key`",
    "",
    "Manifest-backed tool surface:",
    "",
    `- Native tools: ${formatToolList(getToolNames(toolEntries, "native", false))}`,
    `- Paper tools: ${formatToolList(getPaperToolNames(toolEntries, false))}`,
    `- Env-gated paper tool: ${formatToolList(getPaperToolNames(toolEntries, true))}`,
    `- External tools: ${formatToolList(getToolNames(toolEntries, "external", false).filter((name) => !name.startsWith("paper_")))}`,
    `- Env-gated external tools: ${formatToolList(getToolNames(toolEntries, "external", true).filter((name) => !name.startsWith("paper_")))}`,
    `- Developer utilities: ${formatToolList(getToolNames(toolEntries, "devutils", false))}`,
    "",
    "Built-in resources:",
    ...resourceEntries.map((entry) => `- \`${entry.uri}\` (${entry.mimeType}, ${entry.kind})`),
    "",
    "Built-in prompts:",
    `- ${formatToolList(promptEntries.map((entry) => entry.name))}`,
    "",
    "- Run `npm run render:readme` to refresh this block from the manifests.",
    markerEnd
  ].join("\n");
}
```

- [ ] **Step 3: Regenerate the README files**

Run:

```bash
npm run render:readme
```

Expected: both `README.md` and `README.zh-CN.md` gain the generated `resources` and `prompts` summaries and the registry test README assertions turn green.

- [ ] **Step 4: Re-run the README-facing registry tests**

Run:

```bash
npm test -- tests/mcp/resource-prompt-registry.test.ts
```

Expected: PASS with the new generated README content.

- [ ] **Step 5: Commit the README generation changes**

```bash
git add scripts/render-readme.ts README.md README.zh-CN.md tests/mcp/resource-prompt-registry.test.ts
git commit -m "docs: add generated resource and prompt summaries"
```

---

### Task 5: Run full verification, deploy, and live-test the Worker

**Files:**
- Verify: `tests/mcp/resource-prompt-registry.test.ts`
- Verify: `tests/mcp/router-resource-prompt.test.ts`
- Verify: `tests/mcp/tool-registry.test.ts`
- Verify: `README.md`
- Verify: `README.zh-CN.md`

- [ ] **Step 1: Run typecheck and the full test suite**

Run:

```bash
npm run typecheck
npm test
```

Expected: PASS. TypeScript must compile cleanly and the full Vitest suite must stay green.

- [ ] **Step 2: Start the local Worker and smoke-test the new MCP methods**

Run the dev server in one terminal:

```bash
npm run dev
```

Then in another terminal run:

```bash
curl -s http://127.0.0.1:8787/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
curl -s http://127.0.0.1:8787/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'
curl -s http://127.0.0.1:8787/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"resource://toolhive/overview"}}'
curl -s http://127.0.0.1:8787/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}'
curl -s http://127.0.0.1:8787/mcp -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"choose_tool_for_task","arguments":{"task":"Find React docs"}}}'
```

Expected: local JSON-RPC success responses for all five calls, with `initialize` advertising `resources` and `prompts`.

- [ ] **Step 3: Commit the finished implementation**

```bash
git add src/mcp/protocol.ts src/mcp/router.ts src/mcp/schema.ts src/mcp/validate.ts src/mcp/resource-manifest.ts src/mcp/resource-catalog.ts src/mcp/resource-registry.ts src/mcp/prompt-manifest.ts src/mcp/prompt-catalog.ts src/mcp/prompt-registry.ts scripts/render-readme.ts README.md README.zh-CN.md tests/mcp/resource-prompt-registry.test.ts tests/mcp/router-resource-prompt.test.ts
git commit -m "feat(mcp): add resource and prompt support"
```

- [ ] **Step 4: Deploy the Worker**

Run:

```bash
npm run deploy
```

Expected: Wrangler publishes the updated Worker successfully and prints the deployed Worker URL.

- [ ] **Step 5: Live-test the deployed MCP endpoint**

Run:

```bash
curl -s https://mcp.awsl.app/mcp?key=elysia -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
curl -s https://mcp.awsl.app/mcp?key=elysia -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"resources/list"}'
curl -s https://mcp.awsl.app/mcp?key=elysia -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"resource://toolhive/runtime/enabled"}}'
curl -s https://mcp.awsl.app/mcp?key=elysia -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"prompts/list"}'
curl -s https://mcp.awsl.app/mcp?key=elysia -H "content-type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"prompts/get","params":{"name":"research_with_sources","arguments":{"topic":"Model Context Protocol resources"}}}'
```

Expected: the live Worker returns the new capability payload and successfully serves the built-in resources and prompts over the real remote MCP endpoint.

- [ ] **Step 6: Record the verification evidence in the branch summary commit message or handoff note**

```text
Verified locally with npm run typecheck, npm test, local /mcp smoke tests, deployment, and live endpoint checks for initialize/resources/prompts.
```

---

## Self-Review

- Spec coverage: protocol expansion, manifest architecture, built-in resources, built-in prompts, runtime snapshots, README generation, testing, deployment, and live MCP checks are all represented by tasks above.
- Placeholder scan: no `TODO`, `TBD`, or “similar to” references remain; each task includes file paths, commands, and concrete code.
- Type consistency: the plan consistently uses `ResourceManifestEntry`, `PromptManifestEntry`, `buildResourceDefinitions`, `buildPromptDefinitions`, `getEnabledResources`, `findEnabledResource`, `getEnabledPrompts`, and `findEnabledPrompt` across the tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-30-toolhive-mcp-resource-prompt-support.md`. Two execution options:

1. **Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

The user already chose **Subagent-Driven**, so the next step is to use `superpowers:subagent-driven-development` and execute this plan inside the `feature/mcp-resource-prompt-support` worktree.