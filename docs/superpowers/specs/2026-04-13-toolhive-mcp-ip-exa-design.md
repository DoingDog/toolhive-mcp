# Toolhive MCP IP / Exa Refresh Design

## Context

The current Toolhive MCP release has three concrete product issues and two approved feature additions.

### Problems to fix

1. `tavily_research` is not meaningfully usable in the current MCP surface.
   - Passing `stream: true` triggers MCP-side invalid argument failure.
   - Calling without `stream` may return `pending` and a `request_id`, but the MCP surface does not expose a follow-up polling/query tool.
   - The result is a tool that appears available but cannot reliably complete an end-to-end user task.

2. `devutils_timestamp_convert` accepts ISO date strings and numeric Unix timestamps, but rejects pure numeric Unix timestamp strings such as `"1712930400"`.
   - Current implementation only treats `number` as Unix seconds.
   - Numeric strings incorrectly fall through to `new Date(string)` parsing and fail.

3. The existing `ip` tool is named too generically for what it actually does.
   - The current behavior is closer to “tell me who I am / what IP this request came from” than arbitrary IP lookup.

### Approved product changes

1. Remove public exposure of `tavily_research`.
2. Replace `ip` with `whoami` and do not preserve `ip` compatibility.
3. Add `iplookup` for arbitrary IP/domain lookup.
4. Add Exa search support using Exa’s HTTP API, covering as much stable synchronous functionality as practical.
5. Keep all new public tool names Anthropic-compatible.

## User-approved constraints

- Use **solution A**: focused repair + one integrated Exa search tool.
- `tavily_research` should be taken offline from the MCP surface, but its implementation code may remain in the repo.
- `ip` must be fully replaced by `whoami`; no legacy alias should remain.
- `whoami` output should be **simplified**, not retain full raw request/debug payloads.
- `iplookup` should return **curated core fields plus `raw`**.
- `iplookup` may use `ip-api.com` free JSON API for this personal non-commercial open-source project.
- Exa should expose as much stable, synchronous capability as possible, while excluding stream / background / queued / polling-dependent behaviors.

## Goals

1. Remove misleading or incomplete tool behavior from the public MCP surface.
2. Make IP-related tooling clearer for both humans and LLM clients.
3. Fix a real timestamp parsing incompatibility without widening scope into general date parsing redesign.
4. Introduce Exa in a way that is powerful but still predictable for MCP clients.
5. Keep the tool list understandable and avoid repeating the same “surface looks rich, but real completion path is broken” problem seen with `tavily_research`.

## Non-goals

This change does **not** include:

- re-introducing `tavily_research`
- adding polling tools for Tavily research jobs
- preserving `ip` as a backward-compatible alias
- adding batch IP lookup support
- adding Exa streaming support
- exposing Exa research-style prompt orchestration (`systemPrompt`, `outputSchema`, `additionalQueries`) in the first release
- redesigning unrelated tool names or domain tool behavior

## Design

### 1. Public tool surface

#### Tavily
Keep publicly exposed:
- `tavily_search`
- `tavily_extract`
- `tavily_crawl`

Remove from public exposure:
- `tavily_research`

Implementation detail:
- remove the tool from `tools/list`
- remove the route-level dispatch path from `tools/call`
- keep underlying implementation code in place for future re-enable if Tavily later provides a complete synchronous or queryable workflow

#### IP tools
Current public tool:
- `ip`

New public tools:
- `whoami`
- `iplookup`

Compatibility rule:
- `ip` is removed outright
- no legacy alias remains

#### Exa
Add one new public tool:
- `exa_search`

Rationale:
- one capable synchronous search tool is easier for MCP clients than splitting into multiple overlapping Exa tools too early

### 2. `whoami`

#### Input
No arguments.

#### Purpose
Return a compact answer to: “What IP and location does this request appear to come from?”

#### Output shape
The response should be intentionally concise and centered on identity, not request introspection.

Recommended fields:
- `ip`
- `country`
- `country_code`
- `region`
- `city`
- `timezone`
- `source`
- `user_agent`

#### Behavior
- derive IP from request headers in the existing priority order
- use Cloudflare request metadata when available for location fields
- allow partial/null location data instead of failing
- do not return the full `headers` object
- do not return the full raw `cf` object

#### Rationale
The new name and smaller payload reduce LLM confusion and better match actual intent.

### 3. `iplookup`

#### Upstream
Use the documented free JSON endpoint from ip-api:
- `http://ip-api.com/json/{query}?fields=55312383`

#### Input
```json
{
  "query": "8.8.8.8"
}
```

`query` may be:
- IPv4
- IPv6
- domain name

#### Output shape
Curated core fields plus the upstream payload:
- `query`
- `ip`
- `country`
- `country_code`
- `region`
- `region_code`
- `city`
- `timezone`
- `lat`
- `lon`
- `zip`
- `isp`
- `org`
- `as`
- `asname`
- `mobile`
- `proxy`
- `hosting`
- `raw`

#### Error behavior
- upstream `status=fail` becomes a clear tool error with upstream `message` preserved where possible
- HTTP 429 becomes a clear rate-limit error
- non-200 upstream responses become upstream errors
- read `X-Rl` and `X-Ttl` headers so rate-limit conditions can be surfaced accurately

#### Constraints to document
- free upstream is HTTP only
- free upstream is non-commercial only
- free upstream is limited to 45 requests/minute per IP

These are accepted constraints for this repository but should be documented clearly.

### 4. `devutils_timestamp_convert`

#### Current bug
Numeric strings are treated as generic date strings rather than Unix seconds.

#### New parsing rule
Accept all of the following:
- ISO date strings
- Unix seconds as numbers
- Unix seconds as pure digit strings

