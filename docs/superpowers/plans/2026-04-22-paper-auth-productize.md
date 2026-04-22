# Paper Auth Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two paper-tool regressions, add optional `/mcp` authentication plus browser-safe CORS/OPTIONS behavior, and ship the repository as a maintainable patch release with manifest-driven README generation, bilingual docs, Cloudflare deployment, and GitHub Release automation.

**Architecture:** Keep the runtime changes tightly scoped: fix paper behavior inside the existing paper module with one shared identifier resolver, add auth as a focused helper used by the JSON-RPC router, and add CORS at the Worker HTTP layer. Move productization concerns out of the request path into scripts and GitHub workflow files so the README tool surface and release metadata are generated from the manifest instead of being hand-maintained.

**Tech Stack:** TypeScript, Cloudflare Workers, Vitest, Wrangler, GitHub Actions, GitHub CLI, tsx

---

## Environment note

In the current harness, `npm install` / `npm test` failed because npm could not spawn `node` (`'node' is not recognized as an internal or external command'`). Treat that as a shell/PATH issue first. Do **not** change repository code to work around it. Before executing any task command below, ensure the active shell can run both `node --version` and `npm --version` successfully.

## File Structure

### Existing files to modify

- `src/tools/paper/search.ts` — keep provider fetches here, but remove duplicate identifier classification logic and wire in the shared resolver
- `src/worker.ts` — add `OPTIONS /mcp` handling and CORS headers while preserving `/healthz`, `/readyz`, `/version`
- `src/mcp/router.ts` — enforce auth for `tools/list` / `tools/call` only
- `src/mcp/jsonrpc.ts` — allow returning JSON-RPC error bodies with non-200 HTTP status for auth failures
- `src/lib/keys.ts` — keep existing comma-separated parsing helper as the shared source for auth key parsing
- `tests/tools/paper.test.ts` — add regression tests for the user-provided failing paper cases
- `tests/mcp/protocol.test.ts` — add auth and CORS protocol tests
- `tests/mcp/tool-registry.test.ts` — keep README/tool-surface assertions aligned with generated documentation
- `README.md` — user-facing English docs with generated tool section markers
- `README.zh-CN.md` — user-facing Chinese docs with generated tool section markers
- `package.json` — add docs/release scripts, add `tsx`, bump version to `0.4.1`
- `wrangler.jsonc` — keep current deployment target unless a release-specific metadata tweak is required by failing deployment verification

### New files to create

- `src/tools/paper/identifiers.ts` — shared DOI / arXiv identifier normalization and classification
- `src/lib/mcp-auth.ts` — auth key validation, header/query extraction, and protected-method checks
- `scripts/render-readme.ts` — regenerate the manifest-derived README sections in both languages
- `scripts/lib/release-utils.ts` — pure helpers for patch bumping and changelog insertion so release logic can be tested
- `scripts/release.ts` — verified patch release command that updates docs, changelog, version, commit, tag, and push
- `.github/workflows/release.yml` — create GitHub Release on version tag push using generated notes
- `.github/release.yml` — generated-notes category config
- `CHANGELOG.md` — patch release history
- `tests/scripts/release-utils.test.ts` — unit coverage for version/changelog helpers

### Responsibility boundaries

- `src/tools/paper/identifiers.ts` owns identifier interpretation only.
- `src/tools/paper/search.ts` owns provider orchestration and result merging only.
- `src/lib/mcp-auth.ts` owns parsing/authorization only.
- `src/worker.ts` owns HTTP method/path/CORS behavior only.
- `scripts/render-readme.ts` owns generated README fragments only.
- `scripts/release.ts` owns release sequencing only.

---

### Task 1: Fix `paper_search` legal-query handling with shared identifier classification

**Files:**
- Create: `src/tools/paper/identifiers.ts`
- Modify: `src/tools/paper/search.ts`
- Test: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing regression tests**

```ts
it("accepts the reported legal plain-text query without treating it as invalid params", async () => {
  const handler = getToolHandler("paper_search");
  const context = {
    env: {},
    request: new Request("https://example.com/mcp", { method: "POST" })
  };

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url === "https://api.crossref.org/works?query=vision%20transformer%20image%20recognition&rows=10") {
      return Response.json({
        message: {
          items: [
            {
              DOI: "10.1000/vit",
              title: ["Vision Transformer for Image Recognition"],
              issued: { "date-parts": [[2021]] }
            }
          ]
        }
      });
    }

    if (url === "https://api.openalex.org/works?search=vision%20transformer%20image%20recognition&per-page=10") {
      return Response.json({ results: [] });
    }

    throw new Error(`unexpected url ${url}`);
  }));

  await expect(handler?.({ query: "vision transformer image recognition" }, context)).resolves.toEqual({
    ok: true,
    data: expect.objectContaining({
      query: "vision transformer image recognition",
      results: expect.arrayContaining([
        expect.objectContaining({ title: "Vision Transformer for Image Recognition" })
      ])
    })
  });
});

it("treats an arXiv-prefixed narrative string as a legal text query, not an exact identifier", async () => {
  const handler = getToolHandler("paper_search");
  const context = {
    env: {},
    request: new Request("https://example.com/mcp", { method: "POST" })
  };

  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url === "https://api.crossref.org/works?query=arXiv%201706.03762%20Attention%20Is%20All%20You%20Need&rows=10") {
      return Response.json({
        message: {
          items: [
            {
              DOI: "10.48550/arXiv.1706.03762",
              title: ["Attention Is All You Need"],
              issued: { "date-parts": [[2017]] }
            }
          ]
        }
      });
    }

    if (url === "https://api.openalex.org/works?search=arXiv%201706.03762%20Attention%20Is%20All%20You%20Need&per-page=10") {
      return Response.json({ results: [] });
    }

    throw new Error(`unexpected url ${url}`);
  });

  vi.stubGlobal("fetch", fetchMock);

  await expect(handler?.({ query: "arXiv 1706.03762 Attention Is All You Need" }, context)).resolves.toEqual({
    ok: true,
    data: expect.objectContaining({
      query: "arXiv 1706.03762 Attention Is All You Need",
      results: expect.arrayContaining([
        expect.objectContaining({ title: "Attention Is All You Need" })
      ])
    })
  });

  expect(fetchMock).not.toHaveBeenCalledWith(
    "https://export.arxiv.org/api/query?search_query=id:arXiv%201706.03762%20Attention%20Is%20All%20You%20Need&start=0&max_results=1",
    expect.anything()
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/tools/paper.test.ts -t "accepts the reported legal plain-text query"`

