# Toolhive MCP IP / Exa Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the misleading public `tavily_research` tool, replace `ip` with a simpler `whoami`, add `iplookup` and `exa_search`, fix numeric-string Unix timestamps, update docs, verify locally, deploy to Cloudflare, and commit the finished work.

**Architecture:** Keep the current MCP architecture intact: tool exposure stays centralized in the registry, dispatch stays centralized in the router, and each tool handler remains responsible for its own upstream validation/mapping. The work is split into six bounded tasks: one narrow bug fix, two public-surface changes, two new tool integrations, and one documentation/deploy pass. Follow TDD in each task and prefer focused edits over refactors.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Vitest, Git, JSON-RPC, Tavily HTTP API, ip-api free JSON API, Exa Search HTTP API.

---

## File map

### Existing files to modify
- Modify: `src/tools/devutils/timestamp.ts:1-12` — accept Unix timestamps passed as digit-only strings
- Modify: `tests/tools/devutils.test.ts:71-78` — add regression coverage for numeric-string timestamps
- Modify: `src/tools/native/ip.ts:1-22` — repurpose the current handler into `handleWhoami()` with a compact payload
- Modify: `src/mcp/tool-registry.ts:5-87, 127-205, 459-487` — rename native `ip` to `whoami`, remove public `tavily_research`, add `iplookup`, add `exa_search`, extend env-gated tool list
- Modify: `src/mcp/router.ts:22-43, 98-175` — dispatch `whoami`, `iplookup`, `exa_search`, remove public dispatch for `tavily_research`
- Modify: `src/lib/env.ts:1-10` — allow `EXA_API_KEYS` in `hasKeys()`
- Modify: `src/mcp/schema.ts:8-13` — add `EXA_API_KEYS` to `ToolDefinition.requiresEnv`
- Modify: `tests/tools/native.test.ts:1-539` — rename `ip` tests to `whoami` and assert compact output
- Modify: `tests/tools/external.test.ts:29-354, 541-800` — remove public Tavily research expectations, add `iplookup` and `exa_search` tests
- Modify: `tests/mcp/tool-registry.test.ts:17-289` — update public tool list and env-gating assertions
- Modify: `tests/mcp/protocol.test.ts:76-241` — update `tools/list` / `tools/call` protocol assertions for the new surface
- Modify: `README.md:18-113` — replace feature and secrets sections to reflect `whoami`, `iplookup`, `exa_search`, and the removal of `tavily_research`
- Modify: `README.zh-CN.md:18-114` — same as English README, but in natural Chinese

### New files to create
- Create: `src/tools/external/iplookup.ts` — arbitrary IP/domain lookup via `http://ip-api.com/json/{query}?fields=55312383`
- Create: `src/tools/external/exa.ts` — curated synchronous Exa search tool with key rotation and output mapping

### Existing files to inspect but not modify unless verification forces it
- Inspect: `src/lib/upstream.ts:1-99` — reuse `fetchWithKeyRetry()` for Exa auth/network retry behavior
- Inspect: `src/lib/errors.ts:1-45` — keep error typing aligned with existing `validation_error`, `upstream_error`, `config_error`
- Inspect: `src/mcp/validate.ts:1-80` — remember schema-level `required` fields produce generic `Invalid params`, so handler-level validation should preserve user-facing messages when needed
- Inspect: `src/worker.ts:13-44` — keep the public `/mcp` route unchanged

### Commands to use during implementation
Use PowerShell for Vitest and TypeScript verification in this environment.

- Focused test: `powershell -Command "npx vitest run tests/tools/devutils.test.ts"`
- Focused test: `powershell -Command "npx vitest run tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts"`
- Focused test: `powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts"`
- Full test suite: `powershell -Command "npm test"`
- Typecheck: `powershell -Command "npm run typecheck"`
- Deploy: `powershell -Command "npm run deploy"`

---

### Task 1: Fix numeric-string Unix timestamp parsing

**Files:**
- Modify: `tests/tools/devutils.test.ts:71-78`
- Modify: `src/tools/devutils/timestamp.ts:1-12`
- Test: `tests/tools/devutils.test.ts`

- [ ] **Step 1: Write the failing regression test**

Add this test directly after the existing `converts unix timestamps` case in `tests/tools/devutils.test.ts`:

