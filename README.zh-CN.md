# Toolhive MCP

Toolhive MCP 是一个部署在 Cloudflare Workers 上的远程 HTTP MCP 服务。它把一组实用的 MCP 工具收敛到同一个 `/mcp` 端点下，工具命名遵循 Anthropic 兼容的 canonical naming，适合直接作为可托管的 MCP endpoint 使用。

演示地址：`https://mcp.awsl.app/mcp`

## 为什么做这个项目

如果你希望：

- 用远程 HTTP 方式提供 MCP，而不是本地 stdio 服务
- 在一个服务里整合原生工具和部分第三方工具
- 使用 Anthropic 兼容的工具命名，例如 `context7_query-docs`、`tavily_search`
- 直接复用 Cloudflare Workers 的部署模型

那么这个项目就是一个比较直接的起点。

## 功能特性

当前版本实际可用的能力包括：

<!-- GENERATED:README_TOOLING:start -->
### 自动生成的工具快照

演示地址：`https://mcp.awsl.app/mcp`

支持的认证方式：

- Bearer
- API key
- OAuth

基于 manifest 的工具列表：

- 原生工具：`weather`, `time`, `whoami`, `webfetch`, `calc`
- Paper 工具：`paper_search`, `paper_get_details`, `paper_get_related`
- 需环境变量的 Paper 工具：`paper_get_open_access`
- 外部工具：`iplookup`
- 需环境变量的外部工具：`exa_search`, `tavily_search`, `tavily_extract`, `tavily_crawl`, `context7_resolve_library_id`, `context7_query_docs`, `puremd_extract`, `unsplash_search_photos`
- 开发者工具：`devutils_base64_encode`, `devutils_base64_decode`, `devutils_hash`, `devutils_uuid`, `devutils_jwt_decode`, `devutils_json_format`, `devutils_json_validate`, `devutils_regex_test`, `devutils_url_parse`, `devutils_timestamp_convert`, `devutils_ip_validate`, `devutils_cidr_calculate`, `devutils_text_stats`, `devutils_slugify`, `devutils_case_convert`
- 运行 `npm run render:readme` 可根据 `src/mcp/tool-manifest.ts` 刷新此区块。
<!-- GENERATED:README_TOOLING:end -->

## Endpoint

当前正式 demo 地址：

- `https://mcp.awsl.app/mcp`

如果你自行部署，MCP 客户端应配置为：

- `https://<your-worker-domain>/mcp`

本项目只支持 `/mcp` 这个 MCP 路径。

## 部署

先安装依赖，再通过 Wrangler 部署：

```bash
npm install
npm run deploy
```

项目沿用仓库中现有的 `wrangler.jsonc` 配置，不需要为了本次发布去改动 Worker 配置本身。

## Secrets

第三方工具是否可用，取决于你是否在 Cloudflare 上配置了对应 secrets。只配置你准备公开提供的那部分即可。

```bash
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put EXA_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
```

每个 secret 可以是一条 key，也可以是逗号分隔的多条 key；服务会在请求时进行选择。

## 开发

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

## 已禁用的 domain 工具说明

当前 release 明确不暴露任何 `domain_*` 工具。

仓库里仍然保留了相关 domain 集成代码，主要是为了后续可能重新启用时减少重复工作；但在这次对外发布里，它们不属于可用能力。也就是说，阅读 README 时不应推断 domain 工具已经开放。

## 许可证

本项目采用 0BSD 许可证发布。详见 [`LICENSE`](./LICENSE)。

## 致谢

### 开源参考

- Cloudflare Workers 与 Wrangler，提供了部署运行时和本地开发基础
- MCP 生态中的通用设计模式，为本项目的 HTTP MCP 形态提供了参考
- 各上游服务的公开文档，帮助校准接口行为与参数形式

### 社区包与服务

- Tavily，提供搜索、抽取、抓取与 research 能力
- Context7，提供库解析与文档查询能力
- Unsplash，提供图片搜索能力
- Pure.md，提供网页内容抽取能力
- Vitest 与 TypeScript，支撑测试与类型安全

### 与 Claude 一起完成

- 项目规划、发布整理与文档重写过程中使用了 Claude 辅助协作
- 英文与中文 README 的结构和表述经过 Claude 协助打磨
- 对外说明中特别校准了当前 release 的真实边界，包括 domain 工具仍处于禁用状态
