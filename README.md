# Cloudflare Workers Multi-MCP Server

Remote HTTP MCP server for Cloudflare Workers.

## Endpoint

Deploy the Worker and configure your MCP client with:

    https://<worker-domain>/mcp

Only `/mcp` is supported. Other paths return `404`.

## Scope

Implemented first-release tools:

- Native: `weather`, `webfetch`, `calc`, `time`, `ip`
- Tavily HTTP API: `tavily.search`, `tavily.extract`
- Context7: `context7.resolve-library-id`, `context7.query-docs`
- Unsplash: `unsplash.search_photos`
- Pure.md: `puremd.extract`
- Devutils subset: `devutils.*`

Roadmap, not implemented in first release:

- `news.*` from newsmcp
- `domain.*` from agent-domain-service-mcp

## Environment variables

Use Cloudflare secrets for API keys:

    npx wrangler secret put TAVILY_API_KEYS
    npx wrangler secret put CONTEXT7_API_KEYS
    npx wrangler secret put UNSPLASH_ACCESS_KEYS
    npx wrangler secret put PUREMD_API_KEYS

Each value accepts one key or comma-separated keys. A random key is selected per request.

## Development

    npm install
    npm test
    npm run typecheck
    npm run dev

## Deploy

    npm run deploy