```ts
  it("converts unix timestamps passed as numeric strings", async () => {
    const result = await handleTimestampConvert({ value: "1710000000" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.data as any).unix).toBe(1710000000);
    }
  });
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:
```bash
powershell -Command "npx vitest run tests/tools/devutils.test.ts -t 'converts unix timestamps passed as numeric strings'"
```

Expected:
- FAIL
- The failure should show `result.ok` is `false`
- The error message should include `Invalid date or timestamp`

- [ ] **Step 3: Write the minimal implementation in `src/tools/devutils/timestamp.ts`**

Replace the body of `handleTimestampConvert()` with this implementation:

```ts
export async function handleTimestampConvert(args: unknown): Promise<ToolExecutionResult> {
  const input = args as { value?: unknown } | undefined;
  if (!input || (typeof input.value !== "string" && typeof input.value !== "number")) {
    return validationError("value must be a string or number");
  }

  const rawValue = input.value;
  const date = typeof rawValue === "number"
    ? new Date(rawValue * 1000)
    : /^\d+$/.test(rawValue)
      ? new Date(Number(rawValue) * 1000)
      : new Date(rawValue);

  if (!Number.isFinite(date.getTime())) {
    return validationError("Invalid date or timestamp");
  }

  return {
    ok: true,
    data: {
      iso: date.toISOString(),
      unix: Math.floor(date.getTime() / 1000)
    }
  };
}
```

- [ ] **Step 4: Run the focused test again to verify it passes**

Run:
```bash
powershell -Command "npx vitest run tests/tools/devutils.test.ts -t 'converts unix timestamps passed as numeric strings'"
```

Expected:
- PASS
- 1 test passed, 0 failed

- [ ] **Step 5: Run the full devutils suite**

Run:
```bash
powershell -Command "npx vitest run tests/tools/devutils.test.ts"
```

Expected:
- PASS
- Existing timestamp and devutils cases remain green

- [ ] **Step 6: Commit the timestamp fix**

Run:
```bash
git add tests/tools/devutils.test.ts src/tools/devutils/timestamp.ts
git commit -m $'fix: accept numeric string unix timestamps\n\nAllow devutils_timestamp_convert to treat digit-only strings as Unix seconds so MCP clients can pass numeric timestamps without converting them to numbers first.\n\nConstraint: Keep parsing narrow and avoid adding millisecond heuristics\nRejected: Add broad natural-language date parsing | outside the reported bug scope\nConfidence: high\nScope-risk: narrow'
```

---

### Task 2: Replace `ip` with compact `whoami`

**Files:**
- Modify: `src/tools/native/ip.ts:1-22`
- Modify: `src/mcp/tool-registry.ts:72-87`
- Modify: `src/mcp/router.ts:39-41, 100-109`
- Modify: `tests/tools/native.test.ts:3-7, 238-255, 440-475`
- Modify: `tests/mcp/tool-registry.test.ts:17-33, 34-88`
- Modify: `tests/mcp/protocol.test.ts:230-240`

- [ ] **Step 1: Write the failing native and registry tests**

In `tests/tools/native.test.ts`, change the import and replace the current IP assertions with these tests:

```ts
import { handleWhoami } from "../../src/tools/native/ip";
```

```ts
  it("whoami returns a compact self-IP payload", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.42",
        "user-agent": "ToolhiveTest/1.0"
      }
    });

    const result = await handleWhoami({}, { ...context, request });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        ip: "203.0.113.42",
        source: "cf-connecting-ip",
        user_agent: "ToolhiveTest/1.0"
      })
    });

    if (result.ok) {
      expect((result.data as any).headers).toBeUndefined();
      expect((result.data as any).cf).toBeUndefined();
      expect((result.data as any).method).toBeUndefined();
      expect((result.data as any).url).toBeUndefined();
    }
  });
```

```ts
  it("router keeps whoami as a true no-argument tool", async () => {
    const request = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.42"
      }
    });

    const response = await handleJsonRpc(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "whoami",
          arguments: {}
        }
      },
      {},
      request
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("203.0.113.42")
          }
        ]
      }
    });
  });
```

In `tests/mcp/tool-registry.test.ts`, update the first list assertion to include `whoami` and exclude `ip`:

```ts
    expect(names).toContain("whoami");
    expect(names).not.toContain("ip");
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:
```bash
powershell -Command "npx vitest run tests/tools/native.test.ts tests/mcp/tool-registry.test.ts -t 'whoami'"
```

Expected:
- FAIL because `handleWhoami` does not exist yet
- FAIL because `whoami` is not yet registered

- [ ] **Step 3: Replace the native tool and dispatch surface**

In `src/tools/native/ip.ts`, replace the export with this compact handler:

```ts
import type { ToolContext } from "../types";
import type { ToolExecutionResult } from "../../mcp/result";

type CloudflareRequest = Request & {
  cf?: {
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  };
};

function readSource(headers: Headers): { ip: string | null; source: string | null } {
  const headerOrder = [
    ["cf-connecting-ip", headers.get("cf-connecting-ip")],
    ["x-forwarded-for", headers.get("x-forwarded-for")],
    ["x-real-ip", headers.get("x-real-ip")]
  ] as const;

  for (const [name, value] of headerOrder) {
    if (value) {
      return {
        ip: value.split(",")[0]!.trim(),
        source: name
      };
    }
  }

  return { ip: null, source: null };
}

export async function handleWhoami(_args: unknown, context: ToolContext): Promise<ToolExecutionResult> {
  const headers = context.request.headers;
  const { ip, source } = readSource(headers);
  const cf = (context.request as CloudflareRequest).cf;

  return {
    ok: true,
    data: {
      ip,
      country: cf?.country ?? null,
      country_code: cf?.country ?? null,
      region: cf?.region ?? null,
      city: cf?.city ?? null,
      timezone: cf?.timezone ?? null,
      source,
      user_agent: headers.get("user-agent")
    }
  };
}
```

