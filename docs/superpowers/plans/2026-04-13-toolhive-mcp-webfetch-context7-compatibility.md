# Toolhive MCP Webfetch / Context7 Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `webfetch` accept and implement `format`, and make `context7_resolve-library-id` accept `query`, `libraryName`, and `library_name` with deterministic precedence.

**Architecture:** Keep the current MCP architecture intact: schema exposure remains in `src/mcp/tool-registry.ts`, request validation stays in `src/mcp/router.ts` + `src/mcp/validate.ts`, and each tool handler continues to own its own normalization and upstream mapping. The work is split into two bounded implementation tasks plus one verification/deploy task so each behavior lands with targeted tests, a focused commit, and fresh evidence before moving on.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Vitest, JSON-RPC, `html-to-md`, Context7 MCP upstream.

---

## File map

### Existing files to modify
- Modify: `package.json` — add `html-to-md` as a runtime dependency
- Modify: `package-lock.json` — lock the new runtime dependency
- Modify: `src/mcp/tool-registry.ts` — extend `webfetch` schema and `context7.resolve-library-id` schema
- Modify: `src/tools/native/webfetch.ts` — add `format` handling and HTML-aware body formatting
- Modify: `src/tools/external/context7.ts` — normalize `libraryName` / `library_name` / `query` before upstream dispatch
- Modify: `tests/tools/native.test.ts` — add handler-level regression coverage for `webfetch` formats
- Modify: `tests/tools/external.test.ts` — add handler-level regression coverage for Context7 resolve aliases
- Modify: `tests/mcp/tool-registry.test.ts` — keep exposed schema assertions aligned with the handlers
- Modify: `tests/mcp/protocol.test.ts` — prove both fixes work through the JSON-RPC route

### Existing files to inspect but not modify unless implementation forces it
- Inspect: `src/mcp/router.ts` — confirm route validation order and `tools/call` behavior remain unchanged
- Inspect: `src/mcp/validate.ts` — remember that unsupported fields fail early with generic `Invalid params`
- Inspect: `src/mcp/result.ts` — route-level tests should assert on the serialized tool result text, not raw handler output
- Inspect: `wrangler.jsonc` — keep the Worker runtime as-is; do not add `nodejs_compat`

### Commands to use during implementation
- Focused webfetch tests: `npm test -- tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t webfetch`
- Focused Context7 tests: `npm test -- tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t context7`
- Full targeted suite: `npm test -- tests/tools/native.test.ts tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts`
- Full suite: `npm test`
- Typecheck: `npm run typecheck`
- Deploy: `npm run deploy`

---

### Task 1: Add real `webfetch` format support

**Files:**
- Modify: `tests/mcp/tool-registry.test.ts`
- Modify: `tests/tools/native.test.ts`
- Modify: `tests/mcp/protocol.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/mcp/tool-registry.ts`
- Modify: `src/tools/native/webfetch.ts`

- [ ] **Step 1: Add the failing schema assertion for `webfetch`**

In `tests/mcp/tool-registry.test.ts`, expand the existing `webfetch` schema expectation to include `format`:

```ts
    expect(webfetch?.inputSchema.properties).toMatchObject({
      method: { enum: ["GET", "POST"], default: "GET" },
      format: { enum: ["markdown", "text", "html"], default: "text" },
      return_responseheaders: { type: "boolean", default: false }
    });
```

- [ ] **Step 2: Add the failing handler-level `webfetch` tests**

In `tests/tools/native.test.ts`, add these three tests directly after the existing `webfetch POST forwards body` case:

