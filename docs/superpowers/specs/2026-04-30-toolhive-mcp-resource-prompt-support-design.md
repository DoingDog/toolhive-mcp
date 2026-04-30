# Toolhive MCP Resource and Prompt Support Design

## Context

The current project is a Cloudflare Workers remote HTTP MCP server with a manifest-driven tool surface. Today the MCP runtime only exposes `tools` capability: `src/mcp/protocol.ts` declares `tools: {}`, and `src/mcp/router.ts` only handles `tools/list` and `tools/call`.

The requested next step is to add first-class `resources` and `prompts` support outside the existing tool surface. This should follow the same product direction as the current tool system rather than introducing a one-off patch. The user explicitly chose a manifest-driven design, wants both static and runtime-backed resources, wants prompts aimed at end users rather than internal orchestration, and wants first-release compatibility to prioritize Claude-compatible clients over strict completeness for every optional MCP edge.

This is a productization change, not a protocol experiment. The design should preserve the existing `/mcp` endpoint, JSON-RPC flow, auth behavior, and manifest-as-source-of-truth approach while expanding the discoverable MCP capability surface.

## Scope

This design covers:

1. MCP capability expansion from `tools` only to `tools`, `resources`, and `prompts`
2. New JSON-RPC methods on the existing `/mcp` endpoint:
   - `resources/list`
   - `resources/read`
   - `prompts/list`
   - `prompts/get`
3. Manifest-driven registration for resources and prompts, parallel to the current tool manifest model
4. A first release with a small built-in set of static resources, runtime resources, and user-facing prompts
5. README generation updates so resources and prompts are documented from manifest data
6. Test coverage for capability declaration, routing, manifest projection, validation, and generated documentation

This design does not cover:

- new HTTP endpoints beyond the existing `/mcp`, `/healthz`, `/readyz`, and `/version`
- binary resource delivery
- streaming or paginated resources
- prompt version negotiation
- internal agent-workflow prompts
- a large unified capability-framework rewrite that replaces the existing tool architecture

## Alternatives Considered

### 1. Minimal direct router patch

- Add `resources/*` and `prompts/*` methods directly in `src/mcp/router.ts`
- Hardcode a few resources and prompts without a manifest layer

Advantages:
- smallest implementation diff
- fastest path to first visible support

Trade-offs:
- breaks the existing product direction where exposed capability is manifest-backed
- makes README generation and future env gating harder
- likely creates a second refactor shortly after the first release

### 2. Parallel manifest-driven capability layers (recommended)

- Keep the current tool architecture intact
- Add `resource-manifest`, `resource-catalog`, `resource-registry`
- Add `prompt-manifest`, `prompt-catalog`, `prompt-registry`
- Extend protocol and router layers to dispatch to those new registries

Advantages:
- matches the current `tool-manifest` architecture
- keeps discoverability, documentation, and runtime exposure aligned
- gives a clear place for future gating, aliases, and generated docs

Trade-off:
- touches more files than the minimal patch

### 3. Unified capability manifest rewrite

- Replace the current tool-specific manifest system with a single generalized capability framework for tools, resources, and prompts

Advantages:
- cleanest long-term abstraction on paper

Trade-offs:
- larger than the current request
- higher regression risk in the already-working tool surface
- unnecessary abstraction before real multi-capability complexity exists

## Recommended Design

### 1. Protocol and capability surface

Keep the existing `/mcp` endpoint and JSON-RPC request model unchanged.

Update `src/mcp/protocol.ts` so `initializeResult()` declares:

- `tools: {}`
- `resources: {}`
- `prompts: {}`

Update `src/mcp/router.ts` to add four method handlers:

- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`

The router should remain thin. It should validate shape, resolve the named resource or prompt through its registry, and dispatch to a handler in the same style as the current tool path.

No new HTTP routes are introduced. All discovery and invocation remain on `/mcp`, which preserves client setup and keeps compatibility focused on Claude-style remote MCP usage.

### 2. Manifest architecture

Add two new manifest families parallel to the current tool system:

- `src/mcp/resource-manifest.ts`
- `src/mcp/prompt-manifest.ts`

Add matching projection and lookup layers:

- `src/mcp/resource-catalog.ts`
- `src/mcp/resource-registry.ts`
- `src/mcp/prompt-catalog.ts`
- `src/mcp/prompt-registry.ts`

The architecture stays consistent with the current repository pattern:

- manifest files define source-of-truth entries
- catalog files project manifest entries into MCP response shapes and handler maps
- registry files expose the currently enabled entries and name/URI lookup behavior

This keeps protocol concerns out of manifest definitions and avoids mixing runtime dispatch logic into the content declarations.

### 3. Resource data model

Each resource manifest entry should include at least:

- `uri`
- `name`
- `title?`
- `description`
- `mimeType`
- `kind: "static" | "runtime"`
- `requiresAuth?: boolean`
- `handler`

Design intent:

- `static` resources are stable service documentation and capability explanations
- `runtime` resources reflect the actual current deployment state

First release resource payloads should stay text-based only, with `text/markdown` and `application/json` as the primary formats. That keeps Claude-compatible clients simple and avoids adding binary-content handling before a concrete use case exists.

### 4. Prompt data model

Each prompt manifest entry should include at least:

- `name`
- `title?`
- `description`
- `arguments`
- `handler`

`arguments` should use a lightweight schema shape aligned with the current validation style so prompt inputs can be checked locally before rendering prompt output.

Prompt handlers should return standard prompt payloads suitable for end-user invocation. First release prompts should be plain, high-value templates rather than a complex prompt DSL or hidden system-orchestration workflows.

### 5. First-release built-in resources

The first release should include four built-in resources.

#### `resource://toolhive/overview`