In `src/mcp/tool-registry.ts`, replace the native entry with:

```ts
  {
    name: "whoami",
    description: "Get the IP and location summary for the current request only",
    inputSchema: emptyObjectSchema
  }
```

In `src/mcp/router.ts`, change the import and dispatch case:

```ts
import { handleWhoami } from "../tools/native/ip";
```

```ts
    case "whoami":
      return handleWhoami(args, context);
```

- [ ] **Step 4: Run the focused tests again to verify they pass**

Run:
```bash
powershell -Command "npx vitest run tests/tools/native.test.ts tests/mcp/tool-registry.test.ts -t 'whoami'"
```

Expected:
- PASS
- `whoami` appears in the tool list
- the compact payload no longer exposes the raw request dump

- [ ] **Step 5: Run the broader native/protocol suite**

Run:
```bash
powershell -Command "npx vitest run tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts"
```

Expected:
- PASS
- `ip`-specific assertions have all been replaced cleanly

- [ ] **Step 6: Commit the `whoami` rename**

Run:
```bash
git add src/tools/native/ip.ts src/mcp/tool-registry.ts src/mcp/router.ts tests/tools/native.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
git commit -m $'feat: replace ip with whoami\n\nRename the public self-IP tool to whoami and shrink its payload to a compact identity summary so MCP clients understand it as a self-inspection tool instead of a generic request dump.\n\nConstraint: No backwards-compatible ip alias\nRejected: Keep full headers and cf payload | too noisy for LLM clients\nConfidence: high\nScope-risk: moderate'
```

---

### Task 3: Remove public `tavily_research` exposure

**Files:**
- Modify: `src/mcp/tool-registry.ts:190-205`
- Modify: `src/mcp/router.ts:22-27, 110-117`
- Modify: `tests/tools/external.test.ts:237-275`
- Modify: `tests/mcp/tool-registry.test.ts:144-205, 244-274`
- Modify: `tests/mcp/protocol.test.ts:76-114`

- [ ] **Step 1: Write the failing list-surface assertions**

In `tests/mcp/tool-registry.test.ts`, remove `tavilyResearch` lookup and replace the relevant expectations with:

```ts
    expect(names).toContain("tavily_search");
    expect(names).toContain("tavily_extract");
    expect(names).toContain("tavily_crawl");
    expect(names).not.toContain("tavily_research");
```

```ts
    expect(withoutEnvNames).not.toContain("tavily_research");
    expect(withEnvNames).not.toContain("tavily_research");
```

In `tests/mcp/protocol.test.ts`, tighten the `tools/list` assertion:

```ts
    expect(defaultNames).not.toContain("tavily_research");
    expect(disabledNames).not.toContain("tavily_research");
```

- [ ] **Step 2: Run the focused registry/protocol tests to verify they fail**

Run:
```bash
powershell -Command "npx vitest run tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t 'tavily_research'"
```

Expected:
- FAIL because the current registry still exposes `tavily_research`

- [ ] **Step 3: Remove `tavily_research` from the public surface only**

In `src/mcp/tool-registry.ts`, delete this `externalToolConfigs` entry entirely:

```ts
  {
    legacyName: "tavily.research",
    description: "Perform deep research with Tavily",
    requiresEnv: "TAVILY_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Research task description" },
        model: { type: "string" },
        stream: { type: "boolean" },
        output_schema: {},
        citation_format: { type: "string" }
      },
      required: ["input"],
      additionalProperties: false
    }
  },
```

In `src/mcp/router.ts`, remove the import and dispatch case:

```ts
  handleTavilyResearch,
```

```ts
    case "tavily_research":
      return handleTavilyResearch(args, context.env);
```

Do **not** delete `handleTavilyResearch()` from `src/tools/external/tavily.ts`.

- [ ] **Step 4: Run the focused tests again to verify they pass**

Run:
```bash
powershell -Command "npx vitest run tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t 'tavily_research'"
```

Expected:
- PASS
- `tavily_research` no longer appears in `tools/list`