Run: `npm test -- tests/tools/paper.test.ts -t "treats an arXiv-prefixed narrative string"`

Expected: FAIL because the shared query-classification logic does not exist yet and `paper_search` still owns classification inline.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/tools/paper/identifiers.ts
export type ClassifiedPaperInput =
  | { kind: "doi"; doi: string }
  | { kind: "arxiv_id"; arxivId: string }
  | { kind: "arxiv_doi"; doi: string; arxivId: string }
  | { kind: "text"; query: string };

export function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function normalizeArxivIdentifier(value: string): string {
  return value.trim().replace(/^arxiv:/i, "").replace(/v\d+$/i, "");
}

export function looksLikeDoi(value: string): boolean {
  return /^10\.\S+\/\S+$/i.test(value.trim());
}

export function looksLikeArxivId(value: string): boolean {
  return /^(?:arxiv:)?(?:\d{4}\.\d{4,5}|[a-z.-]+\/\d{7})(?:v\d+)?$/i.test(value.trim());
}

export function classifyPaperInput(input: string): ClassifiedPaperInput {
  const normalized = input.trim();

  if (/^10\.48550\/arxiv\./i.test(normalized)) {
    return {
      kind: "arxiv_doi",
      doi: normalized,
      arxivId: normalizeArxivIdentifier(normalized.replace(/^10\.48550\/arxiv\./i, ""))
    };
  }

  if (looksLikeArxivId(normalized)) {
    return {
      kind: "arxiv_id",
      arxivId: normalizeArxivIdentifier(normalized)
    };
  }

  if (looksLikeDoi(normalized)) {
    return {
      kind: "doi",
      doi: normalized
    };
  }

  return {
    kind: "text",
    query: normalized
  };
}
```

```ts
// src/tools/paper/search.ts
import { classifyPaperInput, normalizeNonEmptyString } from "./identifiers";

