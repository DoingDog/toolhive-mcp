[中文](./README.zh-CN.md)

# Toolhive MCP

Toolhive MCP is a hosted HTTP MCP server for Cloudflare Workers. It turns a practical bundle of MCP tools into one remote `/mcp` endpoint so you can connect Claude-compatible clients without running a local stdio server.

## What this project is

Use Toolhive MCP when you want:

- one public MCP endpoint instead of a local daemon
- Cloudflare Workers deployment with low operational overhead
- Anthropic-compatible canonical tool names such as `context7_query_docs` and `tavily_search`
- a manifest-driven tool surface that stays aligned with the actual server implementation

## Online demo

Copy this demo endpoint directly into your MCP client:

`https://mcp.awsl.app/mcp?key=elysia`

Additional public endpoints:

- Health: `https://mcp.awsl.app/healthz`
- Ready: `https://mcp.awsl.app/readyz`
- Version: `https://mcp.awsl.app/version`

## Quick client setup

All examples below use the live demo endpoint:

`https://mcp.awsl.app/mcp?key=elysia`

### Claude

Add a remote MCP server in Claude and use:

- URL: `https://mcp.awsl.app/mcp?key=elysia`
- Transport: Streamable HTTP / HTTP MCP

If your Claude build asks for headers instead of a full URL with query params, use `https://mcp.awsl.app/mcp` and send one of the supported auth options from the next section.

### Cursor

In Cursor MCP settings, add a remote server pointing to:

```json
{
  "mcpServers": {
    "toolhive-mcp": {
      "url": "https://mcp.awsl.app/mcp?key=elysia"
    }
  }
}
```

### Cline

In Cline's MCP server configuration, add:

```json
{
  "mcpServers": {
    "toolhive-mcp": {
      "url": "https://mcp.awsl.app/mcp?key=elysia"
    }
  }
}
```

### Cherry Studio

In Cherry Studio, create a custom MCP server with:

- Name: `toolhive-mcp`
- Type: Remote / HTTP MCP
- URL: `https://mcp.awsl.app/mcp?key=elysia`

### Codex

For Codex clients that accept remote MCP configuration, use:

```json
{
  "mcp_servers": {
    "toolhive-mcp": {
      "url": "https://mcp.awsl.app/mcp?key=elysia"
    }
  }
}
```

## Supported authentication

Toolhive MCP currently supports these authentication styles:

- Bearer
- x-api-key / API key
- query `key`

Examples:

```http
Authorization: Bearer elysia
```

```http
x-api-key: elysia
```

```text
https://mcp.awsl.app/mcp?key=elysia
```

This release uses only Bearer, x-api-key / API key, or query `key` authentication.

## Self-hosting

For your own deployment, point clients to:

- MCP: `https://<your-worker-domain>/mcp`
- Health: `https://<your-worker-domain>/healthz`
- Ready: `https://<your-worker-domain>/readyz`
- Version: `https://<your-worker-domain>/version`

### Deploy to Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DoingDog/toolhive-mcp)

Repository: `https://github.com/DoingDog/toolhive-mcp`

Manual deployment:

```bash
npm install
npm run deploy
```

The project uses the repository's existing `wrangler.jsonc` configuration.

### Optional third-party secrets

Only configure the providers you want to expose:

```bash
npx wrangler secret put MCP_AUTH_KEYS
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put EXA_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
npx wrangler secret put PAPER_SEARCH_MCP_UNPAYWALL_EMAILS
```

Key notes:

- `MCP_AUTH_KEYS` enables auth checks for protected `/mcp` methods only after you configure it.
- `MCP_AUTH_KEYS` accepts one key or a comma-separated list of keys. Valid characters are letters, numbers, `_`, and `-`.
- `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` is used for Unpaywall access and the `paper_get_open_access` tool.
- `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` accepts one email or a comma-separated list of emails.
- Provider key secrets can contain one key or a comma-separated list of keys.

## Tool catalog

The block below is generated from the manifest and should be refreshed with `npm run render:readme`.

<!-- GENERATED:README_TOOLING:start -->
### Generated tool snapshot

Demo endpoint: `https://mcp.awsl.app/mcp?key=elysia`

Supported auth:

- Bearer
- x-api-key / API key
- query `key`

Manifest-backed tool surface:

- Native tools: `weather`, `time`, `whoami`, `webfetch`, `calc`
- Paper tools: `paper_search`, `paper_get_details`, `paper_get_related`
- Env-gated paper tool: `paper_get_open_access`
- External tools: `iplookup`
- Env-gated external tools: `exa_search`, `tavily_search`, `tavily_extract`, `tavily_crawl`, `context7_resolve_library_id`, `context7_query_docs`, `puremd_extract`, `unsplash_search_photos`
- Developer utilities: `devutils_base64_encode`, `devutils_base64_decode`, `devutils_hash`, `devutils_uuid`, `devutils_jwt_decode`, `devutils_json_format`, `devutils_json_validate`, `devutils_regex_test`, `devutils_url_parse`, `devutils_timestamp_convert`, `devutils_ip_validate`, `devutils_cidr_calculate`, `devutils_text_stats`, `devutils_slugify`, `devutils_case_convert`

Built-in resources:
- `resource://toolhive/overview` (text/markdown, static)
- `resource://toolhive/auth` (text/markdown, static)
- `resource://toolhive/catalog` (text/markdown, static)
- `resource://toolhive/runtime/enabled` (application/json, runtime)

Built-in prompts:
- `choose_tool_for_task`, `research_with_sources`, `developer_utility_workflow`
- Run `npm run render:readme` to refresh this block from `src/mcp/tool-manifest.ts`, `src/mcp/resource-manifest.ts`, and `src/mcp/prompt-manifest.ts`.
<!-- GENERATED:README_TOOLING:end -->

## Development

Local development workflow:

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Useful notes:

- `npm run dev` starts the Worker locally through Wrangler
- `npm test` runs the Vitest suite
- `npm run typecheck` runs TypeScript without emitting build output
- `GET /version` reports runtime package metadata from `package.json`

## Current release notes

### Disabled domain tools

Domain-related tools are intentionally disabled in this release.

The codebase still contains domain integration code for possible future re-enable, but the released MCP surface does not expose any `domain_*` tools.

### Disabled news tools

News tools are intentionally disabled in this release.

The codebase still contains news integration code for possible future re-enable, but the released MCP surface does not expose any `news_*` tools.

## License

This project is released under the 0BSD license. See [`LICENSE`](./LICENSE).