- [ ] **Step 5: Run the external/protocol suites**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts"
```

Expected:
- PASS
- Tavily search/extract/crawl behavior remains intact
- only the public research exposure disappears

- [ ] **Step 6: Commit the Tavily surface cleanup**

Run:
```bash
git add src/mcp/tool-registry.ts src/mcp/router.ts tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
git commit -m $'fix: remove tavily research from public surface\n\nStop advertising tavily_research through MCP because the current surface cannot complete research jobs end-to-end without polling support.\n\nConstraint: Keep the internal implementation for future re-enable\nRejected: Leave the tool visible and just document caveats | still misleading to clients\nConfidence: high\nScope-risk: narrow'
```

---

### Task 4: Add `iplookup` via ip-api free JSON endpoint

**Files:**
- Create: `src/tools/external/iplookup.ts`
- Modify: `src/mcp/tool-registry.ts:88-98`
- Modify: `src/mcp/router.ts:8-28, 110-125`
- Modify: `tests/tools/external.test.ts`
- Modify: `tests/mcp/tool-registry.test.ts:17-33`
- Modify: `tests/mcp/protocol.test.ts:172-241`

- [ ] **Step 1: Write the failing tests for handler, registry, and route dispatch**

In `tests/tools/external.test.ts`, add this new describe block before `describe("Domain tools")`:

```ts
describe("IP lookup tool", () => {
  it("maps ip-api success responses to curated fields plus raw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({
        status: "success",
        query: "8.8.8.8",
        country: "United States",
        countryCode: "US",
        region: "CA",
        regionName: "California",
        city: "Mountain View",
        timezone: "America/Los_Angeles",
        lat: 37.4056,
        lon: -122.0775,
        zip: "94043",
        isp: "Google LLC",
        org: "Google Public DNS",
        as: "AS15169 Google LLC",
        asname: "GOOGLE",
        mobile: false,
        proxy: false,
        hosting: true
      }))
    );

    const result = await handleIpLookup({ query: "8.8.8.8" });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        query: "8.8.8.8",
        ip: "8.8.8.8",
        country: "United States",
        country_code: "US",
        region: "California",
        region_code: "CA",
        city: "Mountain View",
        timezone: "America/Los_Angeles",
        isp: "Google LLC",
        raw: expect.any(Object)
      })
    });
  });

  it("returns validation_error when ip-api rejects the query", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({
        status: "fail",
        message: "invalid query",
        query: "bad-ip"
      }))
    );

    const result = await handleIpLookup({ query: "bad-ip" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "validation_error",
        message: expect.stringContaining("invalid query")
      })
    });
  });

  it("returns upstream_error when ip-api rate limits the request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("too many requests", {
        status: 429,
        headers: {
          "X-Rl": "0",
          "X-Ttl": "60"
        }
      }))
    );

    const result = await handleIpLookup({ query: "8.8.8.8" });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        type: "upstream_error",
        message: expect.stringContaining("rate limit")
      })
    });
  });
});
```

Also add a route-level protocol assertion in `tests/mcp/protocol.test.ts`:

```ts
  it("routes iplookup through JSON-RPC", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      status: "success",
      query: "8.8.8.8",
      country: "United States",
      countryCode: "US"
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request(
        "https://example.com/mcp",
        jsonRpcRequest("tools/call", {
          name: "iplookup",
          arguments: { query: "8.8.8.8" }
        })
      ),
      {},
      ctx
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("8.8.8.8")
          }
        ]
      }
    });
  });
```

- [ ] **Step 2: Run the focused tests to verify they fail**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/protocol.test.ts -t 'iplookup|IP lookup tool'"
```

Expected:
- FAIL because `handleIpLookup` and the `iplookup` route do not exist yet

- [ ] **Step 3: Create `src/tools/external/iplookup.ts` with the minimal implementation**

Create `src/tools/external/iplookup.ts` with this content:

```ts
import { upstreamError, validationError } from "../../lib/errors";
import type { ToolExecutionResult } from "../../mcp/result";

type IpApiSuccess = {
  status: "success";
  query: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  timezone?: string;
  lat?: number;
  lon?: number;
  zip?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  mobile?: boolean;
  proxy?: boolean;
  hosting?: boolean;
};

type IpApiFailure = {
  status: "fail";
  message?: string;
  query?: string;
};

export async function handleIpLookup(args: unknown): Promise<ToolExecutionResult> {
  const query = (args as { query?: unknown } | undefined)?.query;
  if (typeof query !== "string" || query.trim() === "") {
    return validationError("query must be a non-empty string");
  }

  const url = `http://ip-api.com/json/${encodeURIComponent(query)}?fields=55312383`;
  const response = await fetch(url);

  if (response.status === 429) {
    const remaining = response.headers.get("X-Rl");
    const resetSeconds = response.headers.get("X-Ttl");
    return upstreamError(
      `ip-api.com rate limit exceeded (remaining=${remaining ?? "unknown"}, reset=${resetSeconds ?? "unknown"}s)`,
      429
    );
  }

  if (!response.ok) {
    return upstreamError(`ip-api.com returned ${response.status}: ${await response.text()}`, response.status);
  }

  let parsed: IpApiSuccess | IpApiFailure;
  try {
    parsed = await response.json() as IpApiSuccess | IpApiFailure;
  } catch {
    return upstreamError("ip-api.com returned invalid JSON");
  }

  if (parsed.status === "fail") {
    return validationError(`ip-api.com lookup failed: ${parsed.message ?? "unknown error"}`, parsed);
  }

  return {
    ok: true,
    data: {
      query,
      ip: parsed.query,
      country: parsed.country ?? null,
      country_code: parsed.countryCode ?? null,
      region: parsed.regionName ?? parsed.region ?? null,
      region_code: parsed.region ?? null,
      city: parsed.city ?? null,
      timezone: parsed.timezone ?? null,
      lat: parsed.lat ?? null,
      lon: parsed.lon ?? null,
      zip: parsed.zip ?? null,
      isp: parsed.isp ?? null,
      org: parsed.org ?? null,
      as: parsed.as ?? null,
      asname: parsed.asname ?? null,
      mobile: parsed.mobile ?? null,
      proxy: parsed.proxy ?? null,
      hosting: parsed.hosting ?? null,
      raw: parsed
    }
  };
}
```

Then wire it into the registry and router.

In `src/mcp/tool-registry.ts`, add this native-adjacent public tool definition after `whoami`:

```ts
  {
    name: "iplookup",
    description: "Look up location and network information for an IP address or domain",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "IPv4, IPv6, or domain to look up"
        }
      },
      required: ["query"],
      additionalProperties: false
    }
  }
