# Paper Reliability, MCP Auth, and Productization Design

## Context

The project is already a deployed Cloudflare Workers HTTP MCP server with a stable `/mcp` endpoint and a manifest-driven tool surface. The next iteration needs to complete two paper-tool bug fixes and three product-level upgrades in one cohesive release: add optional authentication for `/mcp`, add browser-compatible CORS and `OPTIONS` handling, and upgrade the repository from a single-codebase project into a maintainable product with release automation and user-facing documentation.

The user provided concrete regressions observed from real MCP calls:

1. `paper_search` rejects some valid string queries with `invalid_arguments` / `Unknown error`, even though the same tool accepts other plain string queries.
2. `paper_get_details` does not reliably return details for direct `arXiv id` and `arXiv DOI` inputs, despite claiming that capability.

The user also requested that `/mcp` support optional auth via any of three mechanisms — `Authorization: Bearer <key>`, `x-api-key: <key>`, or `/mcp?key=<key>` — with keys sourced from a server environment variable that accepts comma-separated values. If the env var is unset, auth must be disabled by default. For the public demo at `mcp.awsl.app`, the configured key must be `elysia`, and the public README should expose the demo URL in directly copyable form with that key embedded.

The productization scope is larger than a bugfix-only patch. It requires semver handling, changelog management, GitHub Release notes, README automation, manifest-derived tool lists, multi-client configuration examples, Cloudflare one-click deployment, bilingual documentation, local verification, cloud deployment, and real endpoint validation.

## Scope

This design covers all of the following in one implementation batch:

1. Fix the `paper_search` query-handling reliability bug.
2. Fix the `paper_get_details` arXiv identifier / arXiv DOI detail-resolution gap.
3. Add optional `/mcp` authentication for `tools/list` and `tools/call` only.
4. Support all three auth input forms:
   - `Authorization: Bearer <key>`
   - `x-api-key: <key>`
   - `/mcp?key=<key>`
5. Add `OPTIONS /mcp` and CORS headers allowing `*`.
6. Introduce maintainable release/product workflows:
   - patch-version release flow
   - changelog management
   - GitHub Release creation with generated notes
   - manifest-derived tool list generation
   - README automation support
7. Rewrite the English README and synchronize a Chinese README.
8. Add client configuration examples for Claude, Cursor, Cline, Cherry Studio, and Codex.
9. Add Cloudflare one-click deployment support and deployment guidance.
10. Deploy to the live demo endpoint and validate the real behavior after changes.

This design does not include unrelated feature expansion, protocol redesign, cookie-based auth, or broad refactoring outside the touched areas.

## Design

### 1. Overall architecture

The implementation should keep runtime changes tightly scoped while moving documentation and release concerns into scripts and GitHub automation.

Runtime behavior changes will stay concentrated in:
- `src/tools/paper/search.ts`
- `src/worker.ts`
- `src/mcp/router.ts`
- new small support modules in `src/lib/` if necessary

Release and productization concerns should live outside the hot path in:
- `scripts/*`
- `.github/workflows/*`
- `.github/release.yml`
- README generation helpers / generated fragments
- release-facing docs and changelog files

The manifest at `src/mcp/tool-manifest.ts` remains the single source of truth for tool exposure. README tool lists and release-facing tool summaries should be derived from it rather than manually maintained.

### 2. Root-cause direction for paper bug 1 (`paper_search`)

#### Observed symptom

Some legal string queries, such as:
- `vision transformer image recognition`
- `arXiv 1706.03762 Attention Is All You Need`

are reported externally as `invalid_arguments / Unknown error`, even though the schema only requires a non-empty string.

#### What the current code proves

`src/mcp/validate.ts` only performs basic JSON-schema argument validation and would not reject those strings when passed as the value of `query`.

`src/tools/paper/search.ts` only returns a local validation failure when `query` is empty after trimming.

The current code already distinguishes between:
- exact DOI lookup
- exact arXiv id lookup
- exact arXiv DOI lookup
- generic text search

