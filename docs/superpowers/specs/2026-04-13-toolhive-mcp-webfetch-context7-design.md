# Toolhive MCP Webfetch / Context7 Compatibility Design

## Context

The current Toolhive MCP release has two concrete compatibility problems in the public MCP surface.

### Problems to fix

1. `mcp_webfetch` rejects `format` with `Invalid params`.
   - Calling without `format` works.
   - The registered schema for `webfetch` currently accepts `url`, `method`, `requestheaders`, `body`, and `return_responseheaders`, but not `format`.
   - The router validates arguments before dispatch, so requests containing `format` are rejected before the handler runs.
   - The current implementation also does not interpret `format`, so the public contract and expected behavior are out of sync.

2. `mcp_context7_resolve-library-id` rejects common caller parameter shapes.
   - `context7_query-docs` works because its schema and handler already agree.
   - `context7_resolve-library-id` currently exposes only `query` in its public schema, while the handler already tries to tolerate `libraryName`.
   - MCP clients and users naturally try `libraryName` or `library_name`, which are currently rejected at schema validation time.

## User-approved constraints

- Use a compatibility-first repair strategy.
- For `webfetch`, support a real `format` parameter rather than only relaxing schema validation.
- Do not hand-roll HTML-to-Markdown conversion.
- Reuse an existing library that is compatible with Cloudflare Workers.
- Prefer a library that does not depend on Node runtime compatibility or browser-only DOM globals.
- For Context7 resolve, accept `query`, `libraryName`, and `library_name`.
- When multiple resolve aliases are provided and disagree, prefer `libraryName`, then `library_name`, then `query`.

## Goals

1. Make `webfetch` accept and meaningfully implement `format`.
2. Preserve existing `webfetch` GET/POST and header behavior.
3. Make `context7_resolve-library-id` accept the caller argument shapes users actually try.
4. Fix these compatibility issues narrowly without widening scope into global validator redesign.
5. Verify the repaired behavior locally and against the deployed MCP endpoint.

## Non-goals

This change does **not** include:

- redesigning the global MCP validation system to support advanced JSON Schema constructs
- adding richer content extraction features to `webfetch` beyond `html` / `text` / `markdown`
- converting non-HTML responses into synthetic Markdown
- changing `context7_query-docs`
- changing unrelated tool argument conventions
- adding browser rendering, DOM emulation, or `nodejs_compat` to support HTML conversion

## Design

### 1. `webfetch`

#### Public schema
Extend the `webfetch` tool schema to accept:

```json
{
  "format": {
    "type": "string",
    "enum": ["markdown", "text", "html"],
    "default": "text"
  }
}
```

`format` remains optional. `url` remains the only required field.

#### Response handling rules
The implementation continues to fetch the upstream resource exactly once and then chooses how to expose the response body based on `format` and the upstream `Content-Type`.

##### HTML detection
Treat a response as HTML when `Content-Type` indicates HTML, including at least:
- `text/html`
- `application/xhtml+xml`

##### `format=html`
- If the upstream response is HTML, return the original HTML body.
- If the upstream response is not HTML, return the original text body unchanged.

##### `format=text`
- If the upstream response is HTML, convert HTML into readable plain text.
- If the upstream response is not HTML, return the original text body unchanged.

##### `format=markdown`
- If the upstream response is HTML, convert HTML into Markdown using an existing library.
- If the upstream response is not HTML, return the original text body unchanged.

#### Library choice
Use an existing HTML-to-Markdown library that is a better fit for Cloudflare Workers than DOM-heavy alternatives.

Recommended choice:
- `html-to-md`

Rationale:
- avoids hand-written conversion logic
- better matches a string-in / string-out Worker environment
- avoids relying on `nodejs_compat`
- avoids depending on browser DOM globals such as `document.implementation`

Rejected default approach:
- `turndown` as the primary choice

Reason:
- its default package entry relies on `domino`
- its browser path expects browser-style DOM support
- this introduces avoidable runtime-selection risk in a Worker without `nodejs_compat`

