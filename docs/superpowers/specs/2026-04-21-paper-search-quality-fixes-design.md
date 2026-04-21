# Paper Search Quality Fixes + Webfetch Contract Repair Design

## Summary

This design covers a focused follow-up pass on the manifest-first paper tools and `webfetch` behavior. The goal is to fix real issues found during live testing without expanding the product surface beyond the existing Cloudflare Workers, stateless, bounded-latency constraints.

The scope is intentionally narrower than the original paper-manifest design:

1. repair paper query classification so DOI and arXiv-like inputs do not fall into generic full-text search
2. restore missing normalized metadata such as `authors` and `venue`
3. improve search result quality for exact-title queries and suppress obvious low-quality non-paper records
4. make `paper_get_related` semantics explicit when it degrades to Crossref references
5. improve readability of related results through filtering, hydration, and quality ordering
6. repair the `webfetch(format=markdown)` output contract so HTML fallback is explicit instead of ambiguous

## Goals

- classify DOI and arXiv DOI queries before generic paper search
- return non-empty `authors` and non-null `venue` when upstream metadata is available
- rank canonical papers higher for exact-title queries such as "Attention Is All You Need"
- suppress supplementary/component/attachment/media-style search hits by default
- stop returning degraded Crossref references as if they were true related-work graph results
- filter or push down low-readability related results, especially `title: null`
- improve top related results by hydrating DOI-bearing records within a bounded request budget
- make `webfetch` clearly communicate whether markdown extraction succeeded or fell back
- validate the result locally and against the deployed Cloudflare test environment

## Non-Goals

- no persistent cache, queue, or background enrichment pipeline
- no attempt to eliminate all OpenAlex rate-limit or availability failures
- no broad academic-site extractor framework for `webfetch`
- no paid providers or providers that require mandatory keys
- no Node-only parsing stack incompatible with Cloudflare Workers
- no renaming of existing public paper tool names

## Constraints

- runtime remains Cloudflare Workers JavaScript/TypeScript
- execution remains stateless and bounded-latency
- live paper quality fixes must fit a single request fan-out budget
- `paper_get_related` must prefer true related works but degrade safely when upstream graph data is unavailable
- `webfetch` repair in this pass is contract-focused, not a general extraction-quality project
- default filtering should favor readable, likely-primary paper results over exhaustive recall

## Recommended Approach

Use a bounded quality layer inside the existing paper handlers instead of adding new tools or storage.

### Why this approach

The live issues are concentrated in three places:

- provider normalization drops usable metadata
- search and related handlers lack classification and quality control
- `webfetch` does not distinguish successful extraction from raw fallback strongly enough

A bounded quality layer fixes the user-visible failures while preserving the current manifest-first architecture and Cloudflare Workers constraints.

## Alternatives Considered

### Option A: Minimal bug fixes only

Fix only the most obvious logic defects:

- DOI query classifier
- provider author/venue mapping
- related fallback labeling
- markdown contract repair

**Pros**
- smallest change set
- lowest regression risk

**Cons**
- leaves exact-title ranking weak
- leaves supplementary/component pollution visible
- leaves related output quality rough

### Option B: Bounded quality repair on current architecture

Fix the hard bugs and add lightweight ranking, filtering, hydration, and degradation metadata.

**Pros**
- addresses most user-visible issues from live testing
- preserves stateless bounded execution
- improves quality without introducing a new subsystem

**Cons**
- still depends on upstream provider quality
- cannot guarantee true related-works graph data on every request

### Option C: Aggressive feature expansion

Add broad extraction logic, larger provider fan-out, and deeper graph enrichment.

**Pros**
- highest potential quality ceiling

**Cons**
- higher latency and timeout risk
- worse fit for Cloudflare Workers and no-state execution
- larger regression surface than needed for the reported issues

**Recommendation:** Option B.

## Design

### 1. Query classification before paper search

`paper_search` should classify the incoming query before generic full-text search.

#### Classification rules

- DOI-shaped input: treat as an exact DOI lookup path
- `10.48550/arXiv.*`: normalize to `arxiv_id`
- arXiv id-shaped input: route to arXiv/detail lookup path
- everything else: continue through generic Crossref + OpenAlex search

#### Expected effect

This prevents values such as `10.48550/arXiv.1706.03762` from being fragmented into numeric terms and matched against unrelated Crossref content.

#### Response shape

The existing response shape is preserved. The difference is routing behavior and result quality, not a new endpoint contract.

### 2. Provider normalization repair

The shared normalized paper shape is correct, but current adapters leave too many fields empty.

#### Crossref normalization

Add mapping for:

- `author[]` into normalized `authors`
- `container-title[0]`
- `short-container-title[0]`
- proceedings/event-derived venue fields where available
- citation/reference counts where present

#### OpenAlex normalization

Add mapping for:

- authorships into normalized `authors`
- source/venue title
- cited-by/reference counts
- abstract text when reconstructable from the payload

#### arXiv normalization

Add author parsing so arXiv details no longer return `authors: []` for canonical papers.

#### Reference parsing guardrails

Crossref free-text references should not be trusted as strongly as hydrated DOI metadata. Obvious venue garbage such as arXiv-like numeric fragments or malformed abbreviations should be rejected from normalized `venue`.

### 3. Search quality layer