and the existing tests show that the intended behavior is to route special-but-valid identifiers through exact lookup paths rather than generic full-text search.

#### Root-cause hypothesis

The likely defect is not literal schema validation. It is more likely one of these:
1. classification sends some legal strings into a fragile exact-lookup path,
2. one provider branch throws instead of degrading cleanly,
3. an outer integration layer maps tool execution failures into `invalid_arguments` / `Unknown error`.

#### Required fix

Stabilize classification and provider failure handling so that all non-empty strings are accepted as legal tool inputs and only routed between:
- strict exact identifier lookup when the entire string is a DOI / arXiv id / arXiv DOI,
- generic text search otherwise.

The string `arXiv 1706.03762 Attention Is All You Need` must be treated as a legal text query, not as a malformed exact identifier.

The implementation should add direct regression tests for the user-provided failing examples and guarantee that provider failures degrade into tool-level success with `partial: true` when possible, instead of surfacing as parameter errors.

### 3. Root-cause direction for paper bug 2 (`paper_get_details`)

#### Observed symptom

The tool is documented as supporting DOI or arXiv identifiers, but real calls with:
- `{"arxiv_id":"1706.03762"}`
- `{"arxiv_id":"2106.04554"}`
- `{"doi":"10.48550/arXiv.1706.03762"}`
- `{"doi":"10.48550/arxiv.1706.03762"}`

report `result: null` with empty providers.

#### What the current code proves

Direct `arxiv_id` support exists in the current handler design, and the repository already contains a passing test that expects `paper_get_details({ arxiv_id: "1706.03762" })` to hydrate authors from arXiv.

However, `paper_get_details` does not reuse the query-classification logic from `paper_search`. For DOI inputs it only queries DOI-based providers, which means `arXiv DOI` inputs are not explicitly normalized back to an arXiv identifier before running the arXiv detail lookup.

#### Root-cause hypothesis

The code path for `arXiv DOI` inputs is incomplete. The direct `arxiv_id` path exists conceptually, but the DOI form of arXiv records is not bridged into the arXiv lookup path. In live behavior, additional integration differences may also be causing direct `arxiv_id` lookups to degrade incorrectly.

#### Required fix

Introduce shared paper identifier normalization usable by both `paper_search` and `paper_get_details`.

That resolver must detect and normalize:
- plain DOI
- plain arXiv id
- arXiv DOI (`10.48550/arXiv.<id>`)
- case differences in the DOI prefix
- optional `arXiv:` prefixes and optional `vN` suffixes

`paper_get_details` should:
- resolve arXiv DOI to normalized arXiv id,
- query arXiv for the canonical record,
- optionally enrich with DOI-based providers when a DOI is present,
- merge the results instead of allowing DOI-provider misses to erase a successful arXiv result.

If arXiv succeeds and DOI providers fail, the tool must still return a non-null result, with `partial` representing enrichment failure rather than total failure.

### 4. Shared identifier normalization

A shared resolver should become the canonical path for paper identifier interpretation, rather than keeping subtly different rules in separate handlers.

Responsibilities:
- trim and normalize string inputs,
- classify exact DOI / arXiv id / arXiv DOI,
- return normalized identifiers for downstream handlers,
- preserve original query text where needed for result payloads,
- expose a narrow typed result instead of re-deriving the same logic in multiple places.

This reduces future drift between `paper_search` and `paper_get_details` and makes the tests easier to reason about.

### 5. `/mcp` authentication design

#### Protected surface

Auth applies only to `/mcp` requests whose JSON-RPC method is:
- `tools/list`
- `tools/call`

No auth is required for:
- `initialize`
- `notifications/initialized`
- `/version`
- `/healthz`
- `/readyz`

This preserves probe compatibility and allows MCP clients to complete basic handshake behavior before protected tool access.

#### Key source

Introduce environment variable:
- `MCP_AUTH_KEYS`