export async function handlePaperSearch(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const searchArgs = (args ?? {}) as { query?: unknown };
  const query = normalizeNonEmptyString(searchArgs.query);

  if (!query) {
    return validationError("query must be a non-empty string");
  }

  const classification = classifyPaperInput(query);

  if (classification.kind === "doi") {
    return lookupExactDoiQuery(query, classification.doi);
  }

  if (classification.kind === "arxiv_id") {
    return lookupExactArxivQuery(query, classification.arxivId);
  }

  if (classification.kind === "arxiv_doi") {
    return lookupExactArxivDoiQuery(query, classification.doi, classification.arxivId);
  }

  return lookupTextQuery(classification.query);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/tools/paper.test.ts -t "accepts the reported legal plain-text query"`

Run: `npm test -- tests/tools/paper.test.ts -t "treats an arXiv-prefixed narrative string"`

Expected: PASS, and both inputs now return normal tool results instead of surfacing as parameter errors.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/identifiers.ts src/tools/paper/search.ts tests/tools/paper.test.ts
git commit -m "fix: stabilize paper search query classification"
```

### Task 2: Fix `paper_get_details` for direct arXiv ids and arXiv DOI inputs

**Files:**
- Modify: `src/tools/paper/identifiers.ts`
- Modify: `src/tools/paper/search.ts`
- Test: `tests/tools/paper.test.ts`

- [ ] **Step 1: Write the failing regression tests**

```ts
it("returns details for a direct arxiv_id", async () => {
  const handler = getToolHandler("paper_get_details");
  const context = {
    env: {},
    request: new Request("https://example.com/mcp", { method: "POST" })
  };

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url === "https://export.arxiv.org/api/query?search_query=id:1706.03762&start=0&max_results=1") {
      return new Response(`
        <feed>
          <entry>
            <id>http://arxiv.org/abs/1706.03762v7</id>
            <title>Attention Is All You Need</title>
            <summary>Transformer abstract</summary>
            <author><name>Ashish Vaswani</name></author>
          </entry>
        </feed>
      `, { status: 200 });
    }

    throw new Error(`unexpected url ${url}`);
  }));

  await expect(handler?.({ arxiv_id: "1706.03762" }, context)).resolves.toEqual({
    ok: true,
    data: expect.objectContaining({
      paper_id: "1706.03762",
      providers: ["arxiv"],
      result: expect.objectContaining({
        title: "Attention Is All You Need",
        arxiv_id: "1706.03762"
      })
    })
  });
});

it("treats arXiv DOI inputs as arXiv detail lookups and DOI enrichments", async () => {
  const handler = getToolHandler("paper_get_details");
  const context = {
    env: { PAPER_SEARCH_MCP_UNPAYWALL_EMAILS: "a@example.com" },
    request: new Request("https://example.com/mcp", { method: "POST" })
  };

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = String(input);

    if (url === "https://export.arxiv.org/api/query?search_query=id:1706.03762&start=0&max_results=1") {
      return new Response(`
        <feed>
          <entry>
            <id>http://arxiv.org/abs/1706.03762v7</id>
            <title>Attention Is All You Need</title>
            <summary>Transformer abstract</summary>
            <author><name>Ashish Vaswani</name></author>
          </entry>
        </feed>
      `, { status: 200 });
    }

    if (url === "https://api.crossref.org/works/10.48550%2FarXiv.1706.03762") {
      return Response.json({ message: { DOI: "10.48550/arXiv.1706.03762", title: ["Attention Is All You Need"] } });
    }

    if (url === "https://api.openalex.org/works?filter=doi:10.48550%2FarXiv.1706.03762") {
      return Response.json({ results: [] });
    }

    if (url === "https://api.unpaywall.org/v2/10.48550%2FarXiv.1706.03762?email=a%40example.com") {
      return Response.json({ doi: "10.48550/arXiv.1706.03762", is_oa: true, best_oa_location: { url_for_pdf: "https://arxiv.org/pdf/1706.03762.pdf" } });
    }

    throw new Error(`unexpected url ${url}`);
  }));

  await expect(handler?.({ doi: "10.48550/arXiv.1706.03762" }, context)).resolves.toEqual({
    ok: true,
    data: expect.objectContaining({
      providers: expect.arrayContaining(["arxiv", "crossref", "unpaywall"]),
      result: expect.objectContaining({
        title: "Attention Is All You Need",
        arxiv_id: "1706.03762",
        doi: "10.48550/arxiv.1706.03762"
      })
    })
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/tools/paper.test.ts -t "returns details for a direct arxiv_id"`

Run: `npm test -- tests/tools/paper.test.ts -t "treats arXiv DOI inputs as arXiv detail lookups"`

Expected: FAIL because `paper_get_details` does not currently reuse the shared identifier logic and does not bridge arXiv DOI inputs into the arXiv detail path.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/tools/paper/search.ts
import { classifyPaperInput, normalizeNonEmptyString } from "./identifiers";

export async function handlePaperGetDetails(args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const detailsArgs = (args ?? {}) as { doi?: unknown; arxiv_id?: unknown };
  const doi = normalizeNonEmptyString(detailsArgs.doi);
  const arxivId = normalizeNonEmptyString(detailsArgs.arxiv_id);
  const rawInput = doi ?? arxivId;

  if (!rawInput) {
    return validationError("doi or arxiv_id must be a non-empty string");
  }

  const classification = classifyPaperInput(rawInput);
  const providerResults = await Promise.allSettled([
    classification.kind === "arxiv_id" || classification.kind === "arxiv_doi"
      ? fetchArxivDetails(classification.arxivId)
      : Promise.resolve({ provider: "arxiv" as const, paper: null }),
    classification.kind === "doi" || classification.kind === "arxiv_doi"
      ? fetchCrossrefDetails(classification.doi)
      : Promise.resolve({ provider: "crossref" as const, paper: null }),
    classification.kind === "doi" || classification.kind === "arxiv_doi"
      ? fetchOpenAlexDetails(classification.doi)
      : Promise.resolve({ provider: "openalex" as const, paper: null }),
    classification.kind === "doi" || classification.kind === "arxiv_doi"
      ? lookupUnpaywallByDoi(classification.doi, context.env)
      : Promise.resolve(null)
  ]);

  const providers: PaperProvider[] = [];
  const papers: NormalizedPaper[] = [];
  let partial = false;
  let openAccess: { open_access: boolean; download_links: string[] } | null = null;

  providerResults.forEach((result) => {
    if (result.status === "rejected") {
      partial = true;
      return;
    }

    const value = result.value;
    if (!value) {
      return;
    }

    if ("provider" in value && "paper" in value) {
      if (value.paper) {
        providers.push(value.provider);
        papers.push(value.paper);
      }
      return;
    }

    if (!value.ok) {
      partial = true;
      return;
    }

    providers.push(value.data.provider);
    openAccess = {
      open_access: value.data.open_access,
      download_links: value.data.download_links
    };
  });

  const merged = mergePaperResults(papers)[0] ?? null;

  return {
    ok: true,
    data: {
      paper_id: classification.kind === "arxiv_id" ? classification.arxivId : rawInput,
      providers,
      partial,
      result: merged && openAccess ? withOpenAccessData(merged, openAccess) : merged
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/tools/paper.test.ts -t "returns details for a direct arxiv_id"`

Run: `npm test -- tests/tools/paper.test.ts -t "treats arXiv DOI inputs as arXiv detail lookups"`

Expected: PASS, with a non-null result for both direct arXiv IDs and arXiv DOI inputs.

- [ ] **Step 5: Commit**

```bash
git add src/tools/paper/identifiers.ts src/tools/paper/search.ts tests/tools/paper.test.ts
git commit -m "fix: support arxiv identifiers in paper details"
```

### Task 3: Add optional `/mcp` auth for `tools/list` and `tools/call`

**Files:**
- Create: `src/lib/mcp-auth.ts`
- Modify: `src/mcp/jsonrpc.ts`
- Modify: `src/mcp/router.ts`
- Test: `tests/mcp/protocol.test.ts`

- [ ] **Step 1: Write the failing auth tests**

```ts
it("rejects tools/list without credentials when MCP_AUTH_KEYS is configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", jsonRpcRequest("tools/list", {})),
    { MCP_AUTH_KEYS: "elysia,secondary_key" },
    ctx
  );
  const body = await response.json();

  expect(response.status).toBe(401);
  expect(body).toEqual({
    jsonrpc: "2.0",
    id: 1,
    error: {
      code: -32001,
      message: "Unauthorized"
    }
  });
});

it("accepts Bearer, x-api-key, and query-string credentials for protected methods", async () => {
  const bearer = await worker.fetch(
    new Request(
      "https://example.com/mcp",
      {
        ...jsonRpcRequest("tools/list", {}),
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: "Bearer elysia"
        }
      }
    ),
    { MCP_AUTH_KEYS: "elysia,secondary_key" },
    ctx
  );

  const apiKey = await worker.fetch(
    new Request(
      "https://example.com/mcp",
      {
        ...jsonRpcRequest("tools/list", {}),
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          "x-api-key": "secondary_key"
        }
      }
    ),
    { MCP_AUTH_KEYS: "elysia,secondary_key" },
    ctx
  );

  const query = await worker.fetch(
    new Request("https://example.com/mcp?key=elysia", jsonRpcRequest("tools/list", {})),
    { MCP_AUTH_KEYS: "elysia,secondary_key" },
    ctx
  );

  expect(bearer.status).toBe(200);
  expect(apiKey.status).toBe(200);
  expect(query.status).toBe(200);
});

