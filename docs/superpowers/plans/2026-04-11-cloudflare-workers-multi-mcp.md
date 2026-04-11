# Cloudflare Workers Multi-MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless Cloudflare Workers remote HTTP MCP server at `/mcp` with native tools, key-gated external service tools, and a curated devutils subset.

**Architecture:** Implement a custom minimal MCP Streamable HTTP / JSON-RPC protocol layer instead of a Node stdio MCP server. Tools are statically registered and dynamically filtered by Worker env keys; each tool handler returns a structured internal result that is converted to text MCP tool output.

**Tech Stack:** TypeScript, Cloudflare Workers runtime, Wrangler, Vitest, Web Crypto API, native `fetch`, no persistent storage, no client authentication.

---

## Scope boundary

This plan implements the approved first-release scope from [2026-04-11-cloudflare-workers-multi-mcp-design.md](../specs/2026-04-11-cloudflare-workers-multi-mcp-design.md):

- Implement now: `/mcp`, MCP JSON-RPC, native tools, Tavily HTTP API, Context7 tool semantics, Unsplash search, Pure.md extract, selected devutils.
- Do not implement now: `news.*` and `domain.*` tools. They are represented only in documentation and roadmap notes.
- Do not implement now: resources, prompts, SSE, old HTTP+SSE transport, sessions, persistent caching, authentication.

The spec covers multiple independent tool groups. This plan keeps them in one implementation track because all groups depend on the same MCP protocol shell and tool registry; `news.*` and `domain.*` remain out of the first implementation.

---

## File structure to create

```text
package.json
package-lock.json
tsconfig.json
vitest.config.ts
wrangler.jsonc
src/worker.ts
src/mcp/jsonrpc.ts
src/mcp/protocol.ts
src/mcp/result.ts
src/mcp/router.ts
src/mcp/schema.ts
src/mcp/tool-registry.ts
src/lib/env.ts
src/lib/errors.ts
src/lib/http.ts
src/lib/keys.ts
src/lib/math/evaluate.ts
src/lib/math/parser.ts
src/lib/math/tokenizer.ts
src/lib/time.ts
src/tools/types.ts
src/tools/native/weather.ts
src/tools/native/webfetch.ts
src/tools/native/calc.ts
src/tools/native/time.ts
src/tools/native/ip.ts
src/tools/external/tavily.ts
src/tools/external/context7.ts
src/tools/external/unsplash.ts
src/tools/external/puremd.ts
src/tools/devutils/base64.ts
src/tools/devutils/hash.ts
src/tools/devutils/uuid.ts
src/tools/devutils/jwt.ts
src/tools/devutils/json-tools.ts
src/tools/devutils/regex.ts
src/tools/devutils/url-parse.ts
src/tools/devutils/timestamp.ts
src/tools/devutils/ip-tools.ts
src/tools/devutils/text.ts
tests/helpers/request.ts
tests/mcp/protocol.test.ts
tests/mcp/tool-registry.test.ts
tests/tools/native.test.ts
tests/tools/external.test.ts
tests/tools/devutils.test.ts
README.md
```

Responsibility summary:

- `src/worker.ts`: Cloudflare Worker entry and route gating.
- `src/mcp/*`: protocol-level JSON-RPC and MCP behavior.
- `src/lib/*`: runtime-independent helpers.
- `src/tools/*`: tool definitions and handlers.
- `tests/*`: behavior tests for protocol, registry, native, external, and devutils modules.

---

### Task 1: Scaffold the Workers TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `wrangler.jsonc`
- Create: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cloudflare-workers-multi-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "wrangler": "latest"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "types": ["@cloudflare/workers-types", "vitest"],
    "lib": ["ES2022", "WebWorker"],
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"]
    }
  }
});
```

- [ ] **Step 4: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "cloudflare-workers-multi-mcp",
  "main": "src/worker.ts",
  "compatibility_date": "2026-04-11",
  "workers_dev": true,
  "observability": {
    "enabled": true
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
.dev.vars
.dev.vars.*
.env
.env.*
.wrangler/
.superpowers/
.omc/research/
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`

Expected: `package-lock.json` is created and installation exits with status 0.

- [ ] **Step 7: Run initial checks**

Run: `npm run typecheck`

Expected: FAIL because `src/worker.ts` does not exist yet. The expected failure contains a TypeScript input/file error rather than dependency installation errors.

- [ ] **Step 8: Commit scaffold files**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts wrangler.jsonc .gitignore
git commit -m "chore: scaffold Workers TypeScript project"
```

---

### Task 2: Add MCP result, JSON-RPC, and route shell

**Files:**
- Create: `src/mcp/result.ts`
- Create: `src/mcp/jsonrpc.ts`
- Create: `src/mcp/protocol.ts`
- Create: `src/mcp/router.ts`
- Create: `src/worker.ts`
- Create: `tests/helpers/request.ts`
- Create: `tests/mcp/protocol.test.ts`

- [ ] **Step 1: Write failing protocol tests in `tests/mcp/protocol.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import worker from "../../src/worker";
import { jsonRpcRequest } from "../helpers/request";

const env = {};
const ctx = { waitUntil() {}, passThroughOnException() {} } as ExecutionContext;

async function call(path: string, init?: RequestInit): Promise<Response> {
  return worker.fetch(new Request(`https://example.com${path}`, init), env, ctx);
}

describe("MCP route shell", () => {
  it("returns 404 for non-/mcp paths", async () => {
    const response = await call("/other", { method: "POST" });
    expect(response.status).toBe(404);
  });

  it("returns 405 for GET /mcp", async () => {
    const response = await call("/mcp", { method: "GET" });
    expect(response.status).toBe(405);
  });

  it("initializes with tools capability", async () => {
    const response = await call("/mcp", jsonRpcRequest("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result.serverInfo.name).toBe("cloudflare-multi-mcp");
    expect(body.result.capabilities).toEqual({ tools: {} });
  });

  it("returns 202 for initialized notification", async () => {
    const response = await call("/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })
    });
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("returns JSON-RPC error for unknown methods", async () => {
    const response = await call("/mcp", jsonRpcRequest("missing/method", {}));
    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.error.code).toBe(-32601);
  });
});
```

- [ ] **Step 2: Create `tests/helpers/request.ts`**

```ts
export function jsonRpcRequest(method: string, params: unknown, id = 1): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream"
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  };
}
```

- [ ] **Step 3: Run the failing tests**

Run: `npx vitest run tests/mcp/protocol.test.ts`

Expected: FAIL with module-not-found errors for `src/worker`.

- [ ] **Step 4: Create `src/mcp/result.ts`**

```ts
export type ToolContent = { type: "text"; text: string };

export type McpToolResult = {
  content: ToolContent[];
  isError?: boolean;
};

export type ToolSuccess = { ok: true; data: unknown };
export type ToolFailure = {
  ok: false;
  error: {
    type: "validation_error" | "upstream_error" | "config_error" | "internal_error";
    message: string;
    status?: number;
  };
};

export type ToolExecutionResult = ToolSuccess | ToolFailure;

export function toToolResult(result: ToolExecutionResult): McpToolResult {
  if (result.ok) {
    return { content: [{ type: "text", text: stringifyToolData(result.data) }] };
  }
  return {
    content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
    isError: true
  };
}

