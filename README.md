# Toolhive MCP

Toolhive MCP is a remote HTTP MCP server built for Cloudflare Workers. It packages a practical set of MCP tools behind one `/mcp` endpoint, keeps tool names Anthropic-compatible, and is ready to run as a hosted endpoint instead of a local stdio server.

Demo endpoint: `https://mcp.awsl.app/mcp`

## Why

Running MCP tools behind a single hosted endpoint is useful when you want:

- a browser-friendly, remotely accessible MCP server
- one deployment that combines native utilities and selected third-party integrations
- Anthropic-compatible canonical tool names such as `context7_query_docs` and `tavily_search`
- Cloudflare Workers deployment instead of maintaining a long-running custom server

## Features

Current release: `toolhive-mcp@0.4.0`

Current release capabilities:

<!-- GENERATED:README_TOOLING:start -->
### Generated tool snapshot

Demo endpoint: `https://mcp.awsl.app/mcp`

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
- Run `npm run render:readme` to refresh this block from `src/mcp/tool-manifest.ts`.
<!-- GENERATED:README_TOOLING:end -->

## Endpoints

The server exposes these HTTP endpoints:

- MCP: `https://mcp.awsl.app/mcp`
- Health check: `https://mcp.awsl.app/healthz`
- Readiness check: `https://mcp.awsl.app/readyz`
- Version metadata: `https://mcp.awsl.app/version`

When self-hosting, configure your MCP client to use:

- `https://<your-worker-domain>/mcp`

Additional worker endpoints are also available when self-hosting:

- `https://<your-worker-domain>/healthz`
- `https://<your-worker-domain>/readyz`
- `https://<your-worker-domain>/version`

Only `/mcp` accepts MCP requests in this project; `/healthz`, `/readyz`, and `/version` are standard HTTP endpoints.

## Deploy

Install dependencies and deploy with Wrangler:

```bash
npm install
npm run deploy
```

This project targets Cloudflare Workers and uses the repository's existing `wrangler.jsonc` configuration.

## Secrets

Third-party tools are enabled by Cloudflare secrets. Set only the providers you actually want to expose.

```bash
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put EXA_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
```

Each secret accepts either a single key or a comma-separated list of keys. The server selects from the configured keys at request time.

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
- `GET /version` reports the runtime package metadata, including the current release version from `package.json`

## Disabled domain tools

Domain-related tools are intentionally disabled in this release.

The codebase still contains domain integration code for possible future re-enable, but the released MCP surface does not expose any `domain_*` tools. README examples and feature descriptions should not be read as implying that domain tools are currently available.

## Disabled news tools

News tools are intentionally disabled in this release.

The codebase still contains news integration code for possible future re-enable, but the released MCP surface does not expose any `news_*` tools. README examples and feature descriptions should not be read as implying that news tools are currently available.

## License

This project is released under the 0BSD license. See [`LICENSE`](./LICENSE).

## Acknowledgements

### Open-source references

- Cloudflare Workers and Wrangler for the deployment runtime and development workflow
- The MCP ecosystem patterns that informed the HTTP tool-serving shape of this project
- Upstream service documentation used to align request and response handling

### Community packages

- Tavily for search, extract, crawl, and research APIs
- Context7 for library resolution and documentation querying
- Unsplash for image search
- Pure.md for content extraction
- Vitest and TypeScript for testing and type safety

### With Claude

- Planned, refined, and prepared with Claude-assisted development workflows
- Release-facing documentation rewritten with Claude as an editing and structuring partner
- Final tool-surface notes kept aligned with the current release constraints, including the disabled domain tools
