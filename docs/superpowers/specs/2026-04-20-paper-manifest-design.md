# Paper Search + Manifest-First Design

## Summary

This design covers four coordinated changes for the Cloudflare Workers MCP server:

1. establish a manifest-first single source of truth for tool definitions and release-facing metadata
2. add production guardrails around upstream fetches and service health endpoints
3. improve model-facing tool UX with stricter naming, descriptions, and compact outputs
4. add a paper-search capability set that reproduces as much of `openags/paper-search-mcp` as is feasible within Cloudflare Workers, free/no-key providers, stateless execution, and bounded request latency

The implementation will use canonical underscore tool names only. Hyphenated names are excluded. Legacy dotted aliases may still be accepted for compatibility, but they will not be the primary surface.

## Goals

- eliminate metadata drift between registry, router dispatch, README, tests, and release/version metadata
- make tool exposure, docs generation, and dispatch derive from one manifest model
- add default timeout and response-size protections to all upstream requests
- expose `/healthz`, `/readyz`, and `/version`
- make tool descriptions and outputs easier for MCP clients and models to consume correctly
- add broad paper-search coverage without file handling, persistence, paid APIs, or long-running workflows
- validate the result locally and on a deployed Cloudflare Workers test environment

## Non-Goals

- no file download or file storage by the MCP server
- no IEEE Xplore or ACM Digital Library integration
- no paid-only data sources
- no persistent caches, databases, queues, or user state
- no long-running asynchronous jobs
- no Node-only runtime dependencies incompatible with Cloudflare Workers
- no promise to clone every upstream feature when it violates Workers/runtime/latency constraints

## Constraints

- runtime is Cloudflare Workers JavaScript/TypeScript with no Node compatibility assumptions
- deployment target is a test Cloudflare environment, not a live production business workload
- required rotating environment variable for Unpaywall is `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS`
- optional-key providers should be used only when they can work without secrets
- canonical naming style must use underscores, not hyphens
- existing project conventions and prior development workflow should be followed

## Recommended Approach

Adopt a manifest-first internal architecture while keeping the externally visible tool surface aligned with the existing repository style.

### Why this approach

A manifest-first layer solves the highest-value problem once: registry drift. It also creates the foundation needed to safely add a large new paper-search tool family without reintroducing duplication across docs, tests, dispatch, and release metadata.

## Alternatives Considered

### Option A: Patch the current registry in place

Keep the current registry structure and manually update README, router logic, tests, and paper tools.

**Pros**
- fastest initial coding path
- smallest short-term refactor

**Cons**
- does not solve drift structurally
- higher maintenance cost for every new tool
- easy to regress naming/schema/docs consistency again

### Option B: Build paper tools first, defer manifest refactor

Add paper-search features now, then clean up metadata generation later.

**Pros**
- quicker visible feature expansion

**Cons**
- multiplies duplicated definitions immediately
- guarantees another migration soon after
- creates higher review and regression risk

### Option C: Manifest-first core, then migrate current and new tools onto it

Introduce a manifest model, generate registry/docs/tests from it, then add paper-search tools through the same path.

**Pros**
- addresses root cause
- scales cleanly for current and future tools
- gives one place to encode env gating, aliases, examples, limits, and output contracts

**Cons**
- broader initial change set
- needs careful migration testing

**Recommendation:** Option C.

## Architecture

### 1. Tool manifest layer

Introduce a central manifest model that defines each tool once. Each manifest entry should include at least:

- `name`
- `aliases`
- `description`
- `inputSchema`
- `envRequirement`
- `handler`
- `category`
- `examples`
- `outputShape`
- `limits`
- `whenToUse`
- `whenNotToUse`

This manifest becomes the source for:

- MCP `tools/list`
- tool lookup and dispatch
- env-gated enablement
- README tool tables
- schema/registry snapshot tests
- version/release-facing metadata exports where applicable

### 2. Registry generation

Refactor [src/mcp/tool-registry.ts](src/mcp/tool-registry.ts) so it no longer hand-assembles separate native/external/devutils arrays as the primary source of truth. Instead, it should consume normalized manifest entries and produce enabled tool definitions from a single path.

Alias handling remains supported for compatibility, but canonical names are always underscore-based and are the only names shown in generated surfaces.

### 3. Router dispatch generation

Router dispatch should derive from the same manifest entries that power `tools/list`. That removes the risk that a tool can appear in listing but route differently, or vice versa.

### 4. Documentation generation

README tool tables should be generated from the manifest or from a generated artifact derived from it. The generated output should include:

- canonical name
- aliases if any
- short purpose
- env requirements
- notable limits

This avoids drift between README and the actual exposed tool surface.

### 5. Version metadata alignment

Version surfaces should be aligned across:

- `package.json`
- `/version`
- release tags / release notes generation inputs if present
- README release-facing references where relevant

The goal is not to automate every release task immediately, but to ensure one authoritative version value is consumed by runtime and docs.

## Paper Search Capability Design

### Scope philosophy

Reproduce as much of `openags/paper-search-mcp` as practical within these hard boundaries:

- stateless only
- bounded latency
- Workers-compatible only
- free or no-key providers only
- no file handling beyond returning download URLs

### Tool families

#### Search tools

- `paper_search`
- `paper_search_by_doi`
- `paper_search_by_arxiv`
- `paper_search_by_title`

#### Detail and graph tools

- `paper_get_details`
- `paper_get_references`
- `paper_get_citations`
- `paper_get_related`

#### Access and link tools

- `paper_get_open_access`
- `paper_get_pdf_links`
- `paper_get_download_links`

#### Discovery helpers

- `paper_search_authors`
- `paper_search_venues`

