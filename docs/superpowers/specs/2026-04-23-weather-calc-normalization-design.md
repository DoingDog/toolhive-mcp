# Weather Lang Normalization and Calc Operator Compatibility Design

## Context

The current `weather` tool forwards `lang` directly to wttr.in. This causes common client inputs such as `zh-CN` and `zh_CN` to fail upstream even though they are straightforward local compatibility cases. The desired behavior is to normalize common language-tag variants before making the upstream request, and to reject obviously invalid `lang` values locally instead of surfacing them as upstream failures.

The current `calc` tool supports `^` for exponentiation but does not support several common operator formats that users naturally type or paste: `**` for exponentiation, `×` for multiplication, and `÷` for division. The goal is to support those formats while preserving the existing evaluator structure, precedence, right-associative exponent behavior, and error semantics.

This is a targeted compatibility fix. It should stay small, test-driven, and should not expand into a broader parser redesign.

## Scope

This design covers:

1. `weather.lang` normalization for common language tag forms:
   - `zh-CN -> zh-cn`
   - `zh_CN -> zh-cn`
   - already-normalized values such as `zh-cn` remain unchanged
2. Local rejection of obviously invalid `lang` formats before calling wttr.in
3. `calc` support for:
   - `**` as exponentiation
   - `×` as multiplication
   - `÷` as division
4. Regression tests for direct handler behavior and JSON-RPC entry behavior where appropriate
5. Local verification, deployment, and live endpoint checks after implementation

This design does not cover:

- `x` or `X` as multiplication aliases
- scientific notation changes
- broader Unicode math support
- natural-language math parsing
- `weather` behavior changes unrelated to `lang`

## Alternatives Considered

### 1. Minimal compatibility layer in the existing runtime path (recommended)

- Normalize `weather.lang` inside `src/tools/native/weather.ts`
- Extend math tokenization/parsing behavior only enough to support `**`, `×`, and `÷`
- Keep JSON-RPC routing and tool registration behavior unchanged

Advantages:
- smallest runtime change set
- lowest regression risk
- directly addresses the user-reported failures without adding new ambiguous behavior

Trade-off:
- only solves the explicitly requested compatibility cases

### 2. Handler-only expression preprocessing

- Normalize all `calc` operator aliases inside `src/tools/native/calc.ts` before calling the evaluator

Advantages:
- easy to reason about from the tool entrypoint

Trade-offs:
- math normalization becomes separated from the evaluator itself
- future reuse of the evaluator would duplicate normalization logic

### 3. Broader parser redesign

- introduce a richer parser/normalization layer for many more operator aliases and future syntax extensions

Advantages:
- more extensible long term

Trade-offs:
- clearly too large for the current request
- much higher regression and scope-creep risk

## Recommended Design

### 1. `weather` normalization and validation

Keep the change local to `src/tools/native/weather.ts`.

Add a small normalization step for `lang` that:
- requires `lang` to be a string when present
- trims leading and trailing whitespace
- converts `_` to `-`
- lowercases the value
- validates that the tag is composed of alphanumeric segments separated by `-`

Behavior rules:
- if `lang` is absent, current behavior remains unchanged
- if `lang` normalizes to a valid tag, send the normalized value upstream
- if `lang` is obviously malformed, return a local `validation_error`

This keeps the compatibility logic close to the wttr.in request construction and avoids expanding the tool schema or router logic.

### 2. `calc` operator compatibility

Keep `src/tools/native/calc.ts` as a thin argument-validation entrypoint.

Implement the compatibility work in the math layer:
- `src/lib/math/tokenizer.ts`
  - recognize `**` as a single token rather than two `*` tokens
  - recognize `×` and `÷` as operator tokens
- `src/lib/math/evaluate.ts`
  - treat `**` the same as `^`
  - treat `×` the same as `*`
  - treat `÷` the same as `/`
  - preserve existing precedence and right-associative exponentiation behavior

This keeps operator semantics where they already live today and avoids scattering math rules into the tool handler or router.

### 3. Error-handling rules

For `weather`:
- local format issues become `validation_error`
- upstream failures remain `upstream_error`

For `calc`:
- supported compatibility operators evaluate successfully
- malformed expressions such as `2***3` still produce clear validation errors
- existing unsupported identifier/function behavior remains unchanged

### 4. File boundaries

Expected touched files:
- `src/tools/native/weather.ts`
- `src/lib/math/tokenizer.ts`
- `src/lib/math/evaluate.ts`
- `tests/tools/native.test.ts`
- optionally `src/mcp/tool-manifest.ts` only if documentation wording needs to mention accepted operator forms

Files that should remain unchanged unless a concrete test forces otherwise:
- `src/tools/native/calc.ts`
- `src/mcp/router.ts`
- `src/mcp/tool-registry.ts`

## Test Design

Implementation should follow TDD.

### `weather` regression tests

Add failing tests for:
1. `lang: "zh-CN"` results in an upstream request using `lang=zh-cn`
2. `lang: "zh_CN"` results in an upstream request using `lang=zh-cn`
3. `lang: "zh-cn"` remains accepted unchanged
4. invalid values such as `zh cn` fail locally with `validation_error`

These tests should live next to the current `weather` handler and JSON-RPC regression tests in `tests/tools/native.test.ts`.

### `calc` regression tests

Add failing tests for:
1. `2**3 -> 8`
2. `2 ** 3 -> 8`
3. `6×7 -> 42`
4. `8÷2 -> 4`
5. malformed input such as `2***3` still fails cleanly
6. precedence protection such as `-2**2`, matching the existing `^` behavior

These tests should live next to the existing `calc` and JSON-RPC tests in `tests/tools/native.test.ts`.

## Verification Plan

After implementation:

1. Run focused tests for the affected file and verify the new cases go red then green
2. Run `npm run typecheck`
3. Run `npm test`
4. Deploy the worker
5. Live-test `/mcp` with:
   - `weather` using `{ "location": "Beijing", "format": "json", "lang": "zh-CN", "units": "metric" }`
   - `calc` using `2**3`, `6×7`, and `8÷2`
6. Verify health endpoints remain healthy:
   - `/healthz`
   - `/readyz`
   - `/version`

## Design Summary

The recommended solution is to keep both fixes small and local:
- normalize and validate `weather.lang` in the weather tool
- add `**`, `×`, and `÷` compatibility at the math tokenizer/evaluator layer
- drive the work with focused regression tests and full local plus deployed verification

This addresses the user-reported compatibility gaps without turning a small fix into a parser rewrite.