```ts
  it("webfetch converts HTML responses to markdown when format is markdown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("<h1>Hello</h1><p>World</p>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    ));

    const result = await handleWebfetch(
      { url: "https://example.com/page", format: "markdown" },
      context
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { body: string }).body).toContain("Hello");
      expect((result.data as { body: string }).body).toContain("World");
      expect((result.data as { body: string }).body).not.toContain("<h1>");
    }
  });

  it("webfetch converts HTML responses to text when format is text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("<h1>Hello</h1><p>World</p>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    ));

    const result = await handleWebfetch(
      { url: "https://example.com/page", format: "text" },
      context
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as { body: string }).body).toContain("Hello");
      expect((result.data as { body: string }).body).toContain("World");
      expect((result.data as { body: string }).body).not.toContain("<h1>");
      expect((result.data as { body: string }).body).not.toContain("# Hello");
    }
  });

  it("webfetch leaves non-HTML responses unchanged when format is markdown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response('{"ok":true}', {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ));

    const result = await handleWebfetch(
      { url: "https://example.com/data", format: "markdown" },
      context
    );

    expect(result).toEqual({
      ok: true,
      data: {
        status: 200,
        url: "https://example.com/data",
        body: '{"ok":true}'
      }
    });
  });
```

- [ ] **Step 3: Add the failing JSON-RPC route test for `webfetch format`**

In `tests/mcp/protocol.test.ts`, add this case before `returns a repairable tool error when calc arguments are missing`:

```ts
  it("routes webfetch format through JSON-RPC without Invalid params", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("<h1>Hello</h1><p>World</p>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    ));

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "webfetch",
          arguments: {
            url: "https://example.com/page",
            format: "markdown"
          }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: false,
        content: [
          {
            type: "text",
            text: expect.stringContaining("Hello")
          }
        ]
      }
    });
  });
```

- [ ] **Step 4: Run the focused tests to verify they fail**

Run:
```bash
npm test -- tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t webfetch
```

Expected:
- FAIL
- at least one failure should show `Invalid params` for the JSON-RPC route case
- the registry assertion should fail because `format` is missing from the exposed schema

- [ ] **Step 5: Add the runtime dependency for HTML → Markdown conversion**

Run:
```bash
npm install html-to-md
```

Expected:
- `package.json` gains `html-to-md` under dependencies
- `package-lock.json` updates
- no other dependency changes are introduced

- [ ] **Step 6: Extend the public `webfetch` schema**

In `src/mcp/tool-registry.ts`, change the `webfetch` schema block to:

```ts
  {
    name: "webfetch",
    description: "Fetch a web page and return extracted content",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "HTTP or HTTPS URL to fetch" },
        method: { type: "string", enum: ["GET", "POST"], default: "GET" },
        requestheaders: {
          type: "object",
          additionalProperties: { type: "string" }
        },
        body: { type: "string" },
        format: { type: "string", enum: ["markdown", "text", "html"], default: "text" },
        return_responseheaders: { type: "boolean", default: false }
      },
      required: ["url"],
      additionalProperties: false
    }
  },
```

- [ ] **Step 7: Replace `src/tools/native/webfetch.ts` with the minimal formatting-aware implementation**

Replace the file contents with:

```ts
import html2md from "html-to-md";
import { upstreamError, validationError } from "../../lib/errors";
import { assertHttpUrl, DEFAULT_CHROME_UA, headersToObject } from "../../lib/http";
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type WebfetchArgs = {
  url?: unknown;
  method?: unknown;
  requestheaders?: unknown;
  body?: unknown;
  return_responseheaders?: unknown;
  format?: unknown;
};

type WebfetchFormat = "html" | "text" | "markdown";

function isHeaderRecord(value: unknown): value is Record<string, string> {
  return !!value &&
    typeof value === "object" &&
    Object.values(value).every((item) => typeof item === "string");
}

function isWebfetchFormat(value: unknown): value is WebfetchFormat {
  return value === "html" || value === "text" || value === "markdown";
}

function isHtmlContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }

  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "text/html" || mediaType === "application/xhtml+xml";
}

function compactText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function htmlToText(html: string): Promise<string> {
  const chunks: string[] = [];
  const transformed = new HTMLRewriter()
    .on("*", {
      text(text) {
        chunks.push(text.text);
        if (text.lastInTextNode) {
          chunks.push("\n");
        }
      }
    })
    .transform(
      new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );

  await transformed.text();
  return compactText(chunks.join(""));
}

async function formatBody(body: string, contentType: string | null, format: WebfetchFormat): Promise<string> {
  if (!isHtmlContentType(contentType) || format === "html") {
    return body;
  }

  if (format === "markdown") {
    return html2md(body);
  }

  return htmlToText(body);
}

export async function handleWebfetch(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const webfetchArgs = (args ?? {}) as WebfetchArgs;
  const url = assertHttpUrl(webfetchArgs.url);
  if (!(url instanceof URL)) {
    return url;
  }

  const method = webfetchArgs.method ?? "GET";
  if (method !== "GET" && method !== "POST") {
    return validationError("method must be GET or POST");
  }

  if (webfetchArgs.requestheaders !== undefined && !isHeaderRecord(webfetchArgs.requestheaders)) {
    return validationError("requestheaders must be an object of string values");
  }

  if (webfetchArgs.body !== undefined && typeof webfetchArgs.body !== "string") {
    return validationError("body must be a string");
  }

  if (webfetchArgs.format !== undefined && !isWebfetchFormat(webfetchArgs.format)) {
    return validationError("format must be html, text, or markdown");
  }

  let headers: Headers;
  try {
    headers = new Headers(webfetchArgs.requestheaders as HeadersInit | undefined);
    if (!headers.has("user-agent")) {
      headers.set("user-agent", DEFAULT_CHROME_UA);
    }
  } catch (error) {
    return validationError(
      error instanceof Error ? error.message : "requestheaders are invalid"
    );
  }

  const init: RequestInit = { method, headers };
  if (method === "POST" && webfetchArgs.body !== undefined) {
    init.body = webfetchArgs.body;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), init);
  } catch (error) {
    return upstreamError(
      error instanceof Error ? error.message : "webfetch request failed"
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (error) {
    return upstreamError(
      error instanceof Error ? error.message : "webfetch response read failed"
    );
  }

  if (!response.ok) {
    return upstreamError("webfetch request failed", response.status, body);
  }

  const format: WebfetchFormat = webfetchArgs.format ?? "text";

  let formattedBody: string;
  try {
    formattedBody = await formatBody(body, response.headers.get("content-type"), format);
  } catch (error) {
    return upstreamError(
      error instanceof Error ? error.message : "webfetch response formatting failed"
    );
  }

  return {
    ok: true,
    data: {
      status: response.status,
      url: url.toString(),
      body: formattedBody,
      ...(webfetchArgs.return_responseheaders === true ? { headers: headersToObject(response.headers) } : {})
    }
  };
}
```

- [ ] **Step 8: Run the focused tests again to verify they pass**

Run:
```bash
npm test -- tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t webfetch
```

Expected:
- PASS
- the new handler-level `webfetch` format tests are green
- the JSON-RPC route case no longer returns `Invalid params`

- [ ] **Step 9: Commit the `webfetch` fix**

Run:
```bash
git add package.json package-lock.json src/mcp/tool-registry.ts src/tools/native/webfetch.ts tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
git commit -m "fix: support webfetch format parameter"
```

Expected:
- one commit containing only the `webfetch` dependency, schema, handler, and test changes

---

### Task 2: Accept `libraryName` and `library_name` in Context7 resolve

**Files:**
- Modify: `tests/tools/external.test.ts`
- Modify: `tests/mcp/tool-registry.test.ts`
- Modify: `tests/mcp/protocol.test.ts`
- Modify: `src/mcp/tool-registry.ts`
- Modify: `src/tools/external/context7.ts`

- [ ] **Step 1: Add the failing handler-level Context7 resolve tests**

In `tests/tools/external.test.ts`, replace the existing `maps resolve query to Context7 libraryName` case with the following block of tests:

```ts
  it("accepts libraryName when resolving a library id", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7Resolve(
      { libraryName: "react" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [, init] = calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.params.arguments).toEqual({ query: "react", libraryName: "react" });
  });

  it("accepts library_name when resolving a library id", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7Resolve(
      { library_name: "vue" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [, init] = calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.params.arguments).toEqual({ query: "vue", libraryName: "vue" });
  });

  it("prefers libraryName over query when both are provided", async () => {
    const fetchMock = vi.fn(async () => Response.json({ jsonrpc: "2.0", id: 1, result: { content: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleContext7Resolve(
      { query: "react hooks", libraryName: "react" },
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result.ok).toBe(true);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    const [, init] = calls[0]!;
    const body = JSON.parse(String(init.body));
    expect(body.params.arguments).toEqual({ query: "react", libraryName: "react" });
  });

  it("returns a targeted validation error when no resolve alias is provided", async () => {
    const result = await handleContext7Resolve(
      {},
      { CONTEXT7_API_KEYS: "ctx-test" }
    );

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: "one of libraryName, library_name, or query must be a string"
      })
    });
  });
```

- [ ] **Step 2: Add the failing schema and JSON-RPC tests for Context7 resolve**

In `tests/mcp/tool-registry.test.ts`, replace the current resolve-schema assertions with:

```ts
    expect(context7Resolve?.inputSchema.properties).toMatchObject({
      query: { type: "string" },
      libraryName: { type: "string" },
      library_name: { type: "string" }
    });
    expect(context7Resolve?.inputSchema.required).toBeUndefined();
```

In `tests/mcp/protocol.test.ts`, add this case before `keeps legacy dotted tool names working for tools/call`:

```ts
  it("accepts libraryName for context7 resolve over JSON-RPC", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: "ok" }] }
        })
      )
    );

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "context7_resolve-library-id",
          arguments: { libraryName: "react" }
        })
      ),
      { CONTEXT7_API_KEYS: "ctx-test" },
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        isError: false,
        content: [{ type: "text", text: "ok" }]
      }
    });
  });
```

- [ ] **Step 3: Run the focused Context7 tests to verify they fail**

Run:
```bash
npm test -- tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t context7
```

Expected:
- FAIL
- at least one failure should come from schema validation rejecting `libraryName`
- the registry assertion should fail because `libraryName` / `library_name` are not yet exposed

- [ ] **Step 4: Expand the public Context7 resolve schema**

In `src/mcp/tool-registry.ts`, replace the `context7.resolve-library-id` schema block with:

```ts
  {
    legacyName: "context7.resolve-library-id",
    description: "Resolve a Context7 library identifier from a package or library name",
    requiresEnv: "CONTEXT7_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Package or library name to resolve" },
        libraryName: { type: "string", description: "Preferred explicit library name input" },
        library_name: { type: "string", description: "Snake_case alias for libraryName" }
      },
      additionalProperties: false
    }
  },
```

- [ ] **Step 5: Normalize resolve aliases in the handler**

In `src/tools/external/context7.ts`, replace `handleContext7Resolve()` with:

```ts
export async function handleContext7Resolve(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const input = args as {
    query?: unknown;
    libraryName?: unknown;
    library_name?: unknown;
  } | undefined;

  const normalized = typeof input?.libraryName === "string"
    ? input.libraryName
    : typeof input?.library_name === "string"
      ? input.library_name
      : typeof input?.query === "string"
        ? input.query
        : undefined;

  if (typeof normalized !== "string") {
    return validationError("one of libraryName, library_name, or query must be a string");
  }

  return callContext7("resolve-library-id", { query: normalized, libraryName: normalized }, env);
}
```

- [ ] **Step 6: Run the focused Context7 tests again to verify they pass**

Run:
```bash
npm test -- tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t context7
```

