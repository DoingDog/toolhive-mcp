# Paper Search + Manifest-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manifest-first Cloudflare Workers MCP server that unifies tool metadata, adds production guardrails and operational endpoints, and delivers a broad paper-search toolset within the approved free, stateless, bounded-latency constraints.

**Architecture:** Introduce a single manifest layer that defines tool metadata, aliases, env requirements, dispatch handlers, docs metadata, and output contracts once, then derive registry and router behavior from it. Add a shared guarded upstream HTTP layer and operational endpoints in the Worker. Implement paper providers as focused modules with normalized result shapes and bounded multi-provider aggregation.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest, Wrangler, html-to-md

---

## File Structure

### Existing files to modify

- `src/mcp/tool-registry.ts` — replace hand-authored arrays as the primary source with manifest-derived exports
- `src/mcp/router.ts` — replace manual switch dispatch with manifest-driven dispatch and add alias-safe routing
- `src/worker.ts` — add `/healthz`, `/readyz`, `/version` beside `/mcp`
- `src/lib/http.ts` — keep URL/header helpers and add shared size/timeout helpers if retained here
- `src/lib/upstream.ts` — evolve from key retry helper into guarded upstream execution path
- `package.json` — align package version metadata and add any generation/test script if truly needed
- `README.md` — regenerate tool table and runtime metadata from the manifest output
- `tests/mcp/tool-registry.test.ts` — replace registry assumptions with manifest-derived expectations
- `tests/tools/native.test.ts` — cover guardrail metadata and endpoint behavior where applicable
- `tests/tools/external.test.ts` — cover guarded fetch behavior, provider normalization, and paper tools

### New files to create

- `src/mcp/tool-manifest.ts` — central manifest entry definitions and manifest helper types
- `src/mcp/tool-catalog.ts` — manifest-to-registry and manifest-to-dispatch projection helpers
- `src/lib/response-metadata.ts` — compact result metadata helpers (`truncated`, `content_length`, `provider_used`, `cached`, `partial`)
- `src/tools/paper/types.ts` — normalized paper result types and provider result contracts
- `src/tools/paper/normalize.ts` — DOI/arXiv/title-based merge and normalization helpers
- `src/tools/paper/providers/unpaywall.ts` — Unpaywall lookup using rotating emails
- `src/tools/paper/providers/crossref.ts` — Crossref search/detail adapter
- `src/tools/paper/providers/openalex.ts` — OpenAlex search/detail adapter
- `src/tools/paper/providers/arxiv.ts` — arXiv adapter
- `src/tools/paper/providers/pubmed.ts` — PubMed or Europe PMC adapter
- `src/tools/paper/search.ts` — top-level paper tool handlers
- `tests/mcp/worker-endpoints.test.ts` — `/healthz`, `/readyz`, `/version`
- `tests/tools/paper.test.ts` — provider normalization, merge, and tool handlers
- `tests/helpers/fetch.ts` — shared fetch mocking helpers if test duplication grows

### Files intentionally not touched unless required by failing tests

- `src/tools/external/domain.ts` — domain tools remain out of surface
- existing devutils modules — only manifest wiring changes, no behavior refactor unless tests require it

---

### Task 1: Add manifest core types and projections

**Files:**
- Create: `src/mcp/tool-manifest.ts`
- Create: `src/mcp/tool-catalog.ts`
- Modify: `src/mcp/schema.ts`
- Test: `tests/mcp/tool-registry.test.ts`

- [ ] **Step 1: Write the failing manifest projection test**

```ts
it("builds enabled tools and dispatch entries from manifest definitions", () => {
  const tools = getEnabledTools({ TAVILY_API_KEYS: "tvly" });
  const tavily = tools.find((tool) => tool.name === "tavily_search");
  const weather = tools.find((tool) => tool.name === "weather");

  expect(weather).toBeDefined();
  expect(tavily).toBeDefined();
  expect(tavily?.inputSchema.required).toEqual(["query"]);
  expect(findEnabledTool("tavily.search", { TAVILY_API_KEYS: "tvly" })?.name).toBe("tavily_search");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp/tool-registry.test.ts`
Expected: FAIL because manifest helpers and manifest-driven projections do not exist yet.

- [ ] **Step 3: Add manifest entry types and projection helpers**

