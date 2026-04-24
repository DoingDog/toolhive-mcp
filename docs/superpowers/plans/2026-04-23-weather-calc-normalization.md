# Weather Lang Normalization and Calc Operator Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize common `weather.lang` tag formats and add `calc` compatibility for `**`, `×`, and `÷`, then verify locally and on the deployed Worker before merging back to `main`.

**Architecture:** Keep the runtime changes local to the existing hot paths. `weather` compatibility stays inside the native weather tool so malformed `lang` values fail locally instead of surfacing as upstream errors. `calc` operator compatibility stays inside the math tokenizer/evaluator so the tool entrypoint, router, and tool registry keep their current responsibilities.

**Tech Stack:** TypeScript, Vitest, Cloudflare Workers, Wrangler, JSON-RPC

---

## File Structure

### Existing files to modify

- `src/tools/native/weather.ts` — normalize and validate `lang` before building the wttr.in request URL
- `src/lib/math/tokenizer.ts` — recognize `**` as a single token while continuing to tokenize existing operators
- `src/lib/math/evaluate.ts` — accept `**`, `×`, and `÷` without changing current precedence or unary-minus behavior
- `tests/tools/native.test.ts` — add handler-level and JSON-RPC regression coverage for the new compatibility paths
- `README.md` — add the missing auth and Unpaywall environment variables, and sync any stale deployment/configuration details
- `README.zh-CN.md` — add the missing auth and Unpaywall environment variables, and sync any stale deployment/configuration details

### Files intentionally left alone

- `src/tools/native/calc.ts` — keep as a thin argument-validation entrypoint
- `src/lib/math/parser.ts` — do not widen scope into a parser rewrite
- `src/mcp/router.ts` — should not require special cases for either fix
- `src/mcp/tool-manifest.ts` — only touch if a failing test proves the public description must mention accepted operator aliases

### Responsibility boundaries

- `weather.ts` owns `lang` normalization and validation
- `tokenizer.ts` owns token splitting only
- `evaluate.ts` owns operator semantics only
- `native.test.ts` owns both direct handler and JSON-RPC regression coverage for these changes

---

### Task 1: Normalize and validate `weather.lang`

**Files:**
- Modify: `src/tools/native/weather.ts`
- Test: `tests/tools/native.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("weather normalizes hyphenated lang tags before calling wttr.in", async () => {
  const fetchMock = vi.fn(async () =>
    new Response('{"current_condition":[{"temp_C":"12"}]}', {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  const result = await handleWeather({
    location: "Beijing",
    format: "json",
    lang: "zh-CN"
  }, context);

  expect(fetchMock).toHaveBeenCalledWith("https://wttr.in/Beijing?format=j1&lang=zh-cn");
  expect(result).toEqual({
    ok: true,
    data: {
      current_condition: [{ temp_C: "12" }]
    }
  });
});

it("weather normalizes underscore lang tags before calling wttr.in", async () => {
  const fetchMock = vi.fn(async () =>
    new Response('{"current_condition":[{"temp_C":"12"}]}', {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  await handleWeather({
    location: "Beijing",
    format: "json",
    lang: "zh_CN"
  }, context);

  expect(fetchMock).toHaveBeenCalledWith("https://wttr.in/Beijing?format=j1&lang=zh-cn");
});

it("weather rejects malformed lang tags locally", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  const result = await handleWeather({
    location: "Beijing",
    format: "json",
    lang: "zh cn"
  }, context);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.type).toBe("validation_error");
    expect(result.error.message).toContain("lang");
  }
  expect(fetchMock).not.toHaveBeenCalled();
});

it("router allows normalized weather lang values through JSON-RPC", async () => {
  const fetchMock = vi.fn(async () =>
    new Response('{"current_condition":[{"temp_C":"18"}]}', {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "weather",
        arguments: {
          location: "Beijing",
          format: "json",
          lang: "zh-CN"
        }
      }
    },
    {},
    context.request
  );

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledWith("https://wttr.in/Beijing?format=j1&lang=zh-cn");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- tests/tools/native.test.ts -t "weather normalizes hyphenated lang tags before calling wttr.in"
npm test -- tests/tools/native.test.ts -t "weather rejects malformed lang tags locally"
```