export function stringifyToolData(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}
```

- [ ] **Step 5: Create `src/mcp/jsonrpc.ts`**

```ts
export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

export function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result });
}

export function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): Response {
  const error = data === undefined ? { code, message } : { code, message, data };
  return jsonResponse({ jsonrpc: "2.0", id, error });
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return candidate.jsonrpc === "2.0" && typeof candidate.method === "string";
}
```

- [ ] **Step 6: Create `src/mcp/protocol.ts`**

```ts
export const SERVER_INFO = {
  name: "cloudflare-multi-mcp",
  version: "0.1.0"
};

export function initializeResult() {
  return {
    protocolVersion: "2025-06-18",
    capabilities: { tools: {} },
    serverInfo: SERVER_INFO
  };
}
```

- [ ] **Step 7: Create `src/mcp/router.ts`**

```ts
import { initializeResult } from "./protocol";
import { jsonRpcError, jsonRpcResult, type JsonRpcRequest } from "./jsonrpc";

export type Env = Record<string, string | undefined>;

export async function handleJsonRpc(request: JsonRpcRequest, env: Env, originalRequest: Request): Promise<Response> {
  const id = request.id ?? null;

  if (request.method === "initialize") {
    return jsonRpcResult(id, initializeResult());
  }

  if (request.method === "tools/list") {
    return jsonRpcResult(id, { tools: [] });
  }

  if (request.method === "tools/call") {
    return jsonRpcError(id, -32601, "tools/call not implemented yet");
  }

  return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
}
```

- [ ] **Step 8: Create `src/worker.ts`**

```ts
import { handleJsonRpc, type Env } from "./mcp/router";
import { isJsonRpcRequest, jsonRpcError } from "./mcp/jsonrpc";

async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (request.method === "GET" || request.method === "DELETE") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (!isJsonRpcRequest(body)) {
    return jsonRpcError(null, -32600, "Invalid Request");
  }

  if (body.id === undefined && body.method === "notifications/initialized") {
    return new Response(null, { status: 202 });
  }

  return handleJsonRpc(body, env, request);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }
    return handleMcp(request, env);
  }
};
```

- [ ] **Step 9: Run protocol tests**

Run: `npx vitest run tests/mcp/protocol.test.ts`

Expected: PASS for route shell and initialize tests; `tools/call` remains intentionally unimplemented in this task.

- [ ] **Step 10: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 11: Commit protocol shell**

```bash
git add src tests
git commit -m "feat: add stateless MCP protocol shell"
```

---

### Task 3: Add env parsing, key rotation, schemas, and tool registry

**Files:**
- Create: `src/lib/env.ts`
- Create: `src/lib/keys.ts`
- Create: `src/lib/errors.ts`
- Create: `src/mcp/schema.ts`
- Create: `src/mcp/tool-registry.ts`
- Modify: `src/mcp/router.ts`
- Create: `tests/mcp/tool-registry.test.ts`

- [ ] **Step 1: Write failing registry tests**

```ts
import { describe, expect, it } from "vitest";
import { getEnabledTools } from "../../src/mcp/tool-registry";
import { parseKeyList, pickRandomKey } from "../../src/lib/keys";

describe("key parsing", () => {
  it("parses comma-separated keys and trims blanks", () => {
    expect(parseKeyList(" a, b ,, c ")).toEqual(["a", "b", "c"]);
  });

  it("picks the only key without random selection", () => {
    expect(pickRandomKey(["only"])).toBe("only");
  });
});