```ts
// src/mcp/tool-manifest.ts
import type { ToolExecutionResult } from "./result";
import type { JsonSchema } from "./schema";
import type { ToolContext } from "../tools/types";

export type ToolHandler = (args: unknown, context: ToolContext) => Promise<ToolExecutionResult> | ToolExecutionResult;

export type ToolManifestEntry = {
  name: string;
  aliases?: string[];
  description: string;
  inputSchema: JsonSchema;
  category: "native" | "devutils" | "external" | "paper";
  envRequirement?: string;
  whenToUse?: string;
  whenNotToUse?: string;
  outputShape?: string;
  limits?: {
    timeoutMs?: number;
    maxBytes?: number;
  };
  handler: ToolHandler;
};
```

```ts
// src/mcp/tool-catalog.ts
import { hasKeys, type AppEnv } from "../lib/env";
import type { ToolDefinition } from "./schema";
import type { ToolManifestEntry } from "./tool-manifest";

export function buildToolDefinitions(manifest: ToolManifestEntry[], env: AppEnv): ToolDefinition[] {
  return manifest
    .filter((entry) => !entry.envRequirement || hasKeys(env, entry.envRequirement))
    .map(({ handler, aliases, category, whenToUse, whenNotToUse, outputShape, limits, ...tool }) => tool);
}

export function buildAliasMap(manifest: ToolManifestEntry[]): Map<string, string> {
  return new Map(
    manifest.flatMap((entry) => [entry.name, ...(entry.aliases ?? [])].map((alias) => [alias, entry.name] as const))
  );
}

export function buildHandlerMap(manifest: ToolManifestEntry[]): Map<string, ToolManifestEntry["handler"]> {
  return new Map(manifest.map((entry) => [entry.name, entry.handler]));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/mcp/tool-registry.test.ts`