#### Parsing order
1. if `value` is a number, parse as Unix seconds
2. if `value` is a string matching a pure numeric pattern, parse as Unix seconds
3. otherwise parse as date string
4. if parsing fails, return `Invalid date or timestamp`

#### Explicitly out of scope
- auto-detecting milliseconds vs seconds
- natural-language date parsing

This keeps the fix narrow and directly aligned with the reported bug.

### 5. `exa_search`

#### Authentication
Add a new environment key:
- `EXA_API_KEYS`

Use the same overall behavior pattern as current external key-gated tools:
- multiple comma-separated keys supported
- random initial key selection
- rotate on authentication failure
- reuse existing retry utilities where applicable

#### Input surface
Expose as much stable synchronous search functionality as practical, using MCP-friendly snake_case names.

Recommended fields:
- `query` (required)
- `limit`
- `search_type`
- `category`
- `include_domains`
- `exclude_domains`
- `start_published_date`
- `end_published_date`
- `start_crawl_date`
- `end_crawl_date`
- `include_text`
- `text_max_characters`
- `include_highlights`
- `highlights_max_characters`
- `include_summary`
- `summary_query`
- `livecrawl`
- `moderation`
- `user_location`

#### Output shape
Recommended result:
- `request_id`
- `results`
  - `title`
  - `url`
  - `id`
  - `published_date`
  - `author`
  - `score`
  - `text`
  - `highlights`
  - `summary`
  - `image`
  - `favicon`
- `raw`

#### Excluded Exa capabilities
Do not expose in this first release:
- `stream`
- `outputSchema`
- `systemPrompt`
- `additionalQueries`
- any behavior that requires background job handling, queued completion, or follow-up polling

#### Rationale
The goal is to expose powerful synchronous retrieval, not turn `exa_search` into a half-stable research agent.

### 6. Naming and compatibility rules

All public tool names must remain Anthropic-compatible.

New and updated names:
- `whoami`
- `iplookup`
- `exa_search`

Compatibility behavior:
- keep existing canonical names for unrelated tools
- remove `ip`
- remove `tavily_research` from public exposure

## Implementation impact

### Files expected to change

#### Registry / routing / env typing
- `src/mcp/tool-registry.ts`
- `src/mcp/router.ts`
- `src/mcp/schema.ts`
- `src/lib/env.ts`

#### Tool implementations
- `src/tools/native/ip.ts` or a renamed successor implementing `whoami`
- `src/tools/external/iplookup.ts` (new)
- `src/tools/external/exa.ts` (new)
- `src/tools/devutils/timestamp.ts`
- `src/tools/external/tavily.ts` (only if needed for cleanup / surface alignment)

#### Tests
- `tests/mcp/tool-registry.test.ts`
- `tests/mcp/protocol.test.ts`
- `tests/tools/native.test.ts`
- `tests/tools/external.test.ts`
- `tests/tools/devutils.test.ts`

#### Docs / deployment
- `README.md`
- `README.zh-CN.md`
- Cloudflare secret documentation / deployment notes

## Testing strategy

### Tool-level tests
- `whoami` returns a simplified payload
- `iplookup` handles success, upstream fail, non-200, and 429 cases
- `devutils_timestamp_convert` accepts numeric Unix timestamp strings
- `exa_search` handles success, validation, network retry, and auth key rotation

### Protocol-level tests
- `tools/list` no longer exposes `tavily_research`
- `tools/list` exposes `whoami` instead of `ip`
- `tools/list` exposes `exa_search` only when `EXA_API_KEYS` exists
- JSON-RPC dispatch works for `whoami`, `iplookup`, and `exa_search`

### Full verification
- `npm test`
- `npm run typecheck`

### Deployment verification
After deployment, verify at the live MCP endpoint:
- `initialize`
- `tools/list`
- `whoami`
- `iplookup`
- `exa_search`
- `devutils_timestamp_convert`
- existing Tavily tools still exposed: `tavily_search`, `tavily_extract`, `tavily_crawl`
- `tavily_research` absent from the live tool list

## Risks

### 1. `iplookup` upstream limitations
This design intentionally accepts an upstream with the following constraints:
- HTTP only on free tier
- non-commercial usage restriction
- per-IP rate limits

This is acceptable for the approved use case but must be documented honestly.

### 2. Exa capability creep
Exa exposes more than a simple search API. If its advanced parameters are mirrored too directly, the tool becomes harder for LLM clients to use correctly.

Mitigation:
- keep one carefully curated synchronous tool
- exclude stream / research-style orchestration inputs for now

### 3. Repeating the Tavily research mistake
A tool that appears powerful but cannot actually complete a stable end-to-end task is worse than a smaller, honest tool surface.

Mitigation:
- expose only stable synchronous Exa features
- remove incomplete Tavily research exposure

## Implementation checklist

1. Remove `tavily_research` from the public MCP surface.
2. Replace `ip` with `whoami` without legacy alias compatibility.
3. Implement simplified `whoami` output.
4. Add `iplookup` using `ip-api.com` JSON endpoint with `fields=55312383`.
5. Fix `devutils_timestamp_convert` numeric-string Unix parsing.
6. Add `EXA_API_KEYS` env gating.
7. Implement `exa_search` with curated synchronous features.
8. Update registry, routing, schemas, tests, and docs.
9. Run local verification.
10. Deploy and verify the live endpoint.

## Verification criteria

The work is considered complete only if all of the following are true:

- `tools/list` reflects the new surface exactly
- `ip` is gone and `whoami` works
- `iplookup` works against the chosen upstream
- numeric Unix timestamp strings now parse in `devutils_timestamp_convert`
- `exa_search` is available only with `EXA_API_KEYS`
- all local tests pass
- typecheck passes
- deployment succeeds
- live endpoint behavior matches the new design