describe("tool registry", () => {
  it("always exposes native and devutils tools", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);
    expect(names).toContain("weather");
    expect(names).toContain("webfetch");
    expect(names).toContain("devutils.base64_encode");
  });

  it("hides key-gated tools when env keys are absent", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);
    expect(names).not.toContain("tavily.search");
    expect(names).not.toContain("context7.query-docs");
  });

  it("shows key-gated tools when env keys exist", () => {
    const names = getEnabledTools({ TAVILY_API_KEYS: "tvly-a", CONTEXT7_API_KEYS: "ctx-a", UNSPLASH_ACCESS_KEYS: "un-a", PUREMD_API_KEYS: "pm-a" }).map((tool) => tool.name);
    expect(names).toContain("tavily.search");
    expect(names).toContain("tavily.extract");
    expect(names).toContain("context7.resolve-library-id");
    expect(names).toContain("unsplash.search_photos");
    expect(names).toContain("puremd.extract");
  });

  it("does not expose roadmap modules in first release", () => {
    const names = getEnabledTools({}).map((tool) => tool.name);
    expect(names.some((name) => name.startsWith("news."))).toBe(false);
    expect(names.some((name) => name.startsWith("domain."))).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing registry tests**

Run: `npx vitest run tests/mcp/tool-registry.test.ts`

Expected: FAIL with missing modules.

- [ ] **Step 3: Create `src/lib/keys.ts`**

```ts
export function parseKeyList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

export function pickRandomKey(keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  if (keys.length === 1) return keys[0];
  return keys[Math.floor(Math.random() * keys.length)];
}
```

- [ ] **Step 4: Create `src/lib/env.ts`**

```ts
import { parseKeyList } from "./keys";

export type AppEnv = Record<string, string | undefined>;

export function hasKeys(env: AppEnv, name: "CONTEXT7_API_KEYS" | "TAVILY_API_KEYS" | "UNSPLASH_ACCESS_KEYS" | "PUREMD_API_KEYS"): boolean {
  return parseKeyList(env[name]).length > 0;
}
```

- [ ] **Step 5: Create `src/lib/errors.ts`**

```ts
import type { ToolFailure } from "../mcp/result";

export function validationError(message: string): ToolFailure {
  return { ok: false, error: { type: "validation_error", message } };
}

export function configError(message: string): ToolFailure {
  return { ok: false, error: { type: "config_error", message } };
}

export function upstreamError(message: string, status?: number): ToolFailure {
  return { ok: false, error: status === undefined ? { type: "upstream_error", message } : { type: "upstream_error", message, status } };
}

export function internalError(message: string): ToolFailure {
  return { ok: false, error: { type: "internal_error", message } };
}
```

- [ ] **Step 6: Create `src/mcp/schema.ts`**

```ts
export type JsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiresEnv?: "CONTEXT7_API_KEYS" | "TAVILY_API_KEYS" | "UNSPLASH_ACCESS_KEYS" | "PUREMD_API_KEYS";
};

export const emptyObjectSchema: JsonSchema = { type: "object", properties: {}, additionalProperties: false };
```

- [ ] **Step 7: Create `src/mcp/tool-registry.ts`**

```ts
import { hasKeys, type AppEnv } from "../lib/env";
import { emptyObjectSchema, type ToolDefinition } from "./schema";

const nativeTools: ToolDefinition[] = [
  { name: "weather", description: "Fetch realtime weather from wttr.in.", inputSchema: { type: "object", properties: { query: { type: "string" }, format: { type: "string", enum: ["json", "text"], default: "json" }, lang: { type: "string" }, units: { type: "string", enum: ["metric", "us", "uk"] } }, required: ["query"], additionalProperties: false } },
  { name: "webfetch", description: "Fetch a URL with GET or POST and return text body plus optional response headers.", inputSchema: { type: "object", properties: { url: { type: "string" }, method: { type: "string", enum: ["GET", "POST"], default: "GET" }, requestheaders: { type: "object", additionalProperties: { type: "string" } }, body: { type: "string" }, return_responseheaders: { type: "boolean", default: false } }, required: ["url"], additionalProperties: false } },
  { name: "calc", description: "Safely evaluate a whitelisted math expression.", inputSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"], additionalProperties: false } },
  { name: "time", description: "Return realtime date/time for an IANA timezone.", inputSchema: { type: "object", properties: { timezone: { type: "string", default: "UTC" } }, additionalProperties: false } },
  { name: "ip", description: "Return client and Cloudflare connection information.", inputSchema: emptyObjectSchema }
];

const externalTools: ToolDefinition[] = [
  { name: "context7.resolve-library-id", description: "Resolve a package/library query to a Context7 library ID.", requiresEnv: "CONTEXT7_API_KEYS", inputSchema: { type: "object", properties: { query: { type: "string" }, libraryName: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "context7.query-docs", description: "Query Context7 documentation for a library ID.", requiresEnv: "CONTEXT7_API_KEYS", inputSchema: { type: "object", properties: { libraryId: { type: "string" }, query: { type: "string" } }, required: ["libraryId", "query"], additionalProperties: false } },
  { name: "tavily.search", description: "Search the web using Tavily Search HTTP API.", requiresEnv: "TAVILY_API_KEYS", inputSchema: { type: "object", properties: { query: { type: "string" }, search_depth: { type: "string", enum: ["basic", "advanced", "fast", "ultra-fast"] }, topic: { type: "string", enum: ["general", "news", "finance"] }, max_results: { type: "integer", minimum: 0, maximum: 20 }, include_answer: {}, include_raw_content: {}, include_domains: { type: "array", items: { type: "string" } }, exclude_domains: { type: "array", items: { type: "string" } } }, required: ["query"], additionalProperties: false } },
  { name: "tavily.extract", description: "Extract content from one or more URLs using Tavily Extract HTTP API.", requiresEnv: "TAVILY_API_KEYS", inputSchema: { type: "object", properties: { urls: {}, query: { type: "string" }, extract_depth: { type: "string", enum: ["basic", "advanced"] }, format: { type: "string", enum: ["markdown", "text"] }, include_images: { type: "boolean" }, include_favicon: { type: "boolean" } }, required: ["urls"], additionalProperties: false } },
  { name: "unsplash.search_photos", description: "Search photos using Unsplash.", requiresEnv: "UNSPLASH_ACCESS_KEYS", inputSchema: { type: "object", properties: { query: { type: "string" }, page: { type: "integer", minimum: 1 }, per_page: { type: "integer", minimum: 1, maximum: 30 }, orientation: { type: "string", enum: ["landscape", "portrait", "squarish"] }, color: { type: "string" }, order_by: { type: "string" } }, required: ["query"], additionalProperties: false } },
  { name: "puremd.extract", description: "Extract Markdown/text content from a URL using Pure.md.", requiresEnv: "PUREMD_API_KEYS", inputSchema: { type: "object", properties: { url: { type: "string" }, format: { type: "string", enum: ["markdown", "text"] }, requestheaders: { type: "object", additionalProperties: { type: "string" } }, prompt: { type: "string" }, schema: { type: "string" } }, required: ["url"], additionalProperties: false } }
];

const devutilsTools: ToolDefinition[] = [
  "base64_encode", "base64_decode", "hash", "uuid", "jwt_decode", "json_format", "json_validate", "regex_test", "url_parse", "timestamp_convert", "ip_validate", "cidr_calculate", "text_stats", "slugify", "case_convert"
].map((name) => ({ name: `devutils.${name}`, description: `Developer utility: ${name.replaceAll("_", " ")}.`, inputSchema: { type: "object", properties: {}, additionalProperties: true } }));

export function getEnabledTools(env: AppEnv): ToolDefinition[] {
  return [...nativeTools, ...devutilsTools, ...externalTools.filter((tool) => tool.requiresEnv === undefined || hasKeys(env, tool.requiresEnv))];
}

export function findEnabledTool(name: string, env: AppEnv): ToolDefinition | undefined {
  return getEnabledTools(env).find((tool) => tool.name === name);
}
```

- [ ] **Step 8: Modify `src/mcp/router.ts` to use the registry for `tools/list`**

```ts
import { initializeResult } from "./protocol";
import { jsonRpcError, jsonRpcResult, type JsonRpcRequest } from "./jsonrpc";
import { getEnabledTools } from "./tool-registry";

export type Env = Record<string, string | undefined>;

export async function handleJsonRpc(request: JsonRpcRequest, env: Env, originalRequest: Request): Promise<Response> {
  const id = request.id ?? null;

  if (request.method === "initialize") {
    return jsonRpcResult(id, initializeResult());
  }

  if (request.method === "tools/list") {
    return jsonRpcResult(id, { tools: getEnabledTools(env) });
  }

  if (request.method === "tools/call") {
    return jsonRpcError(id, -32601, "tools/call not implemented yet");
  }

  return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
}
```

- [ ] **Step 9: Run registry tests**

Run: `npx vitest run tests/mcp/tool-registry.test.ts`

Expected: PASS.

- [ ] **Step 10: Run protocol tests**

Run: `npx vitest run tests/mcp/protocol.test.ts`

Expected: PASS.

- [ ] **Step 11: Commit registry work**

```bash
git add src tests
git commit -m "feat: add environment-gated MCP tool registry"
```

---

### Task 4: Add tool dispatch and native tools

**Files:**
- Create: `src/tools/types.ts`
- Create: `src/lib/http.ts`
- Create: `src/lib/time.ts`
- Create: `src/lib/math/tokenizer.ts`
- Create: `src/lib/math/parser.ts`
- Create: `src/lib/math/evaluate.ts`
- Create: `src/tools/native/weather.ts`
- Create: `src/tools/native/webfetch.ts`
- Create: `src/tools/native/calc.ts`
- Create: `src/tools/native/time.ts`
- Create: `src/tools/native/ip.ts`
- Modify: `src/mcp/router.ts`
- Create: `tests/tools/native.test.ts`

- [ ] **Step 1: Write failing native tool tests**

```ts
import { describe, expect, it, vi } from "vitest";
import { callNativeTool } from "../../src/tools/native/calc";
import { handleWebfetch } from "../../src/tools/native/webfetch";
import { handleTime } from "../../src/tools/native/time";

describe("calc", () => {
  it("evaluates whitelisted math expressions", async () => {
    const result = await callNativeTool({ expression: "sqrt(9) + sin(pi / 2)" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ result: 4 });
  });

  it("rejects unknown identifiers", async () => {
    const result = await callNativeTool({ expression: "process.exit()" });
    expect(result.ok).toBe(false);
  });
});

describe("webfetch", () => {
  it("supports GET and optional response headers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("hello", { status: 200, headers: { "x-test": "ok" } })));
    const result = await handleWebfetch({ url: "https://example.com", return_responseheaders: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ status: 200, body: "hello", responseheaders: { "x-test": "ok" } });
  });

  it("supports POST body", async () => {
    const fetchMock = vi.fn(async () => new Response("posted", { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await handleWebfetch({ url: "https://example.com/post", method: "POST", body: "{\"a\":1}" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://example.com/post", expect.objectContaining({ method: "POST", body: "{\"a\":1}" }));
  });

  it("rejects non-http schemes", async () => {
    const result = await handleWebfetch({ url: "file:///etc/passwd" });
    expect(result.ok).toBe(false);
  });
});

describe("time", () => {
  it("accepts an IANA timezone", async () => {
    const result = await handleTime({ timezone: "Asia/Shanghai" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toHaveProperty("timezone", "Asia/Shanghai");
  });

  it("rejects invalid timezone", async () => {
    const result = await handleTime({ timezone: "Invalid/Zone" });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run failing native tests**

Run: `npx vitest run tests/tools/native.test.ts`

Expected: FAIL with missing native tool modules.

- [ ] **Step 3: Create `src/tools/types.ts`**

```ts
import type { AppEnv } from "../lib/env";
import type { ToolExecutionResult } from "../mcp/result";

export type ToolContext = {
  env: AppEnv;
  request: Request;
};

export type ToolHandler = (args: unknown, context: ToolContext) => Promise<ToolExecutionResult>;
```

- [ ] **Step 4: Create `src/lib/http.ts`**

```ts
export const DEFAULT_CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export function assertHttpUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs are supported");
  }
  return url;
}

