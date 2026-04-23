[English](./README.md)

# Toolhive MCP

Toolhive MCP 是一个部署在 Cloudflare Workers 上的远程 HTTP MCP 服务。它把一组常用工具统一暴露到同一个 `/mcp` 入口，适合直接给 Claude 兼容客户端接入，不需要再维护本地 stdio 进程。

## 这是什么

如果你希望：

- 用一个远程 MCP 地址服务多个客户端
- 直接走 Cloudflare Workers 部署，降低运维负担
- 使用 Anthropic 兼容的工具命名，例如 `context7_query_docs`、`tavily_search`
- 让 README 中的工具说明和真实实现保持一致

那么这个项目就是一个可以直接拿来用的方案。

## 在线 demo

可直接复制的 demo 地址：

`https://mcp.awsl.app/mcp?key=elysia`

公开辅助端点：

- Health：`https://mcp.awsl.app/healthz`
- Ready：`https://mcp.awsl.app/readyz`
- Version：`https://mcp.awsl.app/version`

## 快速接入客户端

下面的示例都使用同一个在线 demo：

`https://mcp.awsl.app/mcp?key=elysia`

### Claude

在 Claude 中新增远程 MCP 服务，填写：

- URL：`https://mcp.awsl.app/mcp?key=elysia`
- Transport：Streamable HTTP / HTTP MCP

如果你的 Claude 版本更适合单独配置 Header，也可以把地址写成 `https://mcp.awsl.app/mcp`，然后按下文的鉴权方式传认证信息。

### Cursor

在 Cursor 的 MCP 配置中加入：

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

在 Cline 的 MCP 服务配置中加入：

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

在 Cherry Studio 中新增一个自定义 MCP 服务：

- 名称：`toolhive-mcp`
- 类型：Remote / HTTP MCP
- URL：`https://mcp.awsl.app/mcp?key=elysia`

### Codex

对于支持远程 MCP 配置的 Codex 客户端，可使用：

```json
{
  "mcp_servers": {
    "toolhive-mcp": {
      "url": "https://mcp.awsl.app/mcp?key=elysia"
    }
  }
}
```

## 当前支持的鉴权方式

当前实现与文档一致，支持以下三种方式：

- Bearer
- x-api-key / API key
- query `key`

示例：

```http
Authorization: Bearer elysia
```

```http
x-api-key: elysia
```

```text
https://mcp.awsl.app/mcp?key=elysia
```

当前版本仅支持 Bearer、x-api-key / API key 和 query `key` 这三种鉴权方式。

## 自部署说明

如果你要自己部署，客户端地址改为：

- MCP：`https://<your-worker-domain>/mcp`
- Health：`https://<your-worker-domain>/healthz`
- Ready：`https://<your-worker-domain>/readyz`
- Version：`https://<your-worker-domain>/version`

### 一键部署到 Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DoingDog/toolhive-mcp)

仓库地址：`https://github.com/DoingDog/toolhive-mcp`

手动部署：

```bash
npm install
npm run deploy
```

项目沿用仓库中的 `wrangler.jsonc` 配置。

### 可选第三方 Secret

只配置你准备开放的那部分能力即可：

```bash
npx wrangler secret put MCP_AUTH_KEYS
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put EXA_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
npx wrangler secret put PAPER_SEARCH_MCP_UNPAYWALL_EMAILS
```

补充说明：

- `MCP_AUTH_KEYS` 只有在配置后才会对 `/mcp` 中受保护的方法启用鉴权检查。
- `MCP_AUTH_KEYS` 支持单个 key 或逗号分隔的多个 key；合法字符为字母、数字、`_`、`-`。
- `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` 用于 Unpaywall 访问以及 `paper_get_open_access` 工具。
- `PAPER_SEARCH_MCP_UNPAYWALL_EMAILS` 支持单个 email 或逗号分隔的多个 email。
- 其他 provider key secret 也支持单个 key 或逗号分隔的多个 key。

## 工具清单

下面的区块由 manifest 自动生成，更新后请运行 `npm run render:readme`。

<!-- GENERATED:README_TOOLING:start -->
### 自动生成的工具快照

演示地址：`https://mcp.awsl.app/mcp?key=elysia`

支持的认证方式：

- Bearer
- x-api-key / API key
- query `key`

基于 manifest 的工具列表：

- 原生工具：`weather`, `time`, `whoami`, `webfetch`, `calc`
- Paper 工具：`paper_search`, `paper_get_details`, `paper_get_related`
- 需环境变量的 Paper 工具：`paper_get_open_access`
- 外部工具：`iplookup`
- 需环境变量的外部工具：`exa_search`, `tavily_search`, `tavily_extract`, `tavily_crawl`, `context7_resolve_library_id`, `context7_query_docs`, `puremd_extract`, `unsplash_search_photos`
- 开发者工具：`devutils_base64_encode`, `devutils_base64_decode`, `devutils_hash`, `devutils_uuid`, `devutils_jwt_decode`, `devutils_json_format`, `devutils_json_validate`, `devutils_regex_test`, `devutils_url_parse`, `devutils_timestamp_convert`, `devutils_ip_validate`, `devutils_cidr_calculate`, `devutils_text_stats`, `devutils_slugify`, `devutils_case_convert`
- 运行 `npm run render:readme` 可根据 `src/mcp/tool-manifest.ts` 刷新此区块。
<!-- GENERATED:README_TOOLING:end -->

## 开发说明

本地开发流程：

```bash
npm install
npm test
npm run typecheck
npm run dev
```

补充说明：

- `npm run dev` 会通过 Wrangler 启动本地 Worker
- `npm test` 运行 Vitest 测试
- `npm run typecheck` 执行 TypeScript 类型检查，不产出构建文件
- `GET /version` 会返回 `package.json` 中的运行时版本信息

## 当前版本说明

### 已禁用的 domain 工具

当前 release 明确不暴露任何 `domain_*` 工具。

仓库中仍然保留了相关集成代码，但当前对外可用能力里不包含它们。

### 已禁用的 news 工具

当前 release 明确不暴露任何 `news_*` 工具。

仓库中仍然保留了相关集成代码，但当前对外可用能力里不包含它们。

## 许可证

本项目采用 0BSD 许可证发布。详见 [`LICENSE`](./LICENSE)。