```

In `src/mcp/router.ts`, add:

```ts
import { handleIpLookup } from "../tools/external/iplookup";
```

```ts
    case "iplookup":
      return handleIpLookup(args);
```

- [ ] **Step 4: Run the focused tests again to verify they pass**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/protocol.test.ts -t 'iplookup|IP lookup tool'"
```

Expected:
- PASS
- `iplookup` maps success/failure/rate-limit responses correctly

- [ ] **Step 5: Run the registry/protocol suite for the new public tool**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts"
```

Expected:
- PASS
- `iplookup` appears in `tools/list` without requiring env keys

- [ ] **Step 6: Commit the new IP lookup tool**

Run:
```bash
git add src/tools/external/iplookup.ts src/mcp/tool-registry.ts src/mcp/router.ts tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
git commit -m $'feat: add iplookup tool\n\nAdd a dedicated arbitrary IP/domain lookup tool backed by ip-api so the self-only whoami tool no longer needs to carry two unrelated meanings.\n\nConstraint: Use the documented free JSON endpoint and curated output fields\nRejected: Reuse whoami or expose the full upstream payload only | poorer tool semantics for clients\nConfidence: high\nScope-risk: moderate'
```

---

### Task 5: Add env-gated `exa_search`

**Files:**
- Create: `src/tools/external/exa.ts`
- Modify: `src/lib/env.ts:5-10`
- Modify: `src/mcp/schema.ts:8-13`
- Modify: `src/mcp/tool-registry.ts:98-228, 450-487`
- Modify: `src/mcp/router.ts:8-28, 118-125`
- Modify: `tests/tools/external.test.ts:541-800`
- Modify: `tests/mcp/tool-registry.test.ts:137-205, 244-288`
- Modify: `tests/mcp/protocol.test.ts:76-114`

- [ ] **Step 1: Write the failing Exa tests**

In `tests/tools/external.test.ts`, add this block after the Tavily tests:

```ts
describe("Exa search tool", () => {
  it("posts curated synchronous search requests to Exa", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      requestId: "req_exa_1",
      results: [
        {
          id: "exa-1",
          title: "Toolhive MCP",
          url: "https://example.com/toolhive",
          publishedDate: "2026-04-13T00:00:00.000Z",
          author: "DoingDog",
          score: 0.99,
          text: "Toolhive MCP content",
          highlights: ["Toolhive highlight"],
          summary: "Toolhive summary",
          image: "https://example.com/image.png",
          favicon: "https://example.com/favicon.ico"
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await handleExaSearch(
      {
        query: "Toolhive MCP",
        limit: 5,
        search_type: "auto",
        include_domains: ["example.com"],
        include_text: true,
        text_max_characters: 400,
        include_highlights: true,
        highlights_max_characters: 200,
        include_summary: true,
        summary_query: "Summarize Toolhive MCP"
      },
      { EXA_API_KEYS: "exa-test" }
    );

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        request_id: "req_exa_1",
        results: [
          expect.objectContaining({
            id: "exa-1",
            title: "Toolhive MCP",
            url: "https://example.com/toolhive",
            text: "Toolhive MCP content",
            highlights: ["Toolhive highlight"],
            summary: "Toolhive summary"
          })
        ]
      })
    });

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.exa.ai/search",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-api-key": "exa-test" })
      })
    );
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: "Toolhive MCP",
      numResults: 5,
      type: "auto",
      includeDomains: ["example.com"],
      contents: {
        text: { maxCharacters: 400 },
        highlights: { maxCharacters: 200 },
        summary: { query: "Summarize Toolhive MCP" }
      }
    });
  });

  it("rotates Exa API keys after an unauthorized response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 403 }))
      .mockResolvedValueOnce(Response.json({ requestId: "req_exa_2", results: [] }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);

    const result = await handleExaSearch(
      { query: "Toolhive MCP" },
      { EXA_API_KEYS: "exa-first,exa-second" }
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.exa.ai/search",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "exa-first" })
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.exa.ai/search",
      expect.objectContaining({
        headers: expect.objectContaining({ "x-api-key": "exa-second" })
      })
    );
  });
});
```

In `tests/mcp/tool-registry.test.ts`, extend env-gated exposure assertions:

```ts
    expect(names).not.toContain("exa_search");
```

```ts
      EXA_API_KEYS: "e1,e2"
```

```ts
    const exaSearch = tools.find((tool) => tool.name === "exa_search");
    expect(names).toContain("exa_search");
    expect(exaSearch?.inputSchema.properties).toHaveProperty("query");
    expect(exaSearch?.inputSchema.properties).toHaveProperty("include_text");
    expect(exaSearch?.inputSchema.properties).toHaveProperty("include_summary");