Expected: FAIL because `src/tools/native/weather.ts` currently forwards `lang` unchanged and does not reject malformed tags before calling wttr.in.

- [ ] **Step 3: Write the minimal implementation**

```ts
const LANGUAGE_TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function normalizeWeatherLang(value: unknown): { value?: string; error?: string } {
  if (value === undefined) {
    return {};
  }

  if (typeof value !== "string") {
    return { error: "lang must be a string" };
  }

  const normalized = value.trim().replace(/_/g, "-").toLowerCase();
  if (normalized === "" || !LANGUAGE_TAG_PATTERN.test(normalized)) {
    return { error: "lang must be a valid language tag" };
  }

  return { value: normalized };
}

export async function handleWeather(args: unknown, _context: ToolContext): Promise<ToolExecutionResult> {
  const weatherArgs = (args ?? {}) as WeatherArgs;
  const query = weatherArgs.query ?? weatherArgs.location;

  if (typeof query !== "string" || query.trim() === "") {
    return validationError("query or location must be a non-empty string");
  }

  const format = weatherArgs.format ?? "json";
  if (format !== "json" && format !== "text") {
    return validationError("format must be json or text");
  }

  const lang = normalizeWeatherLang(weatherArgs.lang);
  if (lang.error) {
    return validationError(lang.error);
  }

  if (weatherArgs.units !== undefined && weatherArgs.units !== "metric" && weatherArgs.units !== "us" && weatherArgs.units !== "uk") {
    return validationError("units must be metric, us, or uk");
  }

  const url = new URL(`https://wttr.in/${encodeURIComponent(query)}`);
  url.searchParams.set("format", format === "json" ? "j1" : "T");
  if (lang.value) {
    url.searchParams.set("lang", lang.value);
  }
  // keep the existing units handling unchanged
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm test -- tests/tools/native.test.ts -t "weather normalizes"
npm test -- tests/tools/native.test.ts -t "weather rejects malformed lang tags locally"
npm test -- tests/tools/native.test.ts -t "router allows normalized weather lang values through JSON-RPC"
```

Expected: PASS. The fetch URL must use `lang=zh-cn`, malformed `lang` must fail locally, and the JSON-RPC entrypoint must work without router changes.

- [ ] **Step 5: Commit**

```bash
git add tests/tools/native.test.ts src/tools/native/weather.ts
git commit -m "fix: normalize weather lang tags"
```

---

### Task 2: Add `calc` compatibility for `**`, `×`, and `÷`

**Files:**
- Modify: `src/lib/math/tokenizer.ts`
- Modify: `src/lib/math/evaluate.ts`
- Test: `tests/tools/native.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it("calc accepts ** for exponentiation", async () => {
  await expect(handleCalc({ expression: "2**3" }, context)).resolves.toEqual({
    ok: true,
    data: { result: 8 }
  });

  await expect(handleCalc({ expression: "2 ** 3" }, context)).resolves.toEqual({
    ok: true,
    data: { result: 8 }
  });
});

it("calc preserves exponent precedence for **", async () => {
  await expect(handleCalc({ expression: "-2**2" }, context)).resolves.toEqual({
    ok: true,
    data: { result: -4 }
  });

  await expect(handleCalc({ expression: "2**-2" }, context)).resolves.toEqual({
    ok: true,
    data: { result: 0.25 }
  });
});

it("calc accepts unicode multiply and divide operators", async () => {
  await expect(handleCalc({ expression: "6×7" }, context)).resolves.toEqual({
    ok: true,
    data: { result: 42 }
  });

  await expect(handleCalc({ expression: "8÷2" }, context)).resolves.toEqual({
    ok: true,
    data: { result: 4 }
  });
});