it("keeps initialize public even when MCP_AUTH_KEYS is configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.com/mcp", jsonRpcRequest("initialize", {})),
    { MCP_AUTH_KEYS: "elysia" },
    ctx
  );

  expect(response.status).toBe(200);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/mcp/protocol.test.ts -t "rejects tools/list without credentials"`

Run: `npm test -- tests/mcp/protocol.test.ts -t "accepts Bearer, x-api-key, and query-string credentials"`

Run: `npm test -- tests/mcp/protocol.test.ts -t "keeps initialize public"`

Expected: FAIL because the router currently allows all methods and JSON-RPC errors are always returned with HTTP 200.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/mcp-auth.ts
import { parseKeyList } from "./keys";
import type { Env } from "../mcp/router";

const AUTH_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export function isProtectedMcpMethod(method: string): boolean {
  return method === "tools/list" || method === "tools/call";
}

export function configuredAuthKeys(env: Env): { enabled: boolean; keys: string[] } {
  const raw = env.MCP_AUTH_KEYS;
  const parsed = parseKeyList(raw);

  if (typeof raw !== "string" || raw.trim() === "") {
    return { enabled: false, keys: [] };
  }

  return {
    enabled: true,
    keys: parsed.filter((key) => AUTH_KEY_PATTERN.test(key))
  };
}

export function presentedAuthKey(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim() || null;
  }

  const apiKey = request.headers.get("x-api-key")?.trim();
  if (apiKey) {
    return apiKey;
  }

  const queryKey = new URL(request.url).searchParams.get("key")?.trim();
  return queryKey || null;
}

export function isAuthorizedMcpRequest(request: Request, env: Env): boolean {
  const auth = configuredAuthKeys(env);
  if (!auth.enabled) {
    return true;
  }

  if (auth.keys.length === 0) {
    return false;
  }

  const candidate = presentedAuthKey(request);
  return candidate !== null && auth.keys.includes(candidate);
}
```

```ts
// src/mcp/jsonrpc.ts
export function jsonRpcErrorWithStatus(id: JsonRpcId, code: number, message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message }
    }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8"
      }
    }
  );
}
```