Expected: PASS for the new manifest projection test, with existing tests still red until migration is complete.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tool-manifest.ts src/mcp/tool-catalog.ts src/mcp/schema.ts tests/mcp/tool-registry.test.ts
git commit -m "refactor: add manifest core for tool catalog"
```

### Task 2: Migrate registry to manifest-first source of truth

**Files:**
- Modify: `src/mcp/tool-registry.ts`
- Modify: `src/mcp/tool-manifest.ts`
- Test: `tests/mcp/tool-registry.test.ts`

- [ ] **Step 1: Write the failing registry migration test**

```ts
it("exposes only manifest-derived canonical names in tools/list", () => {
  const names = getEnabledTools({ TAVILY_API_KEYS: "tvly-a" }).map((tool) => tool.name);

  expect(names).toContain("weather");
  expect(names).toContain("tavily_search");
  expect(names).not.toContain("tavily.search");
  expect(names.every((name) => !name.includes("-"))).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp/tool-registry.test.ts`
Expected: FAIL because the registry still hand-assembles arrays and not all alias rules flow through one manifest.

- [ ] **Step 3: Replace array-based registry with manifest definitions**

```ts
// src/mcp/tool-registry.ts
import type { AppEnv } from "../lib/env";
import { buildAliasMap, buildToolDefinitions } from "./tool-catalog";
import { toolManifest } from "./tool-manifest";

const aliasMap = buildAliasMap(toolManifest);

export function canonicalizeToolName(name: string): string {
  return aliasMap.get(name) ?? name;
}

export function getEnabledTools(env: AppEnv, options: { disabledTools?: string[] } = {}) {
  const tools = buildToolDefinitions(toolManifest, env);
  if (!options.disabledTools?.length) {
    return tools;
  }
  return tools.filter((tool) => !matchesDisabledTool(tool.name, options.disabledTools!));
}

export function findEnabledTool(name: string, env: AppEnv) {
  const canonicalName = canonicalizeToolName(name);
  return getEnabledTools(env).find((tool) => tool.name === canonicalName);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/mcp/tool-registry.test.ts`
Expected: PASS with prior registry expectations preserved under the manifest-backed implementation.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/tool-registry.ts src/mcp/tool-manifest.ts tests/mcp/tool-registry.test.ts
git commit -m "refactor: migrate tool registry to manifest first"
```

### Task 3: Migrate router dispatch to manifest-driven handlers

**Files:**
- Modify: `src/mcp/router.ts`
- Modify: `src/mcp/tool-manifest.ts`
- Test: `tests/tools/native.test.ts`
- Test: `tests/tools/external.test.ts`

- [ ] **Step 1: Write the failing dispatch test**

```ts
it("dispatches through the manifest handler map for canonical and legacy aliases", async () => {
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "tavily.search",
        arguments: { query: "mcp", max_results: 3 }
      }
    },
    { TAVILY_API_KEYS: "tvly-test" },
    new Request("https://example.com/mcp", { method: "POST" })
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    result: { content: [{ type: "text", text: expect.stringContaining("results") }] }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts`
Expected: FAIL because dispatch still depends on a hard-coded switch.

- [ ] **Step 3: Replace switch dispatch with handler map lookup**

```ts
// src/mcp/router.ts
import { buildHandlerMap } from "./tool-catalog";
import { toolManifest } from "./tool-manifest";

const handlerMap = buildHandlerMap(toolManifest);

async function dispatchTool(name: string, args: unknown, context: ToolContext) {
  const canonicalName = canonicalizeToolName(name);
  const handler = handlerMap.get(canonicalName);
  if (!handler) {
    return internalError(`Tool handler not implemented: ${name}`);
  }
  return handler(args, context);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts`
Expected: PASS with canonical and legacy alias routing still working.

- [ ] **Step 5: Commit**

```bash
git add src/mcp/router.ts src/mcp/tool-manifest.ts tests/tools/native.test.ts tests/tools/external.test.ts
git commit -m "refactor: derive router dispatch from manifest"
```

### Task 4: Add guarded upstream fetch metadata helpers

**Files:**
- Create: `src/lib/response-metadata.ts`
- Modify: `src/lib/upstream.ts`
- Modify: `src/lib/http.ts`
- Test: `tests/tools/native.test.ts`
- Test: `tests/tools/external.test.ts`

- [ ] **Step 1: Write the failing guardrail test**

```ts
it("adds truncated and content_length metadata when a response exceeds the size budget", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("x".repeat(20), { status: 200, headers: { "content-type": "text/plain" } }))
  );

  const result = await handleWebfetch({ url: "https://example.com/hello" }, context);

  expect(result).toEqual({
    ok: true,
    data: expect.objectContaining({
      truncated: true,
      content_length: 20,
      provider_used: "webfetch"
    })
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts`
Expected: FAIL because responses do not yet emit normalized metadata and fetches are not centrally guarded.

- [ ] **Step 3: Add bounded upstream execution and metadata helpers**

```ts
// src/lib/response-metadata.ts
export function withResponseMetadata<T extends Record<string, unknown>>(
  data: T,
  meta: {
    provider_used: string;
    content_length?: number;
    truncated?: boolean;
    cached?: boolean;
    partial?: boolean;
  }
) {
  return {
    ...data,
    provider_used: meta.provider_used,
    content_length: meta.content_length ?? null,
    truncated: meta.truncated ?? false,
    cached: meta.cached ?? false,
    partial: meta.partial ?? false
  };
}
```

```ts
// src/lib/upstream.ts
export async function fetchWithGuards(input: string, init: RequestInit = {}, options: { timeoutMs: number; maxBytes: number }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    const contentLength = text.length;
    const truncated = contentLength > options.maxBytes;
    return {
      response,
      text: truncated ? text.slice(0, options.maxBytes) : text,
      contentLength,
      truncated
    };
  } finally {
    clearTimeout(timeout);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts`
Expected: PASS for new metadata and size/timeout coverage, with adjusted callers using the shared helper.

- [ ] **Step 5: Commit**

```bash
git add src/lib/response-metadata.ts src/lib/upstream.ts src/lib/http.ts tests/tools/native.test.ts tests/tools/external.test.ts
git commit -m "feat: add guarded upstream fetch helpers"
```

### Task 5: Update webfetch and selected current tools to use compact metadata

**Files:**
- Modify: `src/tools/native/webfetch.ts`
- Modify: `src/tools/external/exa.ts`
- Modify: `src/tools/external/iplookup.ts`
- Modify: `src/tools/external/news.ts`
- Test: `tests/tools/native.test.ts`
- Test: `tests/tools/external.test.ts`

- [ ] **Step 1: Write the failing compact-output test**

```ts
it("keeps raw payloads opt-in and emits compact metadata by default", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ events: [] })));

  const result = await handleNewsGetNews({ topics: "ai" }, {});

  expect(result).toEqual({
    ok: true,
    data: expect.objectContaining({
      events: [],
      provider_used: "news",
      cached: false,
      partial: false
    })
  });
  if (result.ok) {
    expect(result.data).not.toHaveProperty("raw");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts`
Expected: FAIL because current external tools return inconsistent metadata and some always include bulky raw fields.

- [ ] **Step 3: Update current tools to emit compact defaults**

```ts
// pattern used in current tool handlers
return {
  ok: true,
  data: withResponseMetadata(
    {
      events: payload.events ?? []
    },
    {
      provider_used: "news",
      content_length: JSON.stringify(payload).length,
      truncated: false,
      cached: false,
      partial: false
    }
  )
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts`
Expected: PASS with existing behavior preserved where tests require it and compact metadata present in updated responses.

- [ ] **Step 5: Commit**

```bash
git add src/tools/native/webfetch.ts src/tools/external/exa.ts src/tools/external/iplookup.ts src/tools/external/news.ts tests/tools/native.test.ts tests/tools/external.test.ts
git commit -m "feat: normalize tool output metadata"
```

### Task 6: Add operational endpoints to the Worker

**Files:**
- Modify: `src/worker.ts`
- Modify: `package.json`
- Create: `tests/mcp/worker-endpoints.test.ts`

- [ ] **Step 1: Write the failing endpoint test**

```ts
it("serves healthz readyz and version endpoints", async () => {
  const worker = (await import("../../src/worker")).default;

  await expect(worker.fetch(new Request("https://example.com/healthz"), {} as never, {} as never)).resolves.toMatchObject({ status: 200 });
  await expect(worker.fetch(new Request("https://example.com/readyz"), {} as never, {} as never)).resolves.toMatchObject({ status: 200 });
  await expect(worker.fetch(new Request("https://example.com/version"), {} as never, {} as never)).resolves.toMatchObject({ status: 200 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp/worker-endpoints.test.ts`
Expected: FAIL because `src/worker.ts` only serves `/mcp`.

- [ ] **Step 3: Add endpoint handling in the Worker**

```ts
// src/worker.ts
import packageJson from "../package.json";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

if (url.pathname === "/healthz") {
  return json({ ok: true, service: "mcp", status: "healthy" });
}
if (url.pathname === "/readyz") {
  return json({ ok: true, status: "ready", version: packageJson.version });
}
if (url.pathname === "/version") {
  return json({
    package_name: packageJson.name,
    version: packageJson.version,
    worker_name: env.WORKER_NAME ?? "cloudflare-workers-multi-mcp"
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/mcp/worker-endpoints.test.ts`
Expected: PASS with JSON responses from all three endpoints.

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts package.json tests/mcp/worker-endpoints.test.ts
git commit -m "feat: add health readiness and version endpoints"
```

### Task 7: Align package and runtime version metadata

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Test: `tests/mcp/worker-endpoints.test.ts`

- [ ] **Step 1: Write the failing version alignment test**

```ts
it("returns the package version from the version endpoint", async () => {
  const worker = (await import("../../src/worker")).default;
  const response = await worker.fetch(new Request("https://example.com/version"), {} as never, {} as never);
  const body = await response.json() as { version: string };

  expect(body.version).toBe("0.3.0");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp/worker-endpoints.test.ts`
Expected: FAIL because `package.json` still says `0.1.0` and runtime metadata is not aligned.

- [ ] **Step 3: Update version metadata and README references**

```json
{
  "name": "toolhive-mcp",
  "version": "0.3.0",
  "private": true,
  "type": "module"
}
```

```md
## Version

- package version: `0.3.0`
- worker runtime endpoint: `/version`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/mcp/worker-endpoints.test.ts`
Expected: PASS with `version` endpoint reporting `0.3.0`.

- [ ] **Step 5: Commit**

```bash
git add package.json README.md tests/mcp/worker-endpoints.test.ts
git commit -m "docs: align package and runtime version metadata"
```

### Task 8: Add Unpaywall rotating email support

**Files:**
- Create: `src/tools/paper/providers/unpaywall.ts`
- Create: `src/tools/paper/types.ts`
- Create: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing Unpaywall test**

```ts
it("rotates PAPER_SEARCH_MCP_UNPAYWALL_EMAILS and maps OA fields", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        doi: "10.1000/test",
        is_oa: true,
        best_oa_location: { url: "https://example.com/paper.pdf", url_for_pdf: "https://example.com/paper.pdf" }
      })
    )
  );
  vi.spyOn(Math, "random").mockReturnValue(0);

  const result = await lookupUnpaywallByDoi("10.1000/test", { PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com,b@example.com" });

  expect(result).toEqual({
    doi: "10.1000/test",
    open_access: true,
    provider: "unpaywall",
    download_links: ["https://example.com/paper.pdf"]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: FAIL because the paper provider module does not exist.

- [ ] **Step 3: Implement Unpaywall email parsing and lookup**

```ts
// src/tools/paper/providers/unpaywall.ts
import { parseKeyList, pickRandomKey } from "../../../src/lib/keys";

export async function lookupUnpaywallByDoi(doi: string, env: Record<string, string | undefined>) {
  const emails = parseKeyList(env.PAPER_SEARCH_MCP_UNPAYWALL_EMAILS);
  const email = pickRandomKey(emails);
  if (!email) {
    throw new Error("PAPER_SEARCH_MCP_UNPAYWALL_EMAILS is not configured");
  }

  const response = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(email)}`);
  const payload = await response.json() as {
    doi?: string;
    is_oa?: boolean;
    best_oa_location?: { url?: string; url_for_pdf?: string } | null;
  };

  return {
    doi: payload.doi ?? doi,
    open_access: payload.is_oa ?? false,
    provider: "unpaywall" as const,
    download_links: [payload.best_oa_location?.url_for_pdf, payload.best_oa_location?.url].filter(Boolean) as string[]
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: PASS with rotating email selection and normalized OA result mapping.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/providers/unpaywall.ts src/tools/paper/types.ts tests/tools/paper.test.ts
git commit -m "feat: add unpaywall provider with rotating emails"
```

### Task 9: Add Crossref and OpenAlex provider adapters

**Files:**
- Create: `src/tools/paper/providers/crossref.ts`
- Create: `src/tools/paper/providers/openalex.ts`
- Modify: `src/tools/paper/types.ts`
- Test: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing provider normalization test**

```ts
it("normalizes Crossref and OpenAlex search hits into a shared paper shape", async () => {
  const crossref = normalizeCrossrefWork({ DOI: "10.1000/test", title: ["Paper"], published: { "date-parts": [[2024]] } });
  const openalex = normalizeOpenAlexWork({ doi: "https://doi.org/10.1000/test", title: "Paper", publication_year: 2024 });

  expect(crossref).toMatchObject({ doi: "10.1000/test", title: "Paper", year: 2024, provider: "crossref" });
  expect(openalex).toMatchObject({ doi: "10.1000/test", title: "Paper", year: 2024, provider: "openalex" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: FAIL because the provider normalizers do not exist.

- [ ] **Step 3: Implement Crossref and OpenAlex adapters**

```ts
// shared normalized shape used by both adapters
export type NormalizedPaper = {
  title: string | null;
  authors: string[];
  abstract: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  arxiv_id: string | null;
  paper_id: string | null;
  source_links: string[];
  download_links: string[];
  open_access: boolean | null;
  citation_count: number | null;
  reference_count: number | null;
  provider: string;
};
```

```ts
// normalizeCrossrefWork and normalizeOpenAlexWork should each return the shared shape
const doi = raw.DOI?.toLowerCase() ?? null;
return {
  title,
  authors,
  abstract: null,
  year,
  venue,
  doi,
  arxiv_id: null,
  paper_id: doi,
  source_links: doi ? [`https://doi.org/${doi}`] : [],
  download_links: [],
  open_access: null,
  citation_count: null,
  reference_count: null,
  provider: "crossref"
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: PASS with shared normalized paper shapes from both providers.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/providers/crossref.ts src/tools/paper/providers/openalex.ts src/tools/paper/types.ts tests/tools/paper.test.ts
git commit -m "feat: add crossref and openalex paper providers"
```

### Task 10: Add arXiv and PubMed/Europe PMC provider adapters

**Files:**
- Create: `src/tools/paper/providers/arxiv.ts`
- Create: `src/tools/paper/providers/pubmed.ts`
- Modify: `src/tools/paper/types.ts`
- Test: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing provider parsing test**

```ts
it("normalizes arXiv and PubMed provider payloads", async () => {
  const arxiv = normalizeArxivEntry({ id: "http://arxiv.org/abs/2401.12345v1", title: " Paper ", summary: "Abstract" });
  const pubmed = normalizeEuropePmcResult({ id: "123", doi: "10.1000/test", title: "Paper", pubYear: "2024" });

  expect(arxiv).toMatchObject({ arxiv_id: "2401.12345", title: "Paper", provider: "arxiv" });
  expect(pubmed).toMatchObject({ doi: "10.1000/test", year: 2024, provider: "pubmed" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: FAIL because these provider modules do not exist.

- [ ] **Step 3: Implement arXiv and PubMed normalization helpers**

```ts
// arxiv id extraction
const arxivId = raw.id?.split("/").pop()?.replace(/v\d+$/, "") ?? null;

// europe pmc year extraction
const year = raw.pubYear ? Number.parseInt(raw.pubYear, 10) : null;
```

```ts
return {
  title,
  authors,
  abstract,
  year,
  venue: raw.journalTitle ?? null,
  doi: raw.doi?.toLowerCase() ?? null,
  arxiv_id: arxivId,
  paper_id: raw.id ?? raw.pmid ?? arxivId,
  source_links,
  download_links,
  open_access,
  citation_count: null,
  reference_count: null,
  provider: "arxiv"
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: PASS with normalized arXiv and PubMed/Europe PMC results.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/providers/arxiv.ts src/tools/paper/providers/pubmed.ts src/tools/paper/types.ts tests/tools/paper.test.ts
git commit -m "feat: add arxiv and pubmed paper providers"
```

### Task 11: Add paper merge and dedup normalization

**Files:**
- Create: `src/tools/paper/normalize.ts`
- Modify: `src/tools/paper/types.ts`
- Test: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing merge test**

```ts
it("merges provider records by DOI first then arxiv id then normalized title", () => {
  const merged = mergePaperResults([
    { doi: "10.1000/test", title: "Paper", authors: ["A"], provider: "crossref", source_links: [], download_links: [], abstract: null, year: 2024, venue: null, arxiv_id: null, paper_id: null, open_access: null, citation_count: null, reference_count: null },
    { doi: "10.1000/test", title: "Paper", authors: [], provider: "openalex", source_links: ["https://doi.org/10.1000/test"], download_links: ["https://example.com/paper.pdf"], abstract: "Abstract", year: 2024, venue: "Venue", arxiv_id: null, paper_id: null, open_access: true, citation_count: 10, reference_count: 8 }
  ]);

  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({
    doi: "10.1000/test",
    title: "Paper",
    abstract: "Abstract",
    open_access: true,
    download_links: ["https://example.com/paper.pdf"]
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: FAIL because there is no merge layer yet.

- [ ] **Step 3: Implement merge precedence helpers**

```ts
// src/tools/paper/normalize.ts
export function mergePaperResults(results: NormalizedPaper[]): NormalizedPaper[] {
  const merged = new Map<string, NormalizedPaper>();

  for (const result of results) {
    const key = result.doi ?? result.arxiv_id ?? normalizeTitleKey(result.title, result.year, result.authors[0] ?? null);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, result);
      continue;
    }
    merged.set(key, {
      ...existing,
      abstract: existing.abstract ?? result.abstract,
      venue: existing.venue ?? result.venue,
      open_access: existing.open_access ?? result.open_access,
      citation_count: existing.citation_count ?? result.citation_count,
      reference_count: existing.reference_count ?? result.reference_count,
      source_links: Array.from(new Set([...existing.source_links, ...result.source_links])),
      download_links: Array.from(new Set([...existing.download_links, ...result.download_links]))
    });
  }

  return [...merged.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: PASS with DOI-first merge behavior.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/normalize.ts src/tools/paper/types.ts tests/tools/paper.test.ts
git commit -m "feat: add paper normalization and dedup"
```

### Task 12: Add top-level paper tool handlers and manifest entries

**Files:**
- Create: `src/tools/paper/search.ts`
- Modify: `src/mcp/tool-manifest.ts`
- Modify: `src/mcp/tool-registry.ts`
- Test: `tests/tools/paper.test.ts`
- Test: `tests/mcp/tool-registry.test.ts`

- [ ] **Step 1: Write the failing paper tool surface test**

```ts
it("exposes paper tools with underscore canonical names only", () => {
  const names = getEnabledTools({ PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" }).map((tool) => tool.name);

  expect(names).toContain("paper_search");
  expect(names).toContain("paper_get_details");
  expect(names).toContain("paper_get_open_access");
  expect(names).not.toContain("paper-search");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts tests/mcp/tool-registry.test.ts`
Expected: FAIL because the paper tools are not yet registered.

- [ ] **Step 3: Implement paper tool handlers and manifest entries**

```ts
// src/tools/paper/search.ts
export async function handlePaperSearch(args: unknown, context: ToolContext) {
  const query = getString(args, "query");
  const [crossref, openalex, arxiv, pubmed] = await Promise.allSettled([
    searchCrossref(query),
    searchOpenAlex(query),
    searchArxiv(query),
    searchPubmed(query)
  ]);

  const results = mergePaperResults([
    ...fulfilled(crossref),
    ...fulfilled(openalex),
    ...fulfilled(arxiv),
    ...fulfilled(pubmed)
  ]);

  return {
    ok: true,
    data: withResponseMetadata(
      { results },
      {
        provider_used: "paper_search",
        partial: [crossref, openalex, arxiv, pubmed].some((entry) => entry.status === "rejected")
      }
    )
  };
}
```

```ts
// manifest entries
{
  name: "paper_search",
  aliases: [],
  description: "Search academic papers across free providers with normalized results.",
  category: "paper",
  envRequirement: "PAPER_SEARCH_MCP_UNPAYWALL_EMAILS",
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 20 } },
    required: ["query"],
    additionalProperties: false
  },
  handler: handlePaperSearch
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/paper.test.ts tests/mcp/tool-registry.test.ts`
Expected: PASS with paper tools visible only under underscore canonical names.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/search.ts src/mcp/tool-manifest.ts src/mcp/tool-registry.ts tests/tools/paper.test.ts tests/mcp/tool-registry.test.ts
git commit -m "feat: add paper tool surface"
```

### Task 13: Add paper detail, related, and open-access handlers with bounded partial success

**Files:**
- Modify: `src/tools/paper/search.ts`
- Modify: `src/tools/paper/providers/unpaywall.ts`
- Modify: `src/tools/paper/providers/crossref.ts`
- Modify: `src/tools/paper/providers/openalex.ts`
- Test: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing partial-success test**

```ts
it("returns partial true when one paper provider fails but details still resolve", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(Response.json({ results: [{ id: "https://openalex.org/W1", doi: "https://doi.org/10.1000/test", title: "Paper", publication_year: 2024 }] }))
    .mockRejectedValueOnce(new Error("crossref down"))
    .mockResolvedValueOnce(Response.json({ doi: "10.1000/test", is_oa: true, best_oa_location: { url_for_pdf: "https://example.com/paper.pdf" } }))
  );

  const result = await handlePaperGetDetails({ doi: "10.1000/test" }, { env: { PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" }, request: new Request("https://example.com/mcp") });

  expect(result).toEqual({
    ok: true,
    data: expect.objectContaining({ partial: true, open_access: true })
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: FAIL because detail/open-access handlers and partial metadata are incomplete.

- [ ] **Step 3: Implement bounded multi-provider detail handlers**

```ts
export async function handlePaperGetDetails(args: unknown, context: ToolContext) {
  const doi = getOptionalString(args, "doi");
  const arxivId = getOptionalString(args, "arxiv_id");

  const providers = await Promise.allSettled([
    doi ? lookupCrossrefByDoi(doi) : Promise.resolve(null),
    doi ? lookupOpenAlexByDoi(doi) : Promise.resolve(null),
    doi ? lookupUnpaywallByDoi(doi, context.env) : Promise.resolve(null),
    arxivId ? lookupArxivById(arxivId) : Promise.resolve(null)
  ]);

  const merged = mergePaperResults(fulfilledValues(providers).filter(Boolean));
  return {
    ok: true,
    data: withResponseMetadata(merged[0] ?? emptyPaperResult(), {
      provider_used: "paper_get_details",
      partial: providers.some((entry) => entry.status === "rejected")
    })
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/tools/paper.test.ts`
Expected: PASS with partial success surfaced when one provider fails.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/search.ts src/tools/paper/providers/unpaywall.ts src/tools/paper/providers/crossref.ts src/tools/paper/providers/openalex.ts tests/tools/paper.test.ts
git commit -m "feat: add bounded paper detail handlers"
```

### Task 14: Generate README tool table from manifest projection

**Files:**
- Modify: `README.md`
- Modify: `src/mcp/tool-manifest.ts`
- Optionally Modify: `package.json`
- Test: `tests/mcp/tool-registry.test.ts`

- [ ] **Step 1: Write the failing docs parity test**

```ts
it("keeps manifest and README tool table aligned for key canonical tools", async () => {
  const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");
  expect(readme).toContain("paper_search");
  expect(readme).toContain("weather");
  expect(readme).not.toContain("tavily.search");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/mcp/tool-registry.test.ts`
Expected: FAIL because README still reflects the old manually maintained surface.

- [ ] **Step 3: Regenerate README tool table from manifest data**

```md
## Features

Current release capabilities:

| Tool | Purpose | Env |
| --- | --- | --- |
| `weather` | Get current weather for a location | none |
| `paper_search` | Search academic papers across free providers | `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` |
| `paper_get_details` | Merge paper details from free providers | `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` |
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/mcp/tool-registry.test.ts`
Expected: PASS with README mentioning canonical paper and existing tool names.

- [ ] **Step 5: Commit**

```bash
git add README.md src/mcp/tool-manifest.ts package.json tests/mcp/tool-registry.test.ts
git commit -m "docs: align readme with manifest tool surface"
```

### Task 15: Run full local verification suite

**Files:**
- Modify only if tests fail: exact failing source or test files
- Test: `tests/**/*.ts`

- [ ] **Step 1: Run targeted tests first**

Run: `npm test -- tests/mcp/tool-registry.test.ts tests/mcp/worker-endpoints.test.ts tests/tools/native.test.ts tests/tools/external.test.ts tests/tools/paper.test.ts`
Expected: PASS across all targeted suites.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: PASS with all Vitest suites green.

- [ ] **Step 4: Fix any failures minimally and rerun the exact failing command**

```bash
npm test -- <failing test path>
npm run typecheck
```

Expected: PASS after minimal focused fixes.

- [ ] **Step 5: Commit**

```bash
git add src tests README.md package.json
git commit -m "test: verify manifest and paper search implementation"
```

### Task 16: Deploy to Cloudflare test environment and run cloud verification

**Files:**
- Modify only if deployment issues require config fixes: `wrangler.jsonc`, `src/worker.ts`, exact failing source files
- Test: deployed HTTP endpoints and remote MCP behavior

- [ ] **Step 1: Deploy the Worker to the approved test environment**

Run: `npm run deploy`
Expected: Wrangler deploy succeeds and returns the Worker URL or confirms the custom domain deployment.

- [ ] **Step 2: Verify operational endpoints remotely**

Run: `curl -s https://mcp.awsl.app/healthz && curl -s https://mcp.awsl.app/readyz && curl -s https://mcp.awsl.app/version`
Expected: JSON responses with healthy, ready, and aligned version metadata.

- [ ] **Step 3: Verify remote tools/list**

Run:

```bash
curl -s https://mcp.awsl.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected: JSON-RPC result containing canonical underscore tool names including `paper_search` and no hyphenated names.

- [ ] **Step 4: Verify one live paper golden path**

Run:

```bash
curl -s https://mcp.awsl.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"paper_search","arguments":{"query":"transformer interpretability","limit":3}}}'
```

Expected: JSON-RPC result with paper results, compact metadata, and no file download side effects.

- [ ] **Step 5: Verify one live paper detail or OA path and commit final fixes**

Run:

```bash
curl -s https://mcp.awsl.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"paper_get_open_access","arguments":{"doi":"10.48550/arXiv.1706.03762"}}}'
```

Expected: JSON-RPC result with OA/download link metadata when available.

```bash
git add src tests README.md package.json wrangler.jsonc
git commit -m "feat: ship manifest first paper search mcp"
```

---

## Spec Coverage Check

- Manifest-first single source of truth: Tasks 1-3, 14
- Production guardrails: Tasks 4-6
- Model-facing UX and compact outputs: Tasks 5, 12, 14
- Paper-search capability set: Tasks 8-13
- Version/release metadata alignment: Tasks 6-7, 14
- Local verification: Task 15
- Real Cloudflare deployment and cloud verification: Task 16
- Worktree and subagent execution path: this plan header plus execution choice below

## Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation markers remain.
- Each coding task includes exact files, code snippets, and concrete commands.
- Deployment verification steps include explicit commands and expected outcomes.

## Type Consistency Check

- Canonical naming remains underscore-only throughout (`paper_search`, `paper_get_details`, `paper_get_open_access`).
- Shared normalized paper shape is defined once in Tasks 9-11 and reused by search/detail handlers in Tasks 12-13.
- Manifest-driven registry and dispatch names align across Tasks 1-3 and 12.

Plan complete and saved to `docs/superpowers/plans/2026-04-20-paper-manifest-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