If upstream analysis shows some of these are not implementable within the constraints, the implementation may collapse a subset into fewer tools, but the preferred shape is to keep the surface task-oriented rather than overloaded.

### Provider strategy

#### Required

- Unpaywall using `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS`
  - emails are parsed as a rotating pool
  - each request chooses one email pseudo-randomly or randomly

#### Preferred free/no-key providers

- Crossref
- OpenAlex
- Semantic Scholar if usable without mandatory paid/auth-only flow for the selected endpoints
- arXiv
- PubMed and/or Europe PMC
- DOAJ
- CORE or OpenAIRE only if usable with acceptable latency and no required paid/auth barrier

#### Explicitly excluded

- IEEE Xplore
- ACM Digital Library
- providers that are paid-only
- providers requiring mandatory keys when no approved key will be supplied
- browser automation scraping sources

### Aggregation and normalization

Use DOI as the preferred stable identifier. Fallback precedence:

1. DOI
2. arXiv id
3. PubMed id or provider-native id when necessary
4. normalized title + year + first author heuristic

Normalized result objects should prefer compact, stable fields such as:

- `title`
- `authors`
- `abstract`
- `year`
- `venue`
- `doi`
- `arxiv_id`
- `paper_id`
- `source_links`
- `download_links`
- `open_access`
- `citation_count`
- `reference_count`
- `provider_used`
- `partial`
- `truncated`

Responses should be compact by default. Large raw payloads must not be returned unless an explicit opt-in field requests them and the provider/tool supports it safely.

### Download handling

The MCP server does not download or store files. It only returns discovered links, with preference ordering such as:

1. publisher landing page with OA signal
2. direct PDF link when available
3. repository/archival PDF link
4. DOI landing URL

### Latency control

Each paper tool should have an explicit fan-out budget. Multi-provider lookups should stop waiting once the response has enough high-confidence data or when the budget is exhausted. Partial success is acceptable and should be represented explicitly.

## Guardrails

### Shared upstream fetch wrapper

Create a shared fetch path for all upstream HTTP access with:

- default timeout
- maximum response size limit
- optional content-type expectations
- normalized request headers
- normalized error mapping
- bounded redirect handling where relevant
- telemetry-friendly provider labeling in returned metadata

This wrapper should be used by current tools and new paper tools so guardrails are uniform.

### Response size policy

Especially for `webfetch`, extract/crawl style tools, and paper aggregation outputs:

- large content should be truncated predictably
- the response should expose `truncated`
- include `content_length` when measurable
- include `provider_used`
- include `cached`
- include `partial` when one or more upstreams failed or were skipped due to limits

## HTTP Operational Endpoints

Add three lightweight endpoints:

- `/healthz`: process/runtime availability
- `/readyz`: service readiness including required runtime configuration checks for enabled capabilities
- `/version`: package version, build identity if available, and release metadata

These endpoints should be small, deterministic, and suitable for deployment verification.

## Model-Facing UX Rules

- canonical names use underscores only
- no hyphens in tool names
- dotted names are compatibility aliases only
- each tool description should clearly say what it is for
- each tool description should avoid ambiguous overlap where possible
- outputs should prefer compact normalized structures
- large raw fields should be opt-in

Where the existing project already exposes legacy aliases, compatibility can remain at lookup time, but generated docs and `tools/list` should present only canonical names.

## Testing Strategy

### Unit tests

Add or update tests for:

- manifest normalization
- canonical name generation and alias resolution
- env gating
- schema generation integrity
- README/export generation helpers if implemented as code
- fetch timeout behavior
- response-size truncation behavior
- paper provider normalization
- deduplication and merge precedence
- partial-success handling

### Integration tests

Add or update tests for:

- `tools/list` from the generated manifest path
- `tools/call` on representative current tools and paper tools
- `/healthz`, `/readyz`, `/version`
- paper-search happy path with mocked upstream responses
- degraded paper-search path where one or more providers fail or time out

### Deployment verification

After implementation, deploy to the Cloudflare Workers test environment and run real remote checks against:

- `/healthz`
- `/readyz`
- `/version`
- `/mcp` `tools/list`
- at least one live paper search golden path
- at least one live paper details or open-access lookup path

Completion claims require real evidence from these checks.

## Worktree and Subagent Execution

Implementation should run in an isolated worktree. Subagents should be used for independent lanes such as:

- paper-search upstream capability analysis
- codebase architecture/manifest migration analysis
- post-implementation code review

Because completed subagents cannot be messaged again later, any later independent task should use a fresh subagent rather than assuming a finished one can be resumed.

## Risks and Mitigations

### Risk: manifest migration breaks existing tool exposure

**Mitigation:** migrate with snapshot/integration coverage on `tools/list` and `tools/call`, and preserve alias compatibility where needed.

### Risk: paper provider inconsistency produces noisy merged results

**Mitigation:** prefer DOI/arXiv-first identity resolution and keep provider-specific fields behind normalized contracts.

### Risk: Workers request limits or latency spikes

**Mitigation:** cap provider fan-out, use per-provider timeouts, allow partial results, avoid long-running sources.

### Risk: README generation becomes brittle

**Mitigation:** generate from a minimal stable manifest projection rather than from ad hoc string parsing.

## Implementation Readiness

This scope is appropriate for one coordinated implementation plan provided the work is sequenced into:

1. manifest core and migration of existing tools
2. shared guardrails and operational endpoints
3. model-facing docs/output tightening
4. paper-search provider layer and tools
5. test expansion
6. deployment and cloud verification

No further requirement ambiguity remains for planning. The design explicitly chooses underscore canonical naming, real deployment to a test Cloudflare environment, and maximum feasible paper-search coverage within the stated runtime and cost constraints.