A static service overview covering:
- what Toolhive MCP is
- the `/mcp` endpoint model
- supported capabilities
- the intended client audience

#### `resource://toolhive/auth`

A static authentication guide covering:
- Bearer auth
- `x-api-key`
- query `key`
- which MCP methods are protected

#### `resource://toolhive/catalog`

A static capability directory describing the exposed tools, resources, and prompts at a product-doc level.

#### `resource://toolhive/runtime/enabled`

A runtime snapshot showing what the current deployment actually has enabled, including tools, resources, and prompts after env-based gating is applied.

This resource should be built from the registries rather than a hand-maintained copy so runtime state always reflects the real deployment.

### 6. First-release built-in prompts

The first release should include three end-user-facing prompts.

#### `choose_tool_for_task`

A prompt template that helps a client turn a user task description into a request that selects the most appropriate Toolhive MCP tool.

#### `research_with_sources`

A prompt template for research, retrieval, and source-backed synthesis using the existing search and fetch-oriented tools.

#### `developer_utility_workflow`

A prompt template for quick developer-utility tasks such as hashing, JSON formatting/validation, regex testing, base64 operations, timestamp conversion, and URL inspection.

These prompts are intentionally user-facing and narrow. They should not try to encode full internal agent workflows in the first release.

### 7. Runtime routing and validation

#### Resources

`resources/list` should return projected resource definitions from the resource registry.

`resources/read` should:
- validate that `uri` is present and is a string
- resolve the resource by URI
- return an `Unknown resource` style error if resolution fails
- invoke the resource handler with the current request context

#### Prompts

`prompts/list` should return projected prompt definitions from the prompt registry.

`prompts/get` should:
- validate that `name` is present and is a string
- resolve the prompt by name
- validate prompt arguments using the same local-validation philosophy used by tools
- return a rendered prompt payload from the handler

Error style should stay aligned with the existing MCP surface:
- malformed params use `-32602`
- unknown resource/prompt names use a clear unknown-item error
- the protocol layer should not invent a second error vocabulary

### 8. Compatibility strategy

The first release should prioritize the behavior most likely to matter for Claude-compatible remote MCP clients:

- capability discovery through `initialize`
- list methods that return clear definitions
- read/get methods that are simple and predictable
- text-first payloads

The implementation should avoid speculative completeness work for optional MCP features that the target clients do not currently need. This is a compatibility-first release, not a standards-maximal rewrite.

### 9. README generation

The project already uses `scripts/render-readme.ts` to generate README capability sections from `src/mcp/tool-manifest.ts`.

Extend that script so it also loads:

- `src/mcp/resource-manifest.ts`
- `src/mcp/prompt-manifest.ts`

The generated README block should continue to be manifest-derived and should gain concise sections for:

- built-in resources
- built-in prompts

This keeps docs aligned with the real exposed surface and prevents drift between implementation and marketing/documentation copy.

### 10. File boundaries

Expected new files:

- `src/mcp/resource-manifest.ts`
- `src/mcp/resource-catalog.ts`
- `src/mcp/resource-registry.ts`
- `src/mcp/prompt-manifest.ts`
- `src/mcp/prompt-catalog.ts`
- `src/mcp/prompt-registry.ts`
- new focused tests under `tests/mcp/` and/or `tests/worker/` as appropriate

Expected modified files:

- `src/mcp/protocol.ts`
- `src/mcp/router.ts`
- `src/mcp/schema.ts`
- `scripts/render-readme.ts`
- `README.md`
- `README.zh-CN.md`

Files that should remain unchanged unless tests prove a concrete need:

- existing tool handlers under `src/tools/**`
- `src/lib/mcp-auth.ts`
- current tool manifest behavior
- worker endpoint layout in `src/worker.ts`

### 11. Test design

Implementation should be test-driven.

#### Protocol tests

Add tests proving:
1. `initialize` advertises `tools`, `resources`, and `prompts`
2. unknown methods still return method-not-found behavior unchanged

#### Resource tests

Add tests proving:
1. `resources/list` exposes only manifest-derived resource definitions
2. `resources/read` resolves known URIs
3. `resources/read` rejects unknown URIs cleanly
4. runtime resources reflect env-gated enabled state instead of stale static copies

#### Prompt tests

Add tests proving:
1. `prompts/list` exposes manifest-derived prompt definitions
2. `prompts/get` resolves a known prompt
3. `prompts/get` validates arguments locally
4. missing or malformed arguments return validation-style errors aligned with tools

#### README generation tests

Add tests proving:
1. generated README blocks include the new resource summary
2. generated README blocks include the new prompt summary
3. generated documentation continues to be driven from manifest data rather than manual text drift

### 12. Verification plan

After implementation:

1. Run focused MCP tests for the new registries and router behavior
2. Run `npm run typecheck`
3. Run `npm test`
4. Run `npm run render:readme`
5. Verify both README files contain the generated resource/prompt sections
6. Start the local worker and validate MCP calls for:
   - `initialize`
   - `resources/list`
   - `resources/read` for each built-in resource
   - `prompts/list`
   - `prompts/get` for each built-in prompt
7. Confirm existing `tools/list` and `tools/call` behavior is unchanged

## Design Summary

The recommended approach is to extend Toolhive MCP with `resources` and `prompts` using the same manifest-driven product architecture already used for tools.

That means:
- expand protocol capabilities without changing the HTTP endpoint model
- add parallel manifest/catalog/registry layers for resources and prompts
- ship a small first-release set of static resources, runtime resources, and user-facing prompts
- keep README generation and tests manifest-backed
- optimize the first release for Claude-compatible client behavior rather than overbuilding the protocol surface

This gives the project a coherent multi-capability MCP surface without turning a straightforward product extension into a generalized framework rewrite.