```

In `tests/mcp/protocol.test.ts`, add `exa_search` to env-gated list checks.

- [ ] **Step 2: Run the focused Exa tests to verify they fail**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t 'Exa|exa_search'"
```

Expected:
- FAIL because `EXA_API_KEYS` is not yet typed or exposed and `handleExaSearch` does not exist

- [ ] **Step 3: Extend env typing and add the Exa handler**

In `src/lib/env.ts`, change `hasKeys()` to:

```ts
export function hasKeys(
  env: AppEnv,
  name: "CONTEXT7_API_KEYS" | "TAVILY_API_KEYS" | "UNSPLASH_ACCESS_KEYS" | "PUREMD_API_KEYS" | "EXA_API_KEYS"
): boolean {
  return parseKeyList(env[name]).length > 0;
}
```

In `src/mcp/schema.ts`, change `requiresEnv` to:

```ts
  requiresEnv?: "CONTEXT7_API_KEYS" | "TAVILY_API_KEYS" | "UNSPLASH_ACCESS_KEYS" | "PUREMD_API_KEYS" | "EXA_API_KEYS";
```

Create `src/tools/external/exa.ts` with this content:

```ts
import type { AppEnv } from "../../lib/env";
import { configError, upstreamError, validationError } from "../../lib/errors";
import { parseKeyList } from "../../lib/keys";
import { fetchWithKeyRetry } from "../../lib/upstream";
import type { ToolExecutionResult } from "../../mcp/result";

type ExaResult = {
  id?: string;
  title?: string;
  url: string;
  publishedDate?: string;
  author?: string | null;
  score?: number;
  text?: string;
  highlights?: string[];
  summary?: string;
  image?: string;
  favicon?: string;
};

type ExaResponse = {
  requestId?: string;
  results?: ExaResult[];
};

export async function handleExaSearch(args: unknown, env: AppEnv): Promise<ToolExecutionResult> {
  const input = args as Record<string, unknown> | undefined;
  if (!input || typeof input.query !== "string") {
    return validationError("query must be a string");
  }

  const keys = parseKeyList(env.EXA_API_KEYS);
  if (keys.length === 0) {
    return configError("EXA_API_KEYS is not configured");
  }

  const contents: Record<string, unknown> = {};
  if (input.include_text === true) {
    contents.text = typeof input.text_max_characters === "number"
      ? { maxCharacters: input.text_max_characters }
      : true;
  }
  if (input.include_highlights === true) {
    contents.highlights = typeof input.highlights_max_characters === "number"
      ? { maxCharacters: input.highlights_max_characters }
      : true;
  }
  if (input.include_summary === true) {
    contents.summary = typeof input.summary_query === "string"
      ? { query: input.summary_query }
      : true;
  }
  if (typeof input.livecrawl === "string") {
    contents.livecrawl = input.livecrawl;
  }

  const body: Record<string, unknown> = {
    query: input.query
  };

  if (typeof input.limit === "number") body.numResults = input.limit;
  if (typeof input.search_type === "string") body.type = input.search_type;
  if (typeof input.category === "string") body.category = input.category;
  if (Array.isArray(input.include_domains)) body.includeDomains = input.include_domains;
  if (Array.isArray(input.exclude_domains)) body.excludeDomains = input.exclude_domains;
  if (typeof input.start_published_date === "string") body.startPublishedDate = input.start_published_date;
  if (typeof input.end_published_date === "string") body.endPublishedDate = input.end_published_date;
  if (typeof input.start_crawl_date === "string") body.startCrawlDate = input.start_crawl_date;
  if (typeof input.end_crawl_date === "string") body.endCrawlDate = input.end_crawl_date;
  if (typeof input.moderation === "boolean") body.moderation = input.moderation;
  if (typeof input.user_location === "string") body.userLocation = input.user_location;
  if (Object.keys(contents).length > 0) body.contents = contents;

  const result = await fetchWithKeyRetry({
    keys,
    serviceName: "Exa Search API",
    makeRequest: (key) => ({
      url: "https://api.exa.ai/search",
      init: {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key
        },
        body: JSON.stringify(body)
      }
    })
  });

  if ("error" in result) {
    return result;
  }

  let parsed: ExaResponse;
  try {
    parsed = JSON.parse(result.text) as ExaResponse;
  } catch {
    return upstreamError("Exa Search API returned invalid JSON");
  }

  if (!Array.isArray(parsed.results)) {
    return upstreamError("Exa Search API returned unexpected response shape");
  }

  return {
    ok: true,
    data: {
      request_id: parsed.requestId ?? null,
      results: parsed.results.map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url,
        published_date: item.publishedDate,
        author: item.author,
        score: item.score,
        text: item.text,
        highlights: item.highlights,
        summary: item.summary,
        image: item.image,
        favicon: item.favicon
      })),
      raw: parsed
    }
  };
}
```

- [ ] **Step 4: Register `exa_search` and add router dispatch**

In `src/mcp/tool-registry.ts`, add this env-gated external config after the Tavily entries:

```ts
  {
    legacyName: "exa.search",
    description: "Search the web with Exa and optionally return text, highlights, and summaries",
    requiresEnv: "EXA_API_KEYS",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        search_type: { type: "string", enum: ["auto", "fast", "neural", "instant", "deep-lite", "deep"] },
        category: { type: "string", enum: ["company", "research paper", "news", "personal site", "financial report", "people"] },
        include_domains: { type: "array", items: { type: "string" } },
        exclude_domains: { type: "array", items: { type: "string" } },
        start_published_date: { type: "string" },
        end_published_date: { type: "string" },
        start_crawl_date: { type: "string" },
        end_crawl_date: { type: "string" },
        include_text: { type: "boolean" },
        text_max_characters: { type: "integer", minimum: 1 },
        include_highlights: { type: "boolean" },
        highlights_max_characters: { type: "integer", minimum: 1 },
        include_summary: { type: "boolean" },
        summary_query: { type: "string" },
        livecrawl: { type: "string", enum: ["never", "fallback", "always", "preferred"] },
        moderation: { type: "boolean" },
        user_location: { type: "string", description: "Two-letter ISO country code" }
      },
      required: ["query"],
      additionalProperties: false
    }
  },
```

In `src/mcp/router.ts`, add:

```ts
import { handleExaSearch } from "../tools/external/exa";
```

```ts
    case "exa_search":
      return handleExaSearch(args, context.env);
```

- [ ] **Step 5: Run the focused Exa tests again to verify they pass**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts -t 'Exa|exa_search'"
```

Expected:
- PASS
- `exa_search` appears only when `EXA_API_KEYS` is present
- request body and key rotation behave as expected

- [ ] **Step 6: Run the broader external + registry + protocol suite**

Run:
```bash
powershell -Command "npx vitest run tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts"
```

Expected:
- PASS
- Exa does not break other env-gated tools

- [ ] **Step 7: Commit the Exa integration**

Run:
```bash
git add src/lib/env.ts src/mcp/schema.ts src/mcp/tool-registry.ts src/mcp/router.ts src/tools/external/exa.ts tests/tools/external.test.ts tests/mcp/tool-registry.test.ts tests/mcp/protocol.test.ts
git commit -m $'feat: add exa search tool\n\nAdd an env-gated Exa search integration that exposes stable synchronous retrieval features without surfacing streaming or research-style orchestration modes.\n\nConstraint: Keep the public API LLM-friendly and synchronous\nRejected: Expose stream, outputSchema, and planning-style params in v1 | too easy to miscall from MCP clients\nConfidence: medium\nScope-risk: moderate'
```

---

### Task 6: Update docs, run full verification, deploy, and verify the live endpoint

**Files:**
- Modify: `README.md:18-113`
- Modify: `README.zh-CN.md:18-114`
- Verify: deployed endpoint at `https://mcp.awsl.app/mcp`

- [ ] **Step 1: Rewrite the public feature lists and secret setup in `README.md`**

Replace the current feature list with this block:

```md
Current release capabilities:

- Native tools: `weather`, `webfetch`, `calc`, `time`, `whoami`, `iplookup`
- Context7 tools: `context7_resolve-library-id`, `context7_query-docs`
- Tavily tools: `tavily_search`, `tavily_extract`, `tavily_crawl`
- Exa tool: `exa_search`
- Unsplash tool: `unsplash_search_photos`
- Pure.md tool: `puremd_extract`
- Developer utilities: `devutils_base64_encode`, `devutils_base64_decode`, `devutils_hash`, `devutils_uuid`, `devutils_jwt_decode`, `devutils_json_format`, `devutils_json_validate`, `devutils_regex_test`, `devutils_url_parse`, `devutils_timestamp_convert`, `devutils_ip_validate`, `devutils_cidr_calculate`, `devutils_text_stats`, `devutils_slugify`, `devutils_case_convert`
- Env-gated tool exposure: integrations only appear when the corresponding secrets are configured
- Single HTTP MCP endpoint exposed at `/mcp`
```

Replace the secrets block with:

```md
```bash
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
npx wrangler secret put EXA_API_KEYS
```
```

Add this note after the secrets section:

```md
`iplookup` uses the free `ip-api.com` JSON endpoint for this project. Its free tier is HTTP-only, rate-limited, and documented for non-commercial usage only.
```

- [ ] **Step 2: Mirror the same behavior changes in `README.zh-CN.md`**

Replace the Chinese feature list with:

```md
当前版本实际可用的能力包括：

- 原生工具：`weather`、`webfetch`、`calc`、`time`、`whoami`、`iplookup`
- Context7：`context7_resolve-library-id`、`context7_query-docs`
- Tavily：`tavily_search`、`tavily_extract`、`tavily_crawl`
- Exa：`exa_search`
- Unsplash：`unsplash_search_photos`
- Pure.md：`puremd_extract`
- 开发者工具集：`devutils_base64_encode`、`devutils_base64_decode`、`devutils_hash`、`devutils_uuid`、`devutils_jwt_decode`、`devutils_json_format`、`devutils_json_validate`、`devutils_regex_test`、`devutils_url_parse`、`devutils_timestamp_convert`、`devutils_ip_validate`、`devutils_cidr_calculate`、`devutils_text_stats`、`devutils_slugify`、`devutils_case_convert`
- 通过环境变量控制第三方工具是否暴露
- 统一通过 `/mcp` 提供 HTTP MCP 服务
```