```ts
// src/mcp/router.ts
import { isAuthorizedMcpRequest, isProtectedMcpMethod } from "../lib/mcp-auth";
import { jsonRpcError, jsonRpcErrorWithStatus, jsonRpcResult } from "./jsonrpc";
import { initializeResult } from "./protocol";
import { toToolResult } from "./result";
import { findEnabledTool, getEnabledTools } from "./tool-registry";
import { validateToolArguments } from "./validate";

export async function handleJsonRpc(request: JsonRpcRequest, env: Env, originalRequest: Request): Promise<Response> {
  if (isProtectedMcpMethod(request.method) && !isAuthorizedMcpRequest(originalRequest, env)) {
    return jsonRpcErrorWithStatus(request.id ?? null, -32001, "Unauthorized", 401);
  }

  switch (request.method) {
    case "initialize":
      return jsonRpcResult(request.id ?? null, initializeResult());
    case "tools/list":
      return jsonRpcResult(request.id ?? null, {
        tools: getEnabledTools(env, { disabledTools: getDisabledTools(originalRequest) })
      });
    case "tools/call": {
      const params = request.params;
      if (!params || typeof params !== "object") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const name = "name" in params ? (params as { name?: unknown }).name : undefined;
      if (typeof name !== "string") {
        return jsonRpcError(request.id ?? null, -32602, "Invalid params");
      }

      const tool = findEnabledTool(name, env);
      if (!tool) {
        return jsonRpcError(request.id ?? null, -32602, `Unknown tool: ${name}`);
      }

      const args = "arguments" in params ? (params as { arguments?: unknown }).arguments ?? {} : {};
      const validationErrorMessage = validateToolArguments(tool.inputSchema, args);
      if (validationErrorMessage) {
        return jsonRpcError(request.id ?? null, -32602, validationErrorMessage);
      }

      const result = await dispatchTool(tool.name, args, { env, request: originalRequest });
      return jsonRpcResult(request.id ?? null, toToolResult(result));
    }
    default:
      return jsonRpcError(request.id ?? null, -32601, `Method not found: ${request.method}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/mcp/protocol.test.ts -t "rejects tools/list without credentials"`

Run: `npm test -- tests/mcp/protocol.test.ts -t "accepts Bearer, x-api-key, and query-string credentials"`

Run: `npm test -- tests/mcp/protocol.test.ts -t "keeps initialize public"`

Expected: PASS, and protected methods now require one of the three approved credentials when `MCP_AUTH_KEYS` is set.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp-auth.ts src/mcp/jsonrpc.ts src/mcp/router.ts tests/mcp/protocol.test.ts
git commit -m "feat: protect mcp tool methods with optional auth"
```

### Task 4: Add `OPTIONS /mcp` and CORS headers for browser compatibility

**Files:**
- Modify: `src/worker.ts`
- Test: `tests/mcp/protocol.test.ts`
- Test: `tests/mcp/worker-endpoints.test.ts`

- [ ] **Step 1: Write the failing CORS tests**

```ts
it("returns 204 for OPTIONS /mcp with permissive CORS headers", async () => {
  const response = await worker.fetch(new Request("https://example.com/mcp", { method: "OPTIONS" }), {}, ctx);

  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
  expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  expect(response.headers.get("access-control-allow-headers")).toContain("x-api-key");
});

it("adds CORS headers to successful and error /mcp responses", async () => {
  const success = await worker.fetch(new Request("https://example.com/mcp", jsonRpcRequest("initialize", {})), {}, ctx);
  const unauthorized = await worker.fetch(
    new Request("https://example.com/mcp", jsonRpcRequest("tools/list", {})),
    { MCP_AUTH_KEYS: "elysia" },
    ctx
  );

  expect(success.headers.get("access-control-allow-origin")).toBe("*");
  expect(unauthorized.headers.get("access-control-allow-origin")).toBe("*");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/mcp/protocol.test.ts -t "returns 204 for OPTIONS /mcp"`

Run: `npm test -- tests/mcp/protocol.test.ts -t "adds CORS headers to successful and error /mcp responses"`

Expected: FAIL because `/mcp` currently only accepts POST and the Worker does not append CORS headers.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/worker.ts
import packageJson from "../package.json";
import type { Env } from "./mcp/router";
import { handleJsonRpc } from "./mcp/router";
import { isJsonRpcRequest, jsonRpcError } from "./mcp/jsonrpc";

function appendCorsHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, x-api-key, content-type, accept");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function createCorsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, x-api-key, content-type, accept"
    }
  });
}

function createHealthResponse(): Response {
  return Response.json({ status: "ok" });
}

function createReadyResponse(): Response {
  return Response.json({ ready: true });
}

function createVersionResponse(): Response {
  return Response.json({
    name: packageJson.name,
    version: packageJson.version
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    void ctx;
    const url = new URL(request.url);

    if (url.pathname === "/healthz") {
      return createHealthResponse();
    }

    if (url.pathname === "/readyz") {
      return createReadyResponse();
    }

    if (url.pathname === "/version") {
      return createVersionResponse();
    }

    if (url.pathname !== "/mcp") {
      return new Response(null, { status: 404 });
    }

    if (request.method === "OPTIONS") {
      return createCorsPreflightResponse();
    }

    if (request.method !== "POST") {
      return appendCorsHeaders(new Response(null, { status: 405 }));
    }

    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      return appendCorsHeaders(jsonRpcError(null, -32700, "Parse error"));
    }

    if (!isJsonRpcRequest(payload)) {
      return appendCorsHeaders(jsonRpcError(null, -32600, "Invalid Request"));
    }

    if (payload.method === "notifications/initialized" && payload.id === undefined) {
      return appendCorsHeaders(new Response(null, { status: 202 }));
    }

    return appendCorsHeaders(await handleJsonRpc(payload, env, request));
  }
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/mcp/protocol.test.ts -t "returns 204 for OPTIONS /mcp"`

Run: `npm test -- tests/mcp/protocol.test.ts -t "adds CORS headers to successful and error /mcp responses"`

Expected: PASS, and `/mcp` now works with browser preflighted auth headers.

- [ ] **Step 5: Commit**

```bash
git add src/worker.ts tests/mcp/protocol.test.ts tests/mcp/worker-endpoints.test.ts
git commit -m "feat: add cors and options support for mcp"
```

### Task 5: Add manifest-driven README generation and README parity tests

**Files:**
- Create: `scripts/render-readme.ts`
- Modify: `package.json`
- Modify: `tests/mcp/tool-registry.test.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing generator/parity tests**

```ts
it("documents canonical paper tools in both readmes and avoids legacy hyphenated aliases", () => {
  expect(readme).toContain("paper_search");
  expect(readme).toContain("paper_get_details");
  expect(readme).toContain("paper_get_related");
  expect(readme).not.toContain("paper-search");
});

it("documents the public demo url and all three auth forms", () => {
  expect(readme).toContain("https://mcp.awsl.app/mcp?key=elysia");
  expect(readme).toContain("Authorization: Bearer <key>");
  expect(readme).toContain("x-api-key: <key>");
  expect(readme).toContain("?key=<key>");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "documents canonical paper tools in both readmes"`

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "documents the public demo url and all three auth forms"`

Expected: FAIL because the current README text is still hand-written, lacks the new auth section, and does not expose the demo URL in directly copyable `?key=` form.

- [ ] **Step 3: Write the minimal implementation**

```ts
// scripts/render-readme.ts
import { readFile, writeFile } from "node:fs/promises";
import { toolManifestEntries } from "../src/mcp/tool-manifest.ts";

const EN_MARKER_START = "<!-- GENERATED:TOOLS:START -->";
const EN_MARKER_END = "<!-- GENERATED:TOOLS:END -->";
const ZH_MARKER_START = "<!-- GENERATED:TOOLS_ZH:START -->";
const ZH_MARKER_END = "<!-- GENERATED:TOOLS_ZH:END -->";

function renderToolsMarkdown(): string {
  const rows = toolManifestEntries.map((entry) => `- \`${entry.name}\` — ${entry.description}`);
  return rows.join("\n");
}

function replaceBlock(source: string, start: string, end: string, body: string): string {
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);
  return source.replace(pattern, `${start}\n${body}\n${end}`);
}