Rules:
- comma-separated list of valid keys,
- each key must match `^[A-Za-z0-9_-]+$`,
- if the variable is missing or empty after parsing, auth is disabled,
- if the variable is present but yields only invalid entries, protected methods should fail closed.

#### Accepted credential forms

Support all three user-approved forms:
1. `Authorization: Bearer <key>`
2. `x-api-key: <key>`
3. query parameter `key`

Recommended precedence:
- Bearer header
- `x-api-key`
- query parameter

#### Failure behavior

Auth failures should return unauthorized responses, not parameter-validation responses.

The implementation should avoid leaking whether the credential was absent, malformed, or wrong. A generic unauthorized message is sufficient.

#### Code location

Prefer a new focused helper such as `src/lib/mcp-auth.ts` to contain:
- key parsing / validation
- request credential extraction
- protected-method detection
- authorization checks

`src/mcp/router.ts` should enforce method-level auth before dispatching protected RPC methods.

### 6. `OPTIONS` and CORS design

The project currently exposes `/mcp` as POST-only, which is not enough for browser clients that send preflight requests when using `Authorization` or `x-api-key` headers.

#### Required behavior

- `OPTIONS /mcp` returns `204 No Content`
- `/mcp` POST responses and error responses include CORS headers
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: POST, OPTIONS`
- `Access-Control-Allow-Headers: authorization, x-api-key, content-type, accept`

Do not enable credentialed CORS. The design uses explicit API keys, not cookies.

CORS handling belongs in the HTTP layer (`src/worker.ts`) so that both JSON-RPC success and error responses can be wrapped consistently.

### 7. Productization and release design

#### Versioning model

Use a patch release from the current `0.4.0` base.

`package.json` remains the single authoritative version source. README version mentions must be generated or updated from that source rather than manually edited in parallel.

#### Release model

Use the approved workflow: manual command trigger with automated release execution.

Target flow:
1. run a single release command locally,
2. verify clean git state,
3. run tests / typecheck / doc generation,
4. bump patch version,
5. update changelog and generated docs,
6. create release commit and tag,
7. push,
8. create GitHub Release with generated notes.

#### Release automation pieces

Expected additions:
- `scripts/release.mjs`
- `.github/workflows/release.yml`
- `.github/release.yml`
- `CHANGELOG.md`

GitHub Release creation should use official generated notes support. The repo-local changelog remains human-readable historical documentation; GitHub Release notes remain per-release publication output.

### 8. Manifest-derived documentation

The tool manifest in `src/mcp/tool-manifest.ts` should drive generated tool documentation.

Add generation support that can derive:
- grouped tool lists for README,
- release-facing tool summaries,
- optional generated docs artifacts for inspection.

Generated categories should match the product surface, such as:
- Native tools
- Paper tools
- External tools
- Developer utilities
- Env-gated tools

This eliminates drift between actual exposed tools and the public README.

### 9. README redesign

Both README files should be rewritten for users, not internal maintainers.

#### English README

Recommended structure:
1. what the project is,
2. why it exists,
3. live demo,
4. quick client setup,
5. supported auth methods,
6. self-host deployment,
7. Cloudflare deploy button,
8. manifest-derived tool list,
9. development / testing,
10. release / versioning notes,
11. license.

The public demo should be shown in directly usable form:
- `https://mcp.awsl.app/mcp?key=elysia`

#### Chinese README

Mirror the same product information with natural Chinese phrasing rather than literal line-by-line translation.

#### Language switch links

Add top-of-file links between:
- `README.md`
- `README.zh-CN.md`

#### Client examples

Add configuration examples for:
- Claude
- Cursor
- Cline
- Cherry Studio
- Codex

Each example only needs to show one valid configuration path, but the auth section should explain all three accepted auth methods.

### 10. Cloudflare deployment design

Add official Cloudflare Deploy Button support to the README.

Deployment docs should clearly separate:
- public demo behavior,
- self-host setup,
- required provider secrets,
- optional `MCP_AUTH_KEYS` auth configuration.