export function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}
```

- [ ] **Step 5: Create `src/lib/time.ts`**

```ts
export function formatTime(timezone = "UTC", date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time_24h: `${parts.hour}:${parts.minute}:${parts.second}`,
    datetime: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    unix: Math.floor(date.getTime() / 1000),
    timezone
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Create minimal safe math evaluator in `src/lib/math/evaluate.ts`**

```ts
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sqrt: Math.sqrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  pow: Math.pow
};

export function evaluateExpression(expression: string): number {
  const normalized = expression.replace(/\s+/g, "");
  if (!/^[0-9A-Za-z_+\-*/^().,]+$/.test(normalized)) {
    throw new Error("Expression contains unsupported characters");
  }
  let index = 0;

  function peek(): string { return normalized[index] ?? ""; }
  function consume(value?: string): string {
    const char = peek();
    if (value !== undefined && char !== value) throw new Error(`Expected ${value}`);
    index += 1;
    return char;
  }
  function parseNumber(): number {
    const start = index;
    while (/[0-9.]/.test(peek())) consume();
    const value = Number(normalized.slice(start, index));
    if (!Number.isFinite(value)) throw new Error("Invalid number");
    return value;
  }
  function parseIdentifier(): string {
    const start = index;
    while (/[A-Za-z_]/.test(peek())) consume();
    return normalized.slice(start, index);
  }
  function parsePrimary(): number {
    if (peek() === "-") { consume("-"); return -parsePrimary(); }
    if (peek() === "(") { consume("("); const value = parseAddSub(); consume(")"); return value; }
    if (/[0-9.]/.test(peek())) return parseNumber();
    if (/[A-Za-z_]/.test(peek())) {
      const id = parseIdentifier();
      if (peek() === "(") {
        consume("(");
        const args: number[] = [];
        if (peek() !== ")") {
          args.push(parseAddSub());
          while (peek() === ",") { consume(","); args.push(parseAddSub()); }
        }
        consume(")");
        const fn = FUNCTIONS[id];
        if (!fn) throw new Error(`Unknown function: ${id}`);
        const value = fn(...args);
        if (!Number.isFinite(value)) throw new Error("Math result is not finite");
        return value;
      }
      const value = CONSTANTS[id];
      if (value === undefined) throw new Error(`Unknown identifier: ${id}`);
      return value;
    }
    throw new Error("Unexpected token");
  }
  function parsePower(): number {
    let left = parsePrimary();
    while (peek() === "^") { consume("^"); left = Math.pow(left, parsePrimary()); }
    if (!Number.isFinite(left)) throw new Error("Math result is not finite");
    return left;
  }
  function parseMulDiv(): number {
    let left = parsePower();
    while (peek() === "*" || peek() === "/") {
      const op = consume();
      const right = parsePower();
      left = op === "*" ? left * right : left / right;
    }
    if (!Number.isFinite(left)) throw new Error("Math result is not finite");
    return left;
  }
  function parseAddSub(): number {
    let left = parseMulDiv();
    while (peek() === "+" || peek() === "-") {
      const op = consume();
      const right = parseMulDiv();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  const value = parseAddSub();
  if (index !== normalized.length) throw new Error("Unexpected trailing input");
  return Number(value.toFixed(12));
}
```

- [ ] **Step 7: Create minimal parser type files required by file structure**

`src/lib/math/tokenizer.ts`:

```ts
export type MathToken = string;
```

`src/lib/math/parser.ts`:

```ts
export type MathAst = number;
```

These files are intentionally small because the first implementation keeps parsing inside `evaluate.ts` to avoid premature abstraction.

- [ ] **Step 8: Create `src/tools/native/calc.ts`**

```ts
import { validationError } from "../../lib/errors";
import { evaluateExpression } from "../../lib/math/evaluate";
import type { ToolExecutionResult } from "../../mcp/result";

export async function callNativeTool(args: unknown): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { expression?: unknown }).expression !== "string") {
    return validationError("expression must be a string");
  }
  try {
    return { ok: true, data: { result: evaluateExpression((args as { expression: string }).expression) } };
  } catch (error) {
    return validationError(error instanceof Error ? error.message : String(error));
  }
}

export const handleCalc = callNativeTool;
```

- [ ] **Step 9: Create `src/tools/native/webfetch.ts`**

```ts
import { validationError, upstreamError } from "../../lib/errors";
import { assertHttpUrl, DEFAULT_CHROME_UA, headersToObject } from "../../lib/http";
import type { ToolExecutionResult } from "../../mcp/result";

type WebfetchArgs = { url?: unknown; method?: unknown; requestheaders?: unknown; body?: unknown; return_responseheaders?: unknown };

export async function handleWebfetch(rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = rawArgs as WebfetchArgs;
  if (!args || typeof args.url !== "string") return validationError("url must be a string");
  const method = args.method === undefined ? "GET" : args.method;
  if (method !== "GET" && method !== "POST") return validationError("method must be GET or POST");
  if (args.body !== undefined && typeof args.body !== "string") return validationError("body must be a string");

  let url: URL;
  try { url = assertHttpUrl(args.url); } catch (error) { return validationError(error instanceof Error ? error.message : String(error)); }

  const headers = new Headers();
  headers.set("user-agent", DEFAULT_CHROME_UA);
  if (args.requestheaders !== undefined) {
    if (!args.requestheaders || typeof args.requestheaders !== "object" || Array.isArray(args.requestheaders)) return validationError("requestheaders must be an object");
    for (const [key, value] of Object.entries(args.requestheaders as Record<string, unknown>)) {
      if (typeof value !== "string") return validationError(`requestheaders.${key} must be a string`);
      headers.set(key, value);
    }
  }

  try {
    const response = await fetch(url.toString(), { method, headers, body: method === "POST" ? args.body as string | undefined : undefined });
    const data: Record<string, unknown> = { url: url.toString(), status: response.status, ok: response.ok, body: await response.text() };
    if (args.return_responseheaders === true) data.responseheaders = headersToObject(response.headers);
    return { ok: true, data };
  } catch (error) {
    return upstreamError(error instanceof Error ? error.message : String(error));
  }
}
```

- [ ] **Step 10: Create `src/tools/native/time.ts`**

```ts
import { validationError } from "../../lib/errors";
import { formatTime, isValidTimezone } from "../../lib/time";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleTime(rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = (rawArgs ?? {}) as { timezone?: unknown };
  const timezone = args.timezone === undefined ? "UTC" : args.timezone;
  if (typeof timezone !== "string") return validationError("timezone must be a string");
  if (!isValidTimezone(timezone)) return validationError(`Invalid timezone: ${timezone}`);
  return { ok: true, data: formatTime(timezone) };
}
```

- [ ] **Step 11: Create `src/tools/native/weather.ts`**

```ts
import { validationError, upstreamError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

type WeatherArgs = { query?: unknown; format?: unknown; lang?: unknown; units?: unknown };

export async function handleWeather(rawArgs: unknown): Promise<ToolExecutionResult> {
  const args = rawArgs as WeatherArgs;
  if (!args || typeof args.query !== "string" || args.query.trim() === "") return validationError("query must be a non-empty string");
  const format = args.format === undefined ? "json" : args.format;
  if (format !== "json" && format !== "text") return validationError("format must be json or text");

  const url = new URL(`https://wttr.in/${encodeURIComponent(args.query.trim())}`);
  if (format === "json") url.searchParams.set("format", "j1");
  if (format === "text") url.searchParams.set("T", "");
  if (typeof args.lang === "string") url.searchParams.set("lang", args.lang);
  if (args.units === "us") url.searchParams.set("u", "");
  if (args.units === "metric") url.searchParams.set("m", "");
  if (args.units === "uk") url.searchParams.set("M", "");

  const response = await fetch(url.toString(), { headers: { accept: format === "json" ? "application/json" : "text/plain" } });
  if (!response.ok) return upstreamError(`wttr.in returned ${response.status}`, response.status);
  const text = await response.text();
  return { ok: true, data: format === "json" ? JSON.parse(text) as unknown : text };
}
```

- [ ] **Step 12: Create `src/tools/native/ip.ts`**

```ts
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleIp(_args: unknown, request: Request): Promise<ToolExecutionResult> {
  const headers = request.headers;
  const selectedHeaders: Record<string, string> = {};
  for (const key of ["cf-connecting-ip", "x-forwarded-for", "cf-ipcountry", "user-agent", "accept", "accept-language"]) {
    const value = headers.get(key);
    if (value) selectedHeaders[key] = value;
  }
  const cf = (request as Request & { cf?: unknown }).cf ?? null;
  return { ok: true, data: { ip: headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for") ?? null, method: request.method, url: request.url, headers: selectedHeaders, cf } };
}
```

- [ ] **Step 13: Modify `src/mcp/router.ts` to dispatch native tools**

```ts
import { initializeResult } from "./protocol";
import { jsonRpcError, jsonRpcResult, type JsonRpcRequest } from "./jsonrpc";
import { findEnabledTool, getEnabledTools } from "./tool-registry";
import { toToolResult } from "./result";
import { handleWeather } from "../tools/native/weather";
import { handleWebfetch } from "../tools/native/webfetch";
import { handleCalc } from "../tools/native/calc";
import { handleTime } from "../tools/native/time";
import { handleIp } from "../tools/native/ip";

export type Env = Record<string, string | undefined>;

type ToolCallParams = { name?: unknown; arguments?: unknown };

export async function handleJsonRpc(request: JsonRpcRequest, env: Env, originalRequest: Request): Promise<Response> {
  const id = request.id ?? null;

  if (request.method === "initialize") return jsonRpcResult(id, initializeResult());
  if (request.method === "tools/list") return jsonRpcResult(id, { tools: getEnabledTools(env) });

  if (request.method === "tools/call") {
    const params = (request.params ?? {}) as ToolCallParams;
    if (typeof params.name !== "string") return jsonRpcError(id, -32602, "params.name must be a string");
    if (!findEnabledTool(params.name, env)) return jsonRpcError(id, -32602, `Tool is not enabled: ${params.name}`);
    const args = params.arguments ?? {};
    const result = await dispatchTool(params.name, args, env, originalRequest);
    return jsonRpcResult(id, toToolResult(result));
  }

  return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
}

async function dispatchTool(name: string, args: unknown, env: Env, request: Request) {
  if (name === "weather") return handleWeather(args);
  if (name === "webfetch") return handleWebfetch(args);
  if (name === "calc") return handleCalc(args);
  if (name === "time") return handleTime(args);
  if (name === "ip") return handleIp(args, request);
  return { ok: false as const, error: { type: "internal_error" as const, message: `No handler registered for ${name}` } };
}
```

- [ ] **Step 14: Run native tests**

Run: `npx vitest run tests/tools/native.test.ts`

Expected: PASS.

- [ ] **Step 15: Run protocol and registry tests**

Run: `npx vitest run tests/mcp/protocol.test.ts tests/mcp/tool-registry.test.ts`

Expected: PASS.

- [ ] **Step 16: Commit native tools**

```bash
git add src tests
git commit -m "feat: add native MCP tools"
```

---

### Task 5: Add external service tools

**Files:**
- Create: `src/tools/external/tavily.ts`
- Create: `src/tools/external/context7.ts`
- Create: `src/tools/external/unsplash.ts`
- Create: `src/tools/external/puremd.ts`
- Modify: `src/mcp/router.ts`
- Create: `tests/tools/external.test.ts`

- [ ] **Step 1: Write failing external tests with mocked fetch**

```ts
import { describe, expect, it, vi } from "vitest";
import { handleTavilySearch, handleTavilyExtract } from "../../src/tools/external/tavily";
import { handleUnsplashSearch } from "../../src/tools/external/unsplash";

describe("Tavily HTTP API tools", () => {
  it("posts search requests to Tavily HTTP API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ query: "mcp", results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await handleTavilySearch({ query: "mcp", max_results: 3 }, { TAVILY_API_KEYS: "tvly-test" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.tavily.com/search", expect.objectContaining({ method: "POST" }));
  });

  it("posts extract requests to Tavily HTTP API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [], failed_results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await handleTavilyExtract({ urls: "https://example.com" }, { TAVILY_API_KEYS: "tvly-test" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.tavily.com/extract", expect.objectContaining({ method: "POST" }));
  });
});