async function updateFile(path: string, start: string, end: string) {
  const current = await readFile(path, "utf8");
  const next = replaceBlock(current, start, end, renderToolsMarkdown());
  await writeFile(path, next);
}

await updateFile("README.md", EN_MARKER_START, EN_MARKER_END);
await updateFile("README.zh-CN.md", ZH_MARKER_START, ZH_MARKER_END);
```

```json
// package.json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "generate:readme": "tsx scripts/render-readme.ts"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "latest",
    "@cloudflare/workers-types": "latest",
    "typescript": "latest",
    "vitest": "latest",
    "wrangler": "latest",
    "tsx": "latest"
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run generate:readme`

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "documents canonical paper tools in both readmes"`

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "documents the public demo url and all three auth forms"`

Expected: PASS, with both readmes carrying manifest-derived tool sections and the new auth/demo documentation.

- [ ] **Step 5: Commit**

```bash
git add scripts/render-readme.ts package.json README.md README.zh-CN.md tests/mcp/tool-registry.test.ts
git commit -m "feat: generate readme tool lists from manifest"
```

### Task 6: Rewrite the English and Chinese READMEs for end users

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Test: `tests/mcp/tool-registry.test.ts`

- [ ] **Step 1: Write the failing documentation assertions**

```ts
it("documents client setup for Claude, Cursor, Cline, Cherry Studio, and Codex", () => {
  expect(readme).toContain("Claude");
  expect(readme).toContain("Cursor");
  expect(readme).toContain("Cline");
  expect(readme).toContain("Cherry Studio");
  expect(readme).toContain("Codex");
});

it("includes Cloudflare deploy guidance and language-switch links", () => {
  expect(readme).toContain("[中文](./README.zh-CN.md)");
  expect(readme).toContain("https://deploy.workers.cloudflare.com/button");
  expect(readmeZh).toContain("[English](./README.md)");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "documents client setup for Claude"`

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "includes Cloudflare deploy guidance"`

Expected: FAIL because the current READMEs do not yet contain the requested client examples, deploy button, or language-switch links.

- [ ] **Step 3: Write the minimal implementation**

```md
<!-- README.md top section -->
[中文](./README.zh-CN.md)

# Toolhive MCP

Remote HTTP MCP server for Cloudflare Workers with paper tools, native utilities, optional API-key auth, and browser-safe `/mcp` access.

Demo endpoint: `https://mcp.awsl.app/mcp?key=elysia`

## Quick Start

### Claude Code

```bash
claude mcp add --transport http toolhive "https://mcp.awsl.app/mcp?key=elysia"
```

### Cursor (`.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "toolhive": {
      "url": "https://mcp.awsl.app/mcp",
      "headers": {
        "x-api-key": "elysia"
      }
    }
  }
}
```

### Cline (`cline_mcp_settings.json`)

```json
{
  "mcpServers": {
    "toolhive": {
      "type": "http",
      "url": "https://mcp.awsl.app/mcp",
      "headers": {
        "authorization": "Bearer elysia"
      }
    }
  }
}
```

### Cherry Studio (`mcp.json`)

```json
{
  "mcpServers": {
    "toolhive": {
      "type": "streamableHttp",
      "url": "https://mcp.awsl.app/mcp?key=elysia"
    }
  }
}
```

### Codex

```bash
codex mcp add toolhive --url "https://mcp.awsl.app/mcp" --header "x-api-key: elysia"
```

## Authentication

Use any one of:
- `Authorization: Bearer <key>`
- `x-api-key: <key>`
- `https://mcp.awsl.app/mcp?key=elysia`

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DoingDog/toolhive-mcp)