Expected:
- PASS
- the handler-level alias tests are green
- the JSON-RPC route accepts `libraryName` without returning `Invalid params`

- [ ] **Step 7: Commit the Context7 compatibility fix**

Run:
```bash
git add src/mcp/tool-registry.ts src/tools/external/context7.ts tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
git commit -m "fix: accept context7 resolve aliases"
```

Expected:
- one commit containing only the Context7 schema, handler, and test changes

---

### Task 3: Verify, deploy, and validate the public MCP surface

**Files:**
- Modify: none
- Verify: local test output, typecheck output, deployed MCP responses

- [ ] **Step 1: Run the combined targeted suite**

Run:
```bash
npm test -- tests/tools/native.test.ts tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
```

Expected:
- PASS
- 0 failed
- the new `webfetch` and Context7 compatibility cases are part of the passing run

- [ ] **Step 2: Run the full test suite**

Run:
```bash
npm test
```

Expected:
- PASS
- entire repository test suite remains green

- [ ] **Step 3: Run typecheck**

Run:
```bash
npm run typecheck
```

Expected:
- PASS
- `tsc --noEmit` exits with code 0

- [ ] **Step 4: Deploy to Cloudflare Workers**

Run:
```bash
npm run deploy
```

Expected:
- Wrangler reports a successful deploy
- the custom-domain Worker at `mcp.awsl.app` updates without enabling `workers.dev`

- [ ] **Step 5: Verify `tools/list` on the deployed endpoint**

Run:
```bash
python - <<'PY'
import json, urllib.request
payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
req = urllib.request.Request(
    "https://mcp.awsl.app/mcp",
    data=json.dumps(payload).encode(),
    headers={"content-type": "application/json"},
    method="POST",
)
body = json.load(urllib.request.urlopen(req))
tools = {tool["name"]: tool for tool in body["result"]["tools"]}
print(tools["webfetch"]["inputSchema"]["properties"]["format"])
print(sorted(tools["context7_resolve-library-id"]["inputSchema"]["properties"].keys()))
PY
```

Expected:
- first line shows a schema object containing `markdown`, `text`, and `html`
- second line includes `libraryName`, `library_name`, and `query`

- [ ] **Step 6: Verify `tools/call` against the deployed endpoint**

Run:
```bash
python - <<'PY'
import json, urllib.request
calls = [
    {
        "name": "webfetch",
        "arguments": {"url": "https://httpbin.org/html", "format": "markdown"},
    },
    {
        "name": "context7_resolve-library-id",
        "arguments": {"libraryName": "react"},
    },
    {
        "name": "context7_resolve-library-id",
        "arguments": {"library_name": "vue"},
    },
    {
        "name": "context7_resolve-library-id",
        "arguments": {"query": "react hooks", "libraryName": "react"},
    },
]
for call in calls:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": call,
    }
    req = urllib.request.Request(
        "https://mcp.awsl.app/mcp",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    body = json.load(urllib.request.urlopen(req))
    text = body["result"]["content"][0]["text"]
    print(call["name"], body["result"]["isError"], text[:180].replace("\n", " "))
PY
```

Expected:
- `webfetch False ...` and the snippet should no longer indicate `Invalid params`
- each `context7_resolve-library-id` call prints `False`
- the mixed `query + libraryName` call resolves using `libraryName` rather than the longer `query` value

---

## Self-review checklist

- Spec coverage: Task 1 covers `webfetch format` schema + real behavior + Worker-compatible library choice. Task 2 covers `query` / `libraryName` / `library_name` plus deterministic precedence and targeted validation. Task 3 covers local verification, deploy, and live endpoint validation.
- Placeholder scan: no `TODO`, `TBD`, “similar to”, or unspecified “add tests” steps remain.
- Type consistency: `format` is consistently `"markdown" | "text" | "html"`; Context7 resolve aliases are consistently `query`, `libraryName`, and `library_name`.