#### Behavioral boundaries
- Keep existing request options: `method`, `requestheaders`, `body`, `return_responseheaders`
- Do not add new output fields just for `format`
- Continue returning `body` as the primary payload field
- Do not fail just because the response is not HTML
- Do not attempt to “improve” JSON, CSS, JS, or arbitrary text into Markdown

### 2. `context7_resolve-library-id`

#### Public schema
Expand the public schema to accept all of the following optional string fields:
- `query`
- `libraryName`
- `library_name`

None of these fields should be marked as `required` in schema.

#### Why the schema stays permissive
The current validator only supports a narrow subset of JSON Schema and cannot express “at least one of these three fields must be present” without a wider validator redesign.

Therefore:
- schema is used to allow the candidate fields through validation
- the handler performs the final normalization and required-value check

This keeps the fix narrow and local to the affected tool.

#### Normalization
Inside the handler, compute a single normalized lookup string using this precedence:
1. `libraryName`
2. `library_name`
3. `query`

If multiple fields are present and disagree, keep the same precedence and do **not** reject the request.

Examples:
- `{ "libraryName": "react" }` → `react`
- `{ "library_name": "vue" }` → `vue`
- `{ "query": "react hooks", "libraryName": "react" }` → `react`

#### Required-value validation
If none of `libraryName`, `library_name`, or `query` is a string, return a more accurate validation error.

Recommended message:
- `one of libraryName, library_name, or query must be a string`

#### Upstream call behavior
After normalization, continue making the upstream Context7 MCP call through the existing request path.

Send the normalized value using the same internal contract for compatibility:

```json
{
  "query": "react",
  "libraryName": "react"
}
```

#### Scope boundary
Do not change `context7_query-docs`, because its public schema and handler are already aligned.

### 3. Tests and verification

#### `webfetch`
Add or update tests to cover:
- schema accepts `format`
- JSON-RPC route no longer rejects `format`
- HTML response + `format=html` returns original HTML
- HTML response + `format=text` returns plain text
- HTML response + `format=markdown` returns Markdown
- non-HTML response + `format=text` returns original text
- non-HTML response + `format=markdown` returns original text
- omitted `format` keeps current behavior compatible

#### `context7_resolve-library-id`
Add or update tests to cover:
- `query` alone succeeds
- `libraryName` alone succeeds
- `library_name` alone succeeds
- conflicting aliases prefer `libraryName`
- missing all aliases returns the new targeted validation error
- `context7_query-docs` behavior remains unchanged

#### Local verification
Run fresh verification commands after implementation:
- `npm test -- tests/tools/native.test.ts`
- `npm test -- tests/tools/external.test.ts`
- `npm test -- tests/mcp/protocol.test.ts`
- `npm test -- tests/mcp/tool-registry.test.ts`
- `npm test`
- `npm run typecheck`

#### Deployed verification
After deployment, validate against `https://mcp.awsl.app/mcp`:
1. `tools/list`
   - `webfetch` schema includes `format`
   - `context7_resolve-library-id` schema includes `query`, `libraryName`, and `library_name`
2. `tools/call`
   - `webfetch` with `format="markdown"`
   - `context7_resolve-library-id` with `libraryName="react"`
   - `context7_resolve-library-id` with `library_name="vue"`
   - `context7_resolve-library-id` with conflicting `query` and `libraryName`, confirming `libraryName` wins

## Risks and mitigations

### Risk: HTML conversion library still turns out to be incompatible with the Worker bundle
Mitigation:
- choose a string-oriented library first
- verify with typecheck, tests, and deployed runtime behavior
- if the first library fails in the actual Worker runtime, replace it before release rather than enabling Node compatibility as a shortcut

### Risk: making the resolve schema more permissive could hide caller mistakes
Mitigation:
- keep the accepted field set intentionally small
- return a targeted validation message when no usable string is present
- keep precedence deterministic and documented

## Expected outcome

After this change:
- `mcp_webfetch(url="...", format="markdown")` succeeds instead of failing validation
- `webfetch` clients can request `html`, `text`, or `markdown` for HTML responses
- `mcp_context7_resolve-library-id` accepts the common caller spellings users already try
- the implementation stays narrow, Worker-compatible, and consistent with the existing MCP architecture