### Self-host configuration
- `MCP_AUTH_KEYS`
- `TAVILY_API_KEYS`
- `CONTEXT7_API_KEYS`
- `EXA_API_KEYS`
- `UNSPLASH_ACCESS_KEYS`
- `PUREMD_API_KEYS`
- `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS`

<!-- GENERATED:TOOLS:START -->
<!-- GENERATED:TOOLS:END -->
```

```md
<!-- README.zh-CN top section -->
[English](./README.md)

# Toolhive MCP

部署在 Cloudflare Workers 上的远程 HTTP MCP 服务，提供 paper 工具、原生工具、可选鉴权，以及可直接被浏览器客户端使用的 `/mcp`。

演示地址：`https://mcp.awsl.app/mcp?key=elysia`

## 快速接入

### Claude Code

```bash
claude mcp add --transport http toolhive "https://mcp.awsl.app/mcp?key=elysia"
```

### Cursor（`.cursor/mcp.json`）

```json
{
  "mcpServers": {
    "toolhive": {
      "url": "https://mcp.awsl.app/mcp",
      "headers": {
        "x-api-key": "elysia"
      }
    }
  }
}
```

### Cline（`cline_mcp_settings.json`）

```json
{
  "mcpServers": {
    "toolhive": {
      "type": "http",
      "url": "https://mcp.awsl.app/mcp",
      "headers": {
        "authorization": "Bearer elysia"
      }
    }
  }
}
```

### Cherry Studio（`mcp.json`）

```json
{
  "mcpServers": {
    "toolhive": {
      "type": "streamableHttp",
      "url": "https://mcp.awsl.app/mcp?key=elysia"
    }
  }
}
```

### Codex

```bash
codex mcp add toolhive --url "https://mcp.awsl.app/mcp" --header "x-api-key: elysia"
```

## 鉴权方式
- `Authorization: Bearer <key>`
- `x-api-key: <key>`
- `https://mcp.awsl.app/mcp?key=elysia`

## 部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DoingDog/toolhive-mcp)

<!-- GENERATED:TOOLS_ZH:START -->
<!-- GENERATED:TOOLS_ZH:END -->
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run generate:readme`

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "documents client setup for Claude"`

Run: `npm test -- tests/mcp/tool-registry.test.ts -t "includes Cloudflare deploy guidance"`

Expected: PASS, and both READMEs now read like product docs instead of internal notes.

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md tests/mcp/tool-registry.test.ts
git commit -m "docs: rewrite bilingual readmes for product use"
```

### Task 7: Add patch release automation, changelog generation, and GitHub Release creation

**Files:**
- Create: `scripts/lib/release-utils.ts`
- Create: `scripts/release.ts`
- Create: `tests/scripts/release-utils.test.ts`
- Create: `.github/workflows/release.yml`
- Create: `.github/release.yml`
- Create: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Write the failing release-helper tests**

```ts
import { describe, expect, it } from "vitest";
import { bumpPatchVersion, prependChangelogEntry } from "../../scripts/lib/release-utils";