it("calc still rejects malformed repeated operators", async () => {
  const result = await handleCalc({ expression: "2***3" }, context);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.type).toBe("validation_error");
    expect(result.error.message).toContain("Unexpected token");
  }
});

it("router dispatches compatible calc operators through JSON-RPC", async () => {
  const response = await handleJsonRpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "calc",
        arguments: {
          expression: "6×7"
        }
      }
    },
    {},
    context.request
  );
  const body = await response.json() as { result: { content: { type: string; text: string }[]; isError?: boolean } };

  expect(response.status).toBe(200);
  expect(body).toMatchObject({
    result: {
      content: [
        {
          type: "text",
          text: expect.stringContaining("42")
        }
      ]
    }
  });
  expect(body.result).not.toHaveProperty("isError");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
npm test -- tests/tools/native.test.ts -t "calc accepts ** for exponentiation"
npm test -- tests/tools/native.test.ts -t "calc accepts unicode multiply and divide operators"
```

Expected: FAIL because `src/lib/math/tokenizer.ts` currently splits `**` into two `*` tokens and `src/lib/math/evaluate.ts` only recognizes `^`, `*`, and `/`.

- [ ] **Step 3: Write the minimal implementation**

```ts
// src/lib/math/tokenizer.ts
export type MathToken = string;

export function tokenize(expression: string): MathToken[] {
  return expression.match(/\*\*|\d*\.?\d+|[A-Za-z_][A-Za-z0-9_]*|\S/g) ?? [];
}
```

```ts
// src/lib/math/evaluate.ts
private parseTerm(): number {
  let value = this.parsePower();

  while (true) {
    const token = this.peek();
    if (token === "*" || token === "×") {
      this.index += 1;
      value *= this.parsePower();
      continue;
    }
    if (token === "/" || token === "÷") {
      this.index += 1;
      value /= this.parsePower();
      continue;
    }
    return value;
  }
}