describe("Unsplash tool", () => {
  it("maps Unsplash response to compact photo fields", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [{ id: "1", width: 10, height: 20, description: "d", alt_description: "a", color: "#fff", user: { name: "Author", links: { html: "https://u" } }, urls: { small: "s", regular: "r", full: "f" }, links: { html: "https://p" } }] } })));
    const result = await handleUnsplashSearch({ query: "cat" }, { UNSPLASH_ACCESS_KEYS: "un-test" });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as any).results[0].author_name).toBe("Author");
  });
});
```

- [ ] **Step 2: Run failing external tests**

Run: `npx vitest run tests/tools/external.test.ts`

Expected: FAIL with missing external modules.

- [ ] **Step 3: Create `src/tools/external/tavily.ts`**

```ts
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { AppEnv } from "../../lib/env";
import type { ToolExecutionResult } from "../../mcp/result";

function tavilyKey(env: AppEnv): string | undefined { return pickRandomKey(parseKeyList(env.TAVILY_API_KEYS)); }

async function postTavily(endpoint: "search" | "extract", body: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const key = tavilyKey(env);
  if (!key) return configError("TAVILY_API_KEYS is not configured");
  const response = await fetch(`https://api.tavily.com/${endpoint}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) return upstreamError(`Tavily API returned ${response.status}: ${text}`, response.status);
  return { ok: true, data: text ? JSON.parse(text) as unknown : {} };
}

export async function handleTavilySearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") return validationError("query must be a string");
  return postTavily("search", args, env);
}

export async function handleTavilyExtract(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const urls = (args as { urls?: unknown } | undefined)?.urls;
  if (typeof urls !== "string" && !Array.isArray(urls)) return validationError("urls must be a string or string array");
  return postTavily("extract", args, env);
}
```

- [ ] **Step 4: Create `src/tools/external/unsplash.ts`**

```ts
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { AppEnv } from "../../lib/env";
import type { ToolExecutionResult } from "../../mcp/result";

type UnsplashPhoto = { id: string; width: number; height: number; description: string | null; alt_description: string | null; color: string | null; user: { name: string; links: { html: string } }; urls: { small: string; regular: string; full: string }; links: { html: string } };

export async function handleUnsplashSearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") return validationError("query must be a string");
  const key = pickRandomKey(parseKeyList(env.UNSPLASH_ACCESS_KEYS));
  if (!key) return configError("UNSPLASH_ACCESS_KEYS is not configured");
  const input = args as Record<string, unknown>;
  const url = new URL("https://api.unsplash.com/search/photos");
  for (const field of ["query", "page", "per_page", "orientation", "color", "order_by"]) {
    const value = input[field];
    if (value !== undefined) url.searchParams.set(field, String(value));
  }
  const response = await fetch(url.toString(), { headers: { authorization: `Client-ID ${key}`, accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) return upstreamError(`Unsplash API returned ${response.status}: ${text}`, response.status);
  const json = JSON.parse(text) as { results: UnsplashPhoto[] };
  return { ok: true, data: { results: json.results.map((photo) => ({ id: photo.id, width: photo.width, height: photo.height, description: photo.description, alt_description: photo.alt_description, author_name: photo.user.name, author_profile: photo.user.links.html, image_small: photo.urls.small, image_regular: photo.urls.regular, image_full: photo.urls.full, html_url: photo.links.html, color: photo.color })) } };
}
```

- [ ] **Step 5: Create `src/tools/external/context7.ts`**

```ts
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { AppEnv } from "../../lib/env";
import type { ToolExecutionResult } from "../../mcp/result";

async function callContext7(method: string, params: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const key = pickRandomKey(parseKeyList(env.CONTEXT7_API_KEYS));
  if (!key) return configError("CONTEXT7_API_KEYS is not configured");
  const response = await fetch("https://mcp.context7.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", CONTEXT7_API_KEY: key, authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: method, arguments: params } })
  });
  const text = await response.text();
  if (!response.ok) return upstreamError(`Context7 MCP returned ${response.status}: ${text}`, response.status);
  return { ok: true, data: text ? JSON.parse(text) as unknown : {} };
}

export async function handleContext7Resolve(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { query?: unknown }).query !== "string") return validationError("query must be a string");
  return callContext7("resolve-library-id", args, env);
}

export async function handleContext7QueryDocs(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const input = args as { libraryId?: unknown; query?: unknown } | undefined;
  if (!input || typeof input.libraryId !== "string" || typeof input.query !== "string") return validationError("libraryId and query must be strings");
  return callContext7("query-docs", args, env);
}
```

- [ ] **Step 6: Create `src/tools/external/puremd.ts`**

```ts
import { configError, upstreamError, validationError } from "../../lib/errors";
import { assertHttpUrl } from "../../lib/http";
import { parseKeyList, pickRandomKey } from "../../lib/keys";
import type { AppEnv } from "../../lib/env";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handlePuremdExtract(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  if (!args || typeof args !== "object" || typeof (args as { url?: unknown }).url !== "string") return validationError("url must be a string");
  const key = pickRandomKey(parseKeyList(env.PUREMD_API_KEYS));
  if (!key) return configError("PUREMD_API_KEYS is not configured");
  let target: URL;
  try { target = assertHttpUrl((args as { url: string }).url); } catch (error) { return validationError(error instanceof Error ? error.message : String(error)); }
  const pureUrl = `https://pure.md/${target.href.replace(/^https?:\/\//, "")}`;
  const response = await fetch(pureUrl, { headers: { authorization: `Bearer ${key}`, "x-api-key": key, accept: "text/markdown,text/plain,application/json" } });
  const content = await response.text();
  if (!response.ok) return upstreamError(`Pure.md returned ${response.status}: ${content}`, response.status);
  return { ok: true, data: { url: target.toString(), content, format: (args as { format?: unknown }).format ?? "markdown" } };
}
```

- [ ] **Step 7: Modify `src/mcp/router.ts` to dispatch external tools**

Add imports:

```ts
import { handleTavilyExtract, handleTavilySearch } from "../tools/external/tavily";
import { handleContext7QueryDocs, handleContext7Resolve } from "../tools/external/context7";
import { handleUnsplashSearch } from "../tools/external/unsplash";
import { handlePuremdExtract } from "../tools/external/puremd";
```

Add cases inside `dispatchTool` before the fallback:

```ts
if (name === "tavily.search") return handleTavilySearch(args, env);
if (name === "tavily.extract") return handleTavilyExtract(args, env);
if (name === "context7.resolve-library-id") return handleContext7Resolve(args, env);
if (name === "context7.query-docs") return handleContext7QueryDocs(args, env);
if (name === "unsplash.search_photos") return handleUnsplashSearch(args, env);
if (name === "puremd.extract") return handlePuremdExtract(args, env);
```

- [ ] **Step 8: Run external tests**

Run: `npx vitest run tests/tools/external.test.ts`

Expected: PASS.

- [ ] **Step 9: Run all existing tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 10: Commit external tools**

```bash
git add src tests
git commit -m "feat: add key-gated external MCP tools"
```

---

### Task 6: Add devutils subset

**Files:**
- Create: `src/tools/devutils/base64.ts`
- Create: `src/tools/devutils/hash.ts`
- Create: `src/tools/devutils/uuid.ts`
- Create: `src/tools/devutils/jwt.ts`
- Create: `src/tools/devutils/json-tools.ts`
- Create: `src/tools/devutils/regex.ts`
- Create: `src/tools/devutils/url-parse.ts`
- Create: `src/tools/devutils/timestamp.ts`
- Create: `src/tools/devutils/ip-tools.ts`
- Create: `src/tools/devutils/text.ts`
- Modify: `src/mcp/router.ts`
- Create: `tests/tools/devutils.test.ts`

- [ ] **Step 1: Write failing devutils tests**

```ts
import { describe, expect, it } from "vitest";
import { handleBase64Encode, handleBase64Decode } from "../../src/tools/devutils/base64";
import { handleJsonValidate } from "../../src/tools/devutils/json-tools";
import { handleUrlParse } from "../../src/tools/devutils/url-parse";
import { handleIpValidate } from "../../src/tools/devutils/ip-tools";

describe("devutils", () => {
  it("encodes and decodes base64", async () => {
    const encoded = await handleBase64Encode({ text: "hello" });
    expect(encoded.ok).toBe(true);
    if (encoded.ok) expect(encoded.data).toEqual({ result: "aGVsbG8=" });
    const decoded = await handleBase64Decode({ text: "aGVsbG8=" });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.data).toEqual({ result: "hello" });
  });

  it("validates JSON", async () => {
    const result = await handleJsonValidate({ text: "{\"a\":1}" });
    expect(result.ok).toBe(true);
  });

  it("parses URL", async () => {
    const result = await handleUrlParse({ url: "https://example.com:8443/a?b=c#d" });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as any).hostname).toBe("example.com");
  });

  it("validates IPv4", async () => {
    const result = await handleIpValidate({ ip: "192.168.1.1" });
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.data as any).valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing devutils tests**

Run: `npx vitest run tests/tools/devutils.test.ts`

Expected: FAIL with missing devutils modules.

- [ ] **Step 3: Create `src/tools/devutils/base64.ts`**

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

function requireText(args: unknown): string | undefined {
  return args && typeof args === "object" && typeof (args as { text?: unknown }).text === "string" ? (args as { text: string }).text : undefined;
}

export async function handleBase64Encode(args: unknown): Promise<ToolExecutionResult> {
  const text = requireText(args);
  if (text === undefined) return validationError("text must be a string");
  return { ok: true, data: { result: btoa(unescape(encodeURIComponent(text))) } };
}

export async function handleBase64Decode(args: unknown): Promise<ToolExecutionResult> {
  const text = requireText(args);
  if (text === undefined) return validationError("text must be a string");
  try { return { ok: true, data: { result: decodeURIComponent(escape(atob(text))) } }; } catch { return validationError("Invalid base64 text"); }
}
```

- [ ] **Step 4: Create `src/tools/devutils/hash.ts`**

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleHash(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { text?: unknown; algorithm?: unknown } | undefined;
  if (!input || typeof input.text !== "string") return validationError("text must be a string");
  const algorithm = input.algorithm === undefined ? "SHA-256" : String(input.algorithm).toUpperCase().replace("SHA", "SHA-");
  if (!["SHA-1", "SHA-256", "SHA-384", "SHA-512"].includes(algorithm)) return validationError("algorithm must be SHA-1, SHA-256, SHA-384, or SHA-512");
  const digest = await crypto.subtle.digest(algorithm, new TextEncoder().encode(input.text));
  return { ok: true, data: { algorithm, hex: [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("") } };
}
```

- [ ] **Step 5: Create `src/tools/devutils/uuid.ts`**

```ts
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleUuid(): Promise<ToolExecutionResult> {
  return { ok: true, data: { uuid: crypto.randomUUID() } };
}
```

- [ ] **Step 6: Create `src/tools/devutils/jwt.ts`**

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

function decodePart(part: string): unknown {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

export async function handleJwtDecode(args: unknown): Promise<ToolExecutionResult> {
  const token = (args as { token?: unknown } | undefined)?.token;
  if (typeof token !== "string") return validationError("token must be a string");
  const parts = token.split(".");
  if (parts.length < 2) return validationError("JWT must contain at least header and payload");
  try { return { ok: true, data: { header: decodePart(parts[0]!), payload: decodePart(parts[1]!), signature_present: parts.length === 3 } }; } catch { return validationError("Invalid JWT encoding"); }
}
```

- [ ] **Step 7: Create `src/tools/devutils/json-tools.ts`**

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleJsonValidate(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  try { return { ok: true, data: { valid: true, value: JSON.parse(text) as unknown } }; } catch (error) { return validationError(error instanceof Error ? error.message : String(error)); }
}

export async function handleJsonFormat(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { text?: unknown; minify?: unknown } | undefined;
  if (!input || typeof input.text !== "string") return validationError("text must be a string");
  try { const value = JSON.parse(input.text) as unknown; return { ok: true, data: { result: input.minify === true ? JSON.stringify(value) : JSON.stringify(value, null, 2) } }; } catch (error) { return validationError(error instanceof Error ? error.message : String(error)); }
}
```

- [ ] **Step 8: Create `regex`, `url-parse`, `timestamp`, `ip-tools`, and `text` devutils modules**

`src/tools/devutils/regex.ts`:

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleRegexTest(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { pattern?: unknown; text?: unknown; flags?: unknown } | undefined;
  if (!input || typeof input.pattern !== "string" || typeof input.text !== "string") return validationError("pattern and text must be strings");
  try { const regex = new RegExp(input.pattern, typeof input.flags === "string" ? input.flags : "g"); return { ok: true, data: { matches: [...input.text.matchAll(regex)].map((match) => ({ match: match[0], index: match.index })) } }; } catch (error) { return validationError(error instanceof Error ? error.message : String(error)); }
}
```

`src/tools/devutils/url-parse.ts`:

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleUrlParse(args: unknown): Promise<ToolExecutionResult> {
  const raw = (args as { url?: unknown } | undefined)?.url;
  if (typeof raw !== "string") return validationError("url must be a string");
  try { const url = new URL(raw); return { ok: true, data: { protocol: url.protocol, username: url.username, password: url.password, hostname: url.hostname, port: url.port, pathname: url.pathname, search: url.search, searchParams: Object.fromEntries(url.searchParams), hash: url.hash } }; } catch (error) { return validationError(error instanceof Error ? error.message : String(error)); }
}
```

`src/tools/devutils/timestamp.ts`:

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleTimestampConvert(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { value?: unknown } | undefined;
  if (!input || (typeof input.value !== "string" && typeof input.value !== "number")) return validationError("value must be a string or number");
  const date = typeof input.value === "number" ? new Date(input.value * 1000) : new Date(input.value);
  if (!Number.isFinite(date.getTime())) return validationError("Invalid date or timestamp");
  return { ok: true, data: { iso: date.toISOString(), unix: Math.floor(date.getTime() / 1000) } };
}
```

`src/tools/devutils/ip-tools.ts`:

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleIpValidate(args: unknown): Promise<ToolExecutionResult> {
  const ip = (args as { ip?: unknown } | undefined)?.ip;
  if (typeof ip !== "string") return validationError("ip must be a string");
  const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return { ok: true, data: { valid: false, version: null } };
  const parts = match.slice(1).map(Number);
  const valid = parts.every((part) => part >= 0 && part <= 255);
  return { ok: true, data: { valid, version: valid ? "IPv4" : null, is_private: valid && (parts[0] === 10 || (parts[0] === 172 && parts[1]! >= 16 && parts[1]! <= 31) || (parts[0] === 192 && parts[1] === 168)) } };
}

export async function handleCidrCalculate(args: unknown): Promise<ToolExecutionResult> {
  const cidr = (args as { cidr?: unknown } | undefined)?.cidr;
  if (typeof cidr !== "string") return validationError("cidr must be a string");
  const [ip, prefixText] = cidr.split("/");
  const prefix = Number(prefixText);
  if (!ip || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return validationError("Invalid IPv4 CIDR");
  return { ok: true, data: { cidr, prefix_length: prefix } };
}
```

`src/tools/devutils/text.ts`:

```ts
import { validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

export async function handleTextStats(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { ok: true, data: { characters: text.length, words, lines: text.split(/\r?\n/).length } };
}

export async function handleSlugify(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  return { ok: true, data: { slug: text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") } };
}

export async function handleCaseConvert(args: unknown): Promise<ToolExecutionResult> {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string") return validationError("text must be a string");
  const words = text.trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  return { ok: true, data: { snake_case: words.map((word) => word.toLowerCase()).join("_"), kebab_case: words.map((word) => word.toLowerCase()).join("-"), camelCase: words.map((word, index) => index === 0 ? word.toLowerCase() : word[0]!.toUpperCase() + word.slice(1).toLowerCase()).join("") } };
}
```

- [ ] **Step 9: Modify `src/mcp/router.ts` to dispatch devutils tools**

Add these imports near the existing native/external tool imports in `src/mcp/router.ts`:

```ts
import { handleBase64Decode, handleBase64Encode } from "../tools/devutils/base64";
import { handleHash } from "../tools/devutils/hash";
import { handleUuid } from "../tools/devutils/uuid";
import { handleJwtDecode } from "../tools/devutils/jwt";
import { handleJsonFormat, handleJsonValidate } from "../tools/devutils/json-tools";
import { handleRegexTest } from "../tools/devutils/regex";
import { handleUrlParse } from "../tools/devutils/url-parse";
import { handleTimestampConvert } from "../tools/devutils/timestamp";
import { handleCidrCalculate, handleIpValidate } from "../tools/devutils/ip-tools";
import { handleCaseConvert, handleSlugify, handleTextStats } from "../tools/devutils/text";
```

Then add these exact cases in `dispatchTool`:

```ts
if (name === "devutils.base64_encode") return handleBase64Encode(args);
if (name === "devutils.base64_decode") return handleBase64Decode(args);
if (name === "devutils.hash") return handleHash(args);
if (name === "devutils.uuid") return handleUuid();
if (name === "devutils.jwt_decode") return handleJwtDecode(args);
if (name === "devutils.json_format") return handleJsonFormat(args);
if (name === "devutils.json_validate") return handleJsonValidate(args);
if (name === "devutils.regex_test") return handleRegexTest(args);
if (name === "devutils.url_parse") return handleUrlParse(args);
if (name === "devutils.timestamp_convert") return handleTimestampConvert(args);
if (name === "devutils.ip_validate") return handleIpValidate(args);
if (name === "devutils.cidr_calculate") return handleCidrCalculate(args);
if (name === "devutils.text_stats") return handleTextStats(args);
if (name === "devutils.slugify") return handleSlugify(args);
if (name === "devutils.case_convert") return handleCaseConvert(args);
```

- [ ] **Step 10: Run devutils tests**

Run: `npx vitest run tests/tools/devutils.test.ts`

Expected: PASS.

- [ ] **Step 11: Run all tests and typecheck**

Run: `npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 12: Commit devutils tools**

```bash
git add src tests
git commit -m "feat: add stateless devutils MCP tools"
```

---

### Task 7: Add README, deployment notes, and roadmap

**Files:**
- Create: `README.md`
- Modify: `wrangler.jsonc` if secret names need `secrets.required` after real deployment testing

- [ ] **Step 1: Create README with installation and env instructions**

```md
# Cloudflare Workers Multi-MCP Server

Remote HTTP MCP server for Cloudflare Workers.

## Endpoint

Deploy the Worker and configure your MCP client with:

    https://<worker-domain>/mcp

Only `/mcp` is supported. Other paths return `404`.

## Scope

Implemented first-release tools:

- Native: `weather`, `webfetch`, `calc`, `time`, `ip`
- Tavily HTTP API: `tavily.search`, `tavily.extract`
- Context7: `context7.resolve-library-id`, `context7.query-docs`
- Unsplash: `unsplash.search_photos`
- Pure.md: `puremd.extract`
- Devutils subset: `devutils.*`

Roadmap, not implemented in first release:

- `news.*` from newsmcp
- `domain.*` from agent-domain-service-mcp

## Environment variables

Use Cloudflare secrets for API keys:

    npx wrangler secret put TAVILY_API_KEYS
    npx wrangler secret put CONTEXT7_API_KEYS
    npx wrangler secret put UNSPLASH_ACCESS_KEYS
    npx wrangler secret put PUREMD_API_KEYS

Each value accepts one key or comma-separated keys. A random key is selected per request.

## Development

    npm install
    npm test
    npm run typecheck
    npm run dev

## Deploy

    npm run deploy
```

- [ ] **Step 2: Run documentation check**

Run: `npm test && npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Commit README**

```bash
git add README.md wrangler.jsonc
git commit -m "docs: add deployment and roadmap notes"
```

---

### Task 8: Final local verification

**Files:**
- No source changes unless verification fails.

- [ ] **Step 1: Run full test suite**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 3: Run Wrangler dry dev smoke test**

Run: `npm run dev`

Expected: Wrangler starts and prints a local URL. Keep it running in a background shell for manual smoke checks.

- [ ] **Step 4: Smoke test initialize**

Run:

```bash
curl -s http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
```

Expected: JSON response contains `"name":"cloudflare-multi-mcp"` and `"tools":{}`.

- [ ] **Step 5: Smoke test tools/list without keys**

Run:

```bash
curl -s http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Expected:

- Includes `weather`, `webfetch`, `calc`, `time`, `ip`, and `devutils.*`.
- Does not include `tavily.*`, `context7.*`, `unsplash.*`, `puremd.*`, `news.*`, or `domain.*`.

- [ ] **Step 6: Smoke test calc tool**

Run:

```bash
curl -s http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calc","arguments":{"expression":"sqrt(9)+sin(pi/2)"}}}'
```

Expected: response `result.content[0].text` contains `4`.

- [ ] **Step 7: Commit verification-only fixes if any**

If verification required changes, commit them:

```bash
git add src tests README.md package.json package-lock.json wrangler.jsonc
git commit -m "fix: address local MCP verification issues"
```

If no changes were needed, do not create an empty commit.

---

## Self-review checklist for the implementer

Before claiming completion:

- [ ] `/mcp` is the only business route.
- [ ] `GET /mcp` and `DELETE /mcp` return 405.
- [ ] Other paths return 404.
- [ ] `initialize`, `notifications/initialized`, `tools/list`, and `tools/call` work.
- [ ] `webfetch` supports GET and POST.
- [ ] Tavily uses `https://api.tavily.com/search` and `https://api.tavily.com/extract`, not Tavily remote MCP.
- [ ] Missing env keys hide the associated tools.
- [ ] `news.*` and `domain.*` do not appear in `tools/list`.
- [ ] No persistent storage is used.
- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] README documents secrets and roadmap.