For the live demo deployment, the configured auth key must be `elysia` before validation.

### 11. Testing and verification strategy

#### Runtime regression tests

Add or expand tests for:
- `paper_search` accepting the user-provided failing legal queries,
- `paper_get_details` for direct `arxiv_id`,
- `paper_get_details` for arXiv DOI in both `arXiv` and `arxiv` DOI casing,
- protected `/mcp` methods rejecting missing / incorrect auth when `MCP_AUTH_KEYS` is set,
- protected `/mcp` methods succeeding with each of the three auth forms,
- unprotected methods remaining available without auth,
- `OPTIONS /mcp` response shape and CORS headers,
- CORS headers on normal and error responses.

#### Documentation and release consistency checks

Add repository checks that validate:
- README tool list matches the manifest-derived output,
- release script updates expected files,
- version and changelog remain synchronized.

#### Deployment verification

After implementation:
1. run local tests,
2. run typecheck,
3. run local MCP request checks,
4. deploy to `mcp.awsl.app`,
5. real-call validate:
   - `/version`
   - `OPTIONS /mcp`
   - unauthenticated `tools/list` rejection when auth enabled
   - authenticated `tools/list`
   - authenticated `tools/call`
   - fixed `paper_search` examples
   - fixed `paper_get_details` examples
6. create GitHub Release for the patch version.

### 12. Known environment note discovered during design work

While preparing the isolated worktree baseline, both `npm install` and `npm test` failed in the current environment because the Windows subprocess launched by npm could not resolve `node`:
- `'node' is not recognized as an internal or external command`

This appears to be an environment / PATH problem in the current shell bridge rather than a confirmed repository code failure. The implementation phase must re-verify baseline commands after normalizing the runtime environment before treating it as a code regression.

## Risks and handling

### Risk: paper fixes only patch symptoms
Mitigation: add regression tests from the user’s concrete failing inputs before changing code.

### Risk: auth accidentally breaks MCP handshake or probes
Mitigation: protect only `tools/list` and `tools/call`; keep `initialize`, notification flow, and probe endpoints open.

### Risk: browser clients still fail after auth is added
Mitigation: add explicit `OPTIONS /mcp` support and allow the required headers in CORS.

### Risk: README drifts from actual tool exposure again
Mitigation: generate tool lists from the manifest instead of hand-maintaining them.

### Risk: release automation becomes too heavy for the current repo
Mitigation: use patch releases with a single manual trigger command, rather than full semantic-release automation.

### Risk: deployment validation is blocked by the current local environment issue
Mitigation: record the issue, normalize the environment before implementation verification, and only then judge repo health.

## Implementation checklist

1. Add regression tests for both paper bugs.
2. Introduce shared paper identifier normalization.
3. Fix `paper_search` classification / degradation behavior.
4. Fix `paper_get_details` arXiv DOI resolution and merge behavior.
5. Add `/mcp` auth helpers and method-level enforcement.
6. Add `OPTIONS /mcp` and shared CORS response headers.
7. Add release script, changelog, GitHub release automation, and release config.
8. Add manifest-derived documentation generation.
9. Rewrite `README.md` and `README.zh-CN.md` with language-switch links and client examples.
10. Add Cloudflare deploy button and self-hosting guidance.
11. Run local verification, deploy to `mcp.awsl.app`, and real-call test the fixed flows.
12. Create the patch GitHub Release.

## Verification

### Before implementation
- confirm this design file matches the approved scope,
- confirm no placeholders or contradictions remain.

### During implementation
- every runtime behavior change starts with a failing test,
- auth behavior is verified for all three accepted credential forms,
- probe endpoints stay public,
- README tool list is generated from the manifest.

### Completion evidence
- paper regression tests pass,
- auth tests pass,
- CORS / OPTIONS tests pass,
- README generation output is up to date,
- patch version bumped,
- changelog updated,
- live demo deployed with key `elysia`,
- real authenticated calls succeed,
- GitHub Release created with generated notes.