private parsePowerBase(): number {
  let value = this.parsePrimary();

  if (this.peek() === "^" || this.peek() === "**") {
    this.index += 1;
    value = value ** this.parsePower();
  }

  return value;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
npm test -- tests/tools/native.test.ts -t "calc accepts ** for exponentiation"
npm test -- tests/tools/native.test.ts -t "calc preserves exponent precedence for **"
npm test -- tests/tools/native.test.ts -t "calc accepts unicode multiply and divide operators"
npm test -- tests/tools/native.test.ts -t "router dispatches compatible calc operators through JSON-RPC"
```

Expected: PASS. `**` must behave exactly like `^`, `×` and `÷` must evaluate like `*` and `/`, and malformed `2***3` must still be rejected.

- [ ] **Step 5: Commit**

```bash
git add tests/tools/native.test.ts src/lib/math/tokenizer.ts src/lib/math/evaluate.ts
git commit -m "fix: support calc operator aliases"
```

---

### Task 3: Sync README environment variables and stale deployment details

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`

- [ ] **Step 1: Write the failing documentation checklist**

```md
- README.md must document `MCP_AUTH_KEYS`
- README.md must document `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS`
- README.zh-CN.md must document `MCP_AUTH_KEYS`
- README.zh-CN.md must document `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS`
- Both READMEs must keep the existing demo auth guidance aligned with the current `/mcp?key=elysia` demo endpoint
- Both READMEs must list all currently documented optional secrets without dropping existing ones
```

- [ ] **Step 2: Inspect the current documentation and confirm the gap**

Run:

```bash
grep -n "MCP_AUTH_KEYS\|PAPER_SEARCH_MCP_UNPAYWALL_EMAILS\|Optional third-party secrets\|需环境变量" README.md README.zh-CN.md
```

Expected: the current READMEs mention third-party keys and env-gated tools, but they are missing the explicit `MCP_AUTH_KEYS` and `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` setup instructions.

- [ ] **Step 3: Write the minimal documentation update**

```md
# README.md
Add `MCP_AUTH_KEYS` to the self-hosting / secrets section, explaining that it is optional and only protects `/mcp` tool methods when configured.

Add `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` to the optional secrets list, describing it as the env required for `paper_get_open_access` / Unpaywall-backed paper access.

While touching the same section, verify the generated/static wording still matches the current public demo endpoint, auth methods, and env-gated tool list.

# README.zh-CN.md
同步加入：
- `MCP_AUTH_KEYS`
- `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS`

并检查中文说明里当前 demo、鉴权方式、需环境变量工具列表是否与英文版和当前实现一致。
```

- [ ] **Step 4: Re-read the updated README files and verify the required env names are present**

Run:

```bash
grep -n "MCP_AUTH_KEYS\|PAPER_SEARCH_MCP_UNPAYWALL_EMAILS" README.md README.zh-CN.md
```

Expected: both env names appear in both README files, and the surrounding text still matches the deployed demo/auth setup.

- [ ] **Step 5: Commit**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: sync readme environment variables"
```

---

### Task 4: Run full verification, deploy, and validate the live endpoint

**Files:**
- Verify only: `tests/tools/native.test.ts`
- Verify only: deployed `/mcp`, `/healthz`, `/readyz`, `/version`

- [ ] **Step 1: Run the focused regression file**

Run:

```bash
npm test -- tests/tools/native.test.ts
```

Expected: PASS, including all new `weather` and `calc` regressions plus the pre-existing native-tool coverage.

- [ ] **Step 2: Run full local verification**

Run:

```bash
npm run typecheck && npm test
```

Expected: PASS with exit code 0 for both commands.

- [ ] **Step 3: Deploy the Worker**

Run:

```bash
npm run deploy
```

Expected: Wrangler deploy succeeds and updates the Worker serving `https://mcp.awsl.app`.

- [ ] **Step 4: Live-test `/mcp` and health endpoints**

Run:

```bash
curl -s https://mcp.awsl.app/healthz
curl -s https://mcp.awsl.app/readyz
curl -s https://mcp.awsl.app/version
curl -s https://mcp.awsl.app/mcp \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"weather","arguments":{"location":"Beijing","format":"json","lang":"zh-CN","units":"metric"}}}'
curl -s https://mcp.awsl.app/mcp \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"calc","arguments":{"expression":"2**3"}}}'
curl -s https://mcp.awsl.app/mcp \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"calc","arguments":{"expression":"6×7"}}}'
curl -s https://mcp.awsl.app/mcp \
  -H "content-type: application/json" \
  --data '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"calc","arguments":{"expression":"8÷2"}}}'
```

Expected:
- `/healthz` and `/readyz` return healthy responses
- `/version` returns the deployed version payload
- `weather` returns a successful JSON result for Beijing using the normalized `lang`
- `calc` returns `8`, `42`, and `4` for the three live calls

- [ ] **Step 5: Review and merge the worktree branch back to `main`**

Run, in order:

```bash
# request code review before merging
# use superpowers:requesting-code-review on the final diff

# then, after review issues are resolved and verification is still green
# use superpowers:finishing-a-development-branch and follow the merge-to-main path
```

Expected: reviewed, verified code is merged locally back into `main`, and the temporary worktree can be cleaned up.

---

## Self-review checklist

- Spec coverage: `weather.lang` normalization, malformed `lang` rejection, `calc` support for `**`, `×`, `÷`, JSON-RPC coverage, full verification, deployment, and merge are all represented in Tasks 1-3.
- Placeholder scan: no `TODO`, `TBD`, or implied “fill this in later” instructions remain.
- Type consistency: all code snippets reuse the existing `handleWeather`, `handleCalc`, `handleJsonRpc`, `context`, and `ToolExecutionResult` conventions already present in the repository.