describe("release utils", () => {
  it("bumps 0.4.0 to 0.4.1", () => {
    expect(bumpPatchVersion("0.4.0")).toBe("0.4.1");
  });

  it("prepends a new changelog section", () => {
    const next = prependChangelogEntry("# Changelog\n", "0.4.1", "2026-04-22", ["fix: stabilize paper search"]);
    expect(next).toContain("## 0.4.1 - 2026-04-22");
    expect(next).toContain("- fix: stabilize paper search");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/scripts/release-utils.test.ts`

Expected: FAIL because the release helper module and changelog file do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

```ts
// scripts/lib/release-utils.ts
export function bumpPatchVersion(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

export function prependChangelogEntry(current: string, version: string, date: string, lines: string[]): string {
  const body = lines.map((line) => `- ${line}`).join("\n");
  const section = `## ${version} - ${date}\n\n${body}\n\n`;
  return current.startsWith("# Changelog\n\n")
    ? current.replace("# Changelog\n\n", `# Changelog\n\n${section}`)
    : `# Changelog\n\n${section}${current}`;
}
```

```ts
// scripts/release.ts
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { bumpPatchVersion, prependChangelogEntry } from "./lib/release-utils";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
const nextVersion = bumpPatchVersion(packageJson.version);
const today = "2026-04-22";
const lastTag = execFileSync("git", ["describe", "--tags", "--abbrev=0"], { encoding: "utf8" }).trim();
const subjects = execFileSync("git", ["log", `${lastTag}..HEAD`, "--pretty=%s"], { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter(Boolean);

execFileSync("npm", ["run", "generate:readme"], { stdio: "inherit", shell: true });
execFileSync("npm", ["test"], { stdio: "inherit", shell: true });
execFileSync("npm", ["run", "typecheck"], { stdio: "inherit", shell: true });

packageJson.version = nextVersion;
writeFileSync("package.json", JSON.stringify(packageJson, null, 2) + "\n");

const changelog = readFileSync("CHANGELOG.md", "utf8");
writeFileSync("CHANGELOG.md", prependChangelogEntry(changelog, nextVersion, today, subjects));

execFileSync("git", ["add", "package.json", "CHANGELOG.md", "README.md", "README.zh-CN.md"], { stdio: "inherit" });
execFileSync("git", ["commit", "-m", `chore(release): bump version to v${nextVersion}`], { stdio: "inherit" });
execFileSync("git", ["tag", `v${nextVersion}`], { stdio: "inherit" });
execFileSync("git", ["push", "origin", "HEAD", "--follow-tags"], { stdio: "inherit" });
```

```yaml
# .github/workflows/release.yml
name: release

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: write

jobs:
  create-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Create GitHub release
        run: gh release create "$GITHUB_REF_NAME" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

```yaml
# .github/release.yml
changelog:
  categories:
    - title: Fixes
      labels:
        - fix
    - title: Features
      labels:
        - feat
    - title: Documentation
      labels:
        - docs
    - title: Maintenance
      labels:
        - chore
```

```json
// package.json additions
{
  "scripts": {
    "release:patch": "tsx scripts/release.ts"
  }
}
```

```md
# CHANGELOG
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/scripts/release-utils.test.ts`

Expected: PASS, and the repository now has a concrete patch-release path plus GitHub Release automation.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/release-utils.ts scripts/release.ts tests/scripts/release-utils.test.ts .github/workflows/release.yml .github/release.yml CHANGELOG.md package.json
git commit -m "feat: add patch release automation"
```

### Task 8: Run local verification, deploy to Cloudflare, smoke test all auth flows, and publish the patch release

**Files:**
- Modify only if a verification failure requires a focused code fix: exact failing source/test file
- Release artifacts created by command: `package.json`, `CHANGELOG.md`, git tag, GitHub Release

- [ ] **Step 1: Run the full local verification suite**

Run: `node --version && npm --version`

Expected: both commands succeed; if not, stop and repair the shell PATH before touching repo code.

Run: `npm run generate:readme`

Run: `npm test -- tests/tools/paper.test.ts tests/mcp/protocol.test.ts tests/mcp/worker-endpoints.test.ts tests/mcp/tool-registry.test.ts tests/scripts/release-utils.test.ts`

Run: `npm run typecheck`

Expected: PASS across docs generation, targeted tests, and typecheck.

- [ ] **Step 2: Configure the demo auth key and deploy**

Run: `printf "elysia" | npx wrangler secret put MCP_AUTH_KEYS`

Run: `npm run deploy`

Expected: Wrangler updates the Worker serving `mcp.awsl.app` with `MCP_AUTH_KEYS=elysia`.

- [ ] **Step 3: Verify public endpoints and CORS remotely**

Run: `curl -i -X OPTIONS https://mcp.awsl.app/mcp`

Expected: HTTP `204`, `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`, and `authorization` plus `x-api-key` present in `Access-Control-Allow-Headers`.

Run: `curl -s https://mcp.awsl.app/version`

Expected: JSON containing the current package version.

Run: `curl -s https://mcp.awsl.app/healthz && curl -s https://mcp.awsl.app/readyz`

Expected: JSON probe bodies from both endpoints.

- [ ] **Step 4: Smoke test all three auth methods and the repaired paper flows**

Run:

```bash
curl -s https://mcp.awsl.app/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: unauthorized JSON-RPC error with HTTP 401.

Run:

```bash
curl -s 'https://mcp.awsl.app/mcp?key=elysia' \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Expected: `tools/list` succeeds.

Run:

```bash
curl -s https://mcp.awsl.app/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer elysia' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"paper_search","arguments":{"query":"vision transformer image recognition"}}}'
```

Expected: success result containing a normal paper list.

Run:

```bash
curl -s https://mcp.awsl.app/mcp \
  -H 'content-type: application/json' \
  -H 'x-api-key: elysia' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"paper_get_details","arguments":{"doi":"10.48550/arXiv.1706.03762"}}}'
```

Expected: success result with non-null `result`, `arxiv_id: "1706.03762"`, and `providers` containing `arxiv`.

- [ ] **Step 5: Run the patch release and verify the GitHub Release exists**

Run: `npm run release:patch`

Expected: a release commit is created, `package.json` becomes `0.4.1`, `CHANGELOG.md` gets a new top entry, git tag `v0.4.1` is pushed, and the GitHub Actions workflow creates a GitHub Release with generated notes.

Run: `gh release view v0.4.1`

Expected: GitHub Release `v0.4.1` exists and shows generated notes.

---

## Spec Coverage Check

- Paper bug 1 (`paper_search` legal query rejection): Task 1
- Paper bug 2 (`paper_get_details` arXiv id / arXiv DOI): Task 2
- Shared identifier normalization: Tasks 1-2
- Optional `/mcp` auth with Bearer / `x-api-key` / query param: Task 3
- `OPTIONS /mcp` and CORS `*`: Task 4
- Manifest-generated tool list / README automation: Task 5
- README rewrite, bilingual docs, client examples, demo URL, Cloudflare deploy button: Task 6
- changelog / semver / GitHub Release notes / release automation: Task 7
- local verification / cloud deployment / real-call validation / actual patch release: Task 8

## Placeholder Scan

- No `TODO`, `TBD`, or deferred placeholders remain.
- Every task names exact files.
- Every code-changing step includes concrete code.
- Every verification step includes an exact command and expected outcome.

## Type Consistency Check

- Auth env key is consistently `MCP_AUTH_KEYS`.
- README demo URL is consistently `https://mcp.awsl.app/mcp?key=elysia`.
- Canonical paper tool names remain `paper_search`, `paper_get_details`, `paper_get_related`, `paper_get_open_access`.
- Shared identifier resolver file is consistently `src/tools/paper/identifiers.ts`.

Plan complete and saved to `docs/superpowers/plans/2026-04-22-paper-auth-productize.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?