Generic title search should go through a local quality pass after provider aggregation.

#### Title normalization

Use a normalization key that removes case, punctuation, repeated whitespace, and similar formatting noise so exact-title matches can be recognized even when upstream title formatting differs.

#### Filtering

Default-filter records that are clearly not primary paper records, including items that look like:

- supplements
- components
- attachments
- media records
- DOI suffixes such as `/mm1` when they strongly indicate auxiliary files

#### Deduplication

Merge or collapse duplicates using existing DOI/arXiv/title-based merge rules, extended with normalized-title awareness so near-duplicate exact-title results do not crowd out the canonical paper.

#### Ranking

Use a bounded local ranking pass with these priorities:

1. exact normalized title match
2. metadata completeness
3. citation/reference signal where available
4. earlier publication-year prior for classic-paper queries when title match is otherwise equal
5. provider quality / likely-primary-paper signal

The purpose is not to build a general scholarly ranker, only to correct the most visible failures from live testing.

### 4. Explicit `paper_get_related` degradation semantics

`paper_get_related` should continue to prefer true OpenAlex related works, but fallback must become explicit.

#### Primary path

- resolve DOI / OpenAlex id / OpenAlex URL to an OpenAlex work
- if related works are available, return them as the normal result path

#### Degraded path

If OpenAlex seed resolution or related fetch fails and the request can degrade to Crossref references, return a successful but explicitly degraded response.

The response should include additional metadata such as:

- `relationship_type: "reference"`
- `degraded_reason`
- `partial: true`
- `providers: ["crossref"]`

This keeps the endpoint useful while stopping it from pretending that Crossref references are semantically identical to graph-neighbor related works.

### 5. Related result quality repair

The related/reference result list should prefer readable records.

#### Default filtering

Filter out records with `title: null` by default.

#### Hydration

For the top bounded subset of DOI-bearing related results, perform a second metadata lookup to hydrate:

- `title`
- `authors`
- `venue`
- better normalized identifiers where available

Hydration remains request-local only. No durable cache is introduced.

#### Ordering

After hydration, order results by completeness so readable records appear first. Incomplete records that remain after hydration should fall to the bottom or be filtered if they fail the readability threshold.

### 6. Merge behavior updates

The current merge logic should be refined so low-quality records no longer erase better metadata.

#### Required merge rules

- empty `authors` must not overwrite non-empty `authors`
- weaker `venue` strings must not replace stronger hydrated `venue` values
- OpenAlex `paper_id` should still win when it enables later graph operations
- higher-completeness records should continue to determine the merged provider identity

### 7. `webfetch(format=markdown)` contract repair

This pass does not attempt broad content-extraction quality improvements. It only repairs the response contract.

#### Required behavior

When the caller requests `format: "markdown"`:

- the returned body must be markdown/text-like output, not raw HTML silently passed through
- if extraction or conversion fails, the response must say so explicitly

#### Additional response metadata

Add explicit contract fields such as:

- `requested_format`
- `actual_format`
- `extracted`
- `fallback_reason`

The exact field names can be adjusted during implementation, but the design requirement is that the caller can reliably tell whether markdown extraction actually happened.

## Error Handling and Degradation Rules

### Paper providers

- upstream provider failures remain partial success where enough useful data exists
- provider participation should be surfaced accurately in `providers`
- degraded or skipped paths should expose enough metadata to explain why the result is partial

### Related results

- OpenAlex failure plus successful Crossref fallback is a successful degraded response, not an internal-error-style silent semantic swap
- no fallback should claim `relationship_type: "related"` when the data is actually references

### Webfetch

- invalid input remains a validation error
- upstream HTTP failure remains an upstream error
- extraction/conversion failure is a successful fetch with explicit fallback metadata, not a pretend markdown success

## Testing Strategy

### Provider tests

Add or expand tests for:

- Crossref author and venue mapping
- OpenAlex author/source/count mapping
- arXiv author parsing
- reference parser venue guardrails

### Handler tests

Add or expand tests for:

- DOI query classification in `paper_search`
- `10.48550/arXiv.*` query normalization
- exact-title ranking for classic papers
- supplementary/component filtering
- explicit degraded `paper_get_related` semantics
- filtering of `title: null` related results
- DOI hydration for top related/reference records
- `webfetch(format=markdown)` contract metadata

### Local verification

Run:

- `npm test`
- `npm run typecheck`

### Cloud verification

After implementation, redeploy to the Cloudflare test environment and verify at least:

- `/healthz`
- `/readyz`
- `/version`
- `paper_search` with exact-title queries
- `paper_search` with DOI and arXiv DOI queries
- `paper_get_related` normal path and degraded fallback path
- `webfetch` markdown contract behavior on a representative HTML page

## Known Limits Preserved by Design

These limits remain explicit even after the fix:

- OpenAlex rate limiting or transient upstream failure cannot be solved fully inside this repository
- request-local hydration is bounded and may not enrich every DOI-bearing related result
- `webfetch` still does not become a full academic extraction framework in this pass
- no persistent caching or background post-processing is introduced

## Implementation Readiness

This design is ready for a focused implementation plan. The work stays inside the current tool surface and architecture, but sharpens routing, metadata normalization, search quality, degradation semantics, and `webfetch` output-contract correctness.