Replace the secrets block with:

```md
```bash
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
npx wrangler secret put EXA_API_KEYS
```
```

Add this note after the secrets section:

```md
`iplookup` 当前使用 `ip-api.com` 免费 JSON 接口。它的免费版只支持 HTTP、有速率限制，并且文档中明确标注为非商业用途。
```

- [ ] **Step 3: Run the full local verification suite**

Run:
```bash
powershell -Command "npm test"
powershell -Command "npm run typecheck"
```

Expected:
- Both commands exit 0
- No failing Vitest suites
- TypeScript emits no type errors

- [ ] **Step 4: Commit the docs and verification-ready state**

Run:
```bash
git add README.md README.zh-CN.md
git commit -m $'docs: update tool surface for whoami iplookup and exa\n\nDocument the new public MCP surface, add Exa secret setup, and record the accepted ip-api free-tier constraints so the published README matches the deployed behavior.\n\nConstraint: Keep docs aligned with the actual live surface\nRejected: Leave tavily_research and ip in docs for backwards familiarity | would mislead client users\nConfidence: high\nScope-risk: narrow'
```

- [ ] **Step 5: Sync the new Exa secret before deployment**

Run:
```bash
npx wrangler secret put EXA_API_KEYS
```

Expected:
- Wrangler confirms the secret was updated for the current Worker
- Do not continue to deploy until the secret exists remotely

- [ ] **Step 6: Deploy the Worker**

Run:
```bash
powershell -Command "npm run deploy"
```

Expected:
- Deploy succeeds
- The Worker remains bound to the existing custom domain `mcp.awsl.app`

- [ ] **Step 7: Verify the live tool list**

Run:
```bash
curl -s "https://mcp.awsl.app/mcp" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Expected:
- Contains `whoami`, `iplookup`, and `exa_search` (if `EXA_API_KEYS` is configured)
- Contains `tavily_search`, `tavily_extract`, `tavily_crawl`
- Does **not** contain `ip`
- Does **not** contain `tavily_research`

- [ ] **Step 8: Verify live calls for each changed tool**

Run:
```bash
curl -s "https://mcp.awsl.app/mcp" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"whoami","arguments":{}}}'
```

```bash
curl -s "https://mcp.awsl.app/mcp" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"iplookup","arguments":{"query":"8.8.8.8"}}}'
```

```bash
curl -s "https://mcp.awsl.app/mcp" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"exa_search","arguments":{"query":"Toolhive MCP","limit":3,"include_highlights":true}}}'
```

```bash
curl -s "https://mcp.awsl.app/mcp" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"devutils_timestamp_convert","arguments":{"value":"1710000000"}}}'
```

Expected:
- `whoami` returns a compact identity payload
- `iplookup` returns curated lookup data
- `exa_search` returns search results if `EXA_API_KEYS` is configured remotely
- `devutils_timestamp_convert` returns the expected Unix/ISO pair for a digit-only string

- [ ] **Step 9: Record the exact verification evidence before declaring completion**

Capture in the final work summary:
- local `npm test` result
- local `npm run typecheck` result
- deployment success
- live `tools/list` evidence
- live call evidence for `whoami`, `iplookup`, `exa_search`, and `devutils_timestamp_convert`

Do not claim completion without this fresh evidence.

---

## Spec coverage check

- Remove public `tavily_research`: Task 3
- Replace `ip` with non-compatible `whoami`: Task 2
- Simplify `whoami` output: Task 2
- Add `iplookup` with curated fields + `raw`: Task 4
- Accept ip-api free-tier constraints and document them: Task 6
- Fix numeric-string Unix timestamps: Task 1
- Add env-gated `exa_search`: Task 5
- Keep new tool names Anthropic-compatible: Tasks 2, 4, 5
- Local verification + deployment + live verification: Task 6

## Placeholder scan

- No `TODO`, `TBD`, or “similar to previous task” shortcuts remain
- Every code-editing step contains exact code blocks
- Every verification step contains exact commands and expected outcomes

## Type consistency check

- `handleWhoami()` remains in `src/tools/native/ip.ts` so imports change but file churn stays minimal
- `handleIpLookup()` takes only `args`, matching existing no-env external helpers like `handleNewsGetNews()`
- `handleExaSearch(args, env)` matches existing env-gated external tools like `handleTavilySearch()`
- `EXA_API_KEYS` is added consistently to both `src/lib/env.ts` and `src/mcp/schema.ts`

## Final verification gate

Before marking the whole project complete, the executing worker must have fresh evidence for all of the following:
- `powershell -Command "npm test"` exits 0
- `powershell -Command "npm run typecheck"` exits 0
- `npm run deploy` succeeds
- live `tools/list` shows the exact intended public surface
- live `whoami`, `iplookup`, `exa_search`, and `devutils_timestamp_convert` calls succeed
- no new docs drift exists between README/README zh and the live tool surface
