# Cloudflare Workers 多合一 Remote HTTP MCP Server 设计文档

- 日期：2026-04-11
- 状态：已确认设计，待进入 implementation plan
- 目标：构建一个部署在 Cloudflare Workers 上的单端点远程 HTTP MCP server，在无状态、无存储、全云端、客户端无需认证的前提下，向 LLM 暴露一组稳定、完整、可直接调用的 tools。

## 1. 背景与目标

用户希望构建一个“多合一”远程 MCP server，要求如下：

1. 单个远程 MCP 地址即可安装使用。
2. 服务端运行在 Cloudflare Workers 上。
3. 无状态、无存储、全云端运行。
4. 客户端无需认证。
5. `/mcp` 为唯一业务路径，其他路径返回 404。
6. 首版只实现 tools，不实现 resources/prompts。
7. 采用现代 MCP Streamable HTTP / JSON-RPC，不兼容旧 HTTP+SSE。
8. 外部服务 API key 存在 Worker 环境变量中，可逗号分隔多个 key；每次请求随机抽取一个。
9. 未配置某类 key 时，不暴露该类工具。
10. 原生工具使用短名；外部服务工具使用命名空间前缀。
11. Tavily 直接封装 HTTP API，不走 Tavily 远程 MCP。
12. `newsmcp` 与 `agent-domain-service-mcp` 写入 roadmap，但首期不实现。
13. `webfetch` 必须同时支持 GET 与 POST。

## 2. 可行性结论

### 2.1 明确可行

以下能力可在 Cloudflare Workers 中实现：

- 单 Worker 暴露 `/mcp` 作为唯一 MCP endpoint。
- 使用现代 Streamable HTTP / JSON-RPC 实现 `initialize`、`tools/list`、`tools/call`。
- 采用无状态、无 session 的 JSON response 模式。
- 静态声明工具 schema，并在 `tools/list` 时按环境变量动态过滤。
- 从 Worker env / secrets 读取外部 API key。
- 逗号分隔多 key 并随机轮换。
- 基于 wttr 的天气工具。
- 支持 GET/POST 的代理式 webfetch。
- 安全白名单数学表达式求值。
- UTC / 指定时区时间工具。
- 基于 `Request` / `request.cf` 的连接信息工具。
- 基于 HTTP API 的 Tavily / Unsplash / Pure.md 封装。
- Context7 的 `resolve-library-id` 与 `query-docs` 能力封装。
- 吸收 devutils 类无状态小工具。

### 2.2 有条件可行

- Context7 远程 MCP 直接透传：可行，但首版不推荐动态聚合。
- Tavily 远程 MCP 直接代理：可行，但首版更推荐直接封装 HTTP API。
- 客户端 IP：Cloudflare 元信息明确可读，但稳定 IP 获取需优先依赖 Cloudflare 转发头，缺失时允许返回 `null`。

### 2.3 不建议

- 首版动态聚合多个远程 MCP 的 `tools/list`。
- 首版兼容旧 HTTP+SSE 传输。
- 首版实现 SSE streaming、session resumability、message replay。
- 首版引入持久缓存、数据库、KV、Durable Objects。
- 首版引入重浏览器渲染、复杂并发调度、配额感知轮换。

## 3. 总体架构

采用方案 A：**静态聚合 MCP + 原生工具优先 + 少量上游 HTTP/MCP 语义适配**。

### 3.1 顶层结构

服务由以下 5 层组成：

1. **协议层**
   - 处理 `/mcp`
   - 实现 JSON-RPC / MCP 方法分发
   - 负责 `initialize`、`tools/list`、`tools/call`
   - 返回标准错误与 MCP tool result

2. **工具注册层**
   - 维护全部工具 schema
   - 根据 env 判定某模块是否启用
   - 生成最终 `tools/list`

3. **工具执行层**
   - 根据 tool name 分发到具体 handler
   - 统一参数校验、错误包装、结果格式化

4. **服务适配层**
   - 封装 wttr / Tavily / Context7 / Unsplash / Pure.md 等调用
   - 封装 key 轮换、headers 注入、错误映射

5. **通用基础层**
   - env 读取
   - key 解析与轮换
   - fetch 包装
   - 数学表达式解析
   - 时间格式化
   - 输入校验与错误类型定义

### 3.2 路由与传输

- 唯一业务路径：`/mcp`
- `POST /mcp`：正常处理 MCP 请求
- `GET /mcp`：返回 405
- `DELETE /mcp`：返回 405
- 其他路径：返回 404

首版不实现：
- SSE 流
- 服务端主动通知
- Session ID
- 删除 session
- 旧版 HTTP+SSE 兼容

### 3.3 会话策略

采用**完全无状态**设计：

- 不生成 `Mcp-Session-Id`
- 不保存客户端状态
- 每个请求独立处理
- 所有结果均在单次 HTTP 响应内返回

## 4. MCP 协议行为

### 4.1 支持的方法

- `initialize`
- `notifications/initialized`
- `tools/list`
- `tools/call`

### 4.2 不支持的方法

- `resources/list`
- `resources/read`
- `prompts/list`
- `prompts/get`
- `sampling`
- `roots`
- 其他未实现 MCP 方法

未支持方法统一返回 JSON-RPC `Method not found`。

### 4.3 `initialize` 返回

首版 capabilities 只声明 `tools`：

- `serverInfo.name = "cloudflare-multi-mcp"`
- `serverInfo.version = "0.1.0"`
- `capabilities.tools = {}`

### 4.4 `tools/list` 行为

- 返回静态声明的工具 schema 集合
- 根据环境变量动态过滤外部服务工具
- 未配置 key 的模块不暴露

### 4.5 `tools/call` 行为

统一执行流程：

1. 验证工具存在且启用
2. 校验输入 schema
3. 执行 handler
4. 将成功或失败结果格式化为 MCP tool result

## 5. 工具命名规则

### 5.1 原生核心工具

使用短名：

- `weather`
- `webfetch`
- `calc`
- `time`
- `ip`

### 5.2 外部服务与扩展工具

统一使用命名空间前缀：

- `context7.resolve-library-id`
- `context7.query-docs`
- `tavily.search`
- `tavily.extract`
- `unsplash.search_photos`
- `puremd.extract`
- `devutils.*`
- 未来预留：`news.*`、`domain.*`

## 6. 首期工具清单

### 6.1 原生核心工具

#### `weather`
基于 wttr 查询天气。

建议输入：
- `query: string`
- `format?: "text" | "json"`，默认 `json`
- `lang?: string`
- `units?: "metric" | "us" | "uk"`

建议输出：
- 结构化天气 JSON 文本，或稳定文本天气信息。

#### `webfetch`
代理抓取网页或 HTTP 接口。

建议输入：
- `url: string`
- `method?: "GET" | "POST"`，默认 `GET`
- `requestheaders?: Record<string, string>`
- `body?: string`
- `return_responseheaders?: boolean`，默认 `false`

规则：
- 默认注入 Chrome User-Agent
- 若用户传入 `User-Agent`，允许覆盖
- 仅允许 `http/https`
- 仅返回纯文本 body，不做 JS 渲染与正文提取

建议输出：
- `url`
- `status`
- `ok`
- `body`
- `responseheaders`（按需）

#### `calc`
安全白名单数学表达式求值。

建议输入：
- `expression: string`

支持：
- 四则运算
- 括号
- `sqrt` / `pow`
- `sin` / `cos` / `tan`
- `asin` / `acos` / `atan`
- `pi` / `e`
- 幂运算

明确不允许：
- 任意 JS 执行
- `eval`
- 非白名单函数

#### `time`
返回指定时区的时间。

建议输入：
- `timezone?: string`，默认 `UTC`

建议输出：
- `date`
- `time_24h`
- `datetime`
- `unix`
- `timezone`

#### `ip`
返回请求连接信息。

建议输入：
- 无

建议输出：
- `ip`（若可稳定获得）
- `method`
- `url`
- 裁剪后的请求头
- Cloudflare 元信息，如：
  - `country`
  - `city`
  - `region`
  - `timezone`
  - `asn`
  - `asOrganization`
  - `colo`
  - `httpProtocol`
  - `tlsVersion`

### 6.2 外部服务工具

#### `context7.resolve-library-id`
输入：
- `query: string`
- `libraryName?: string`

输出：
- 匹配到的库候选与 Context7 library ID。

#### `context7.query-docs`
输入：
- `libraryId: string`
- `query: string`

输出：
- 文档片段或查询结果文本。

#### `tavily.search`
直接封装 Tavily HTTP Search API。

建议输入：
- `query: string`
- `search_depth?: "basic" | "advanced" | "fast" | "ultra-fast"`
- `topic?: "general" | "news" | "finance"`
- `max_results?: number`
- `include_answer?: boolean | "basic" | "advanced"`
- `include_raw_content?: boolean | "markdown" | "text"`
- `include_domains?: string[]`
- `exclude_domains?: string[]`

建议输出：
- `query`
- `answer`（如有）
- `results[]`
- `response_time`
- `usage`（按需）

#### `tavily.extract`
直接封装 Tavily HTTP Extract API。

建议输入：
- `urls: string | string[]`
- `query?: string`
- `extract_depth?: "basic" | "advanced"`
- `format?: "markdown" | "text"`
- `include_images?: boolean`
- `include_favicon?: boolean`

建议输出：
- `results`
- `failed_results`
- `response_time`
- `usage`（按需）

#### `unsplash.search_photos`
封装 Unsplash 搜索照片能力。

建议输入：
- `query: string`
- `page?: number`
- `per_page?: number`
- `orientation?: "landscape" | "portrait" | "squarish"`
- `color?: string`
- `order_by?: string`

建议输出（每条结果至少保留）：
- `id`
- `width`
- `height`
- `description`
- `alt_description`
- `author_name`
- `author_profile`
- `image_small`
- `image_regular`
- `image_full`
- `html_url`
- `color`

#### `puremd.extract`
封装 Pure.md 内容提取能力。

建议输入：
- `url: string`
- `format?: "markdown" | "text"`
- `requestheaders?: Record<string, string>`
- `prompt?: string`
- `schema?: string`

建议输出：
- `url`
- `content`
- `format`
- `metadata`（若有）
- `structured_result`（若使用 prompt/schema）

### 6.3 DevUtils 子集

首期建议纳入：

- `devutils.base64_encode`
- `devutils.base64_decode`
- `devutils.hash`
- `devutils.uuid`
- `devutils.jwt_decode`
- `devutils.json_format`
- `devutils.json_validate`
- `devutils.regex_test`
- `devutils.url_parse`
- `devutils.timestamp_convert`
- `devutils.ip_validate`
- `devutils.cidr_calculate`
- `devutils.text_stats`
- `devutils.slugify`
- `devutils.case_convert`

首期暂缓：
- bcrypt
- cron
- diff
- markdown/html 转换
- csv/json 转换
- password generator

## 7. 工具暴露规则

### 7.1 永远暴露

- 原生工具
- 不依赖外部 key 的 devutils 子集

### 7.2 有 key 才暴露

- `context7.*`
- `tavily.*`
- `unsplash.*`
- `puremd.*`

### 7.3 首期不暴露

- `news.*`
- `domain.*`

## 8. 环境变量与 key 轮换

### 8.1 环境变量命名

- `CONTEXT7_API_KEYS`
- `TAVILY_API_KEYS`
- `UNSPLASH_ACCESS_KEYS`
- `PUREMD_API_KEYS`

### 8.2 解析规则

- 按逗号分隔
- trim 空白
- 过滤空字符串
- 得到 key 数组

### 8.3 选取规则

- 0 个 key：模块视为未启用
- 1 个 key：直接使用
- 多个 key：每次请求随机抽取 1 个

### 8.4 首期不做

- 自动重试换 key
- 按配额或成功率智能轮换
- 熔断
- 持久化健康状态

## 9. 数据流与执行约定

所有 `tools/call` 统一遵循：

1. 协议层收到调用请求
2. 注册表校验工具存在且启用
3. 按 schema 校验入参
4. 进入具体 handler
5. 若需要上游服务，则：
   - 读取 env
   - 选取 key
   - 组装请求
   - 调用上游 API
   - 裁剪响应
6. 将结果转换成统一内部结果对象
7. 最终格式化为 MCP tool result

### 9.1 单次调用约束

首期建议：
- 每个工具调用最多只发 1 个上游请求
- 唯一例外是上游接口本身支持 URL 数组输入（如 `tavily.extract`）

目的是降低免费 Worker 的子请求与时延压力。

## 10. 错误处理

统一错误类型：

- `validation_error`
- `upstream_error`
- `config_error`
- `internal_error`

### 10.1 工具错误文本格式

工具内部统一返回结构化错误对象：

```json
{
  "error": {
    "type": "upstream_error",
    "message": "Tavily API returned 429 Too Many Requests",
    "status": 429
  }
}
```

最终包装为 MCP tool error：

- `content[0].type = "text"`
- `content[0].text = JSON 文本`
- `isError = true`

### 10.2 JSON-RPC 错误

以下情况返回标准 JSON-RPC error：
- 非法 JSON
- 缺少 `jsonrpc`
- 缺少 `method`
- 未知方法
- 非法 request 结构

## 11. 成功结果格式

内部统一先返回：

```ts
{ ok: true, data: unknown }
```

最终由统一 formatter 转为 MCP tool result：
- 文本内容统一放在 `content[].text`
- JSON 结果使用 pretty JSON 文本

这样可以保证客户端兼容性与实现一致性。

## 12. 目录结构建议

建议实现目录结构：

- `src/worker.ts`：Worker 入口
- `src/mcp/protocol.ts`：MCP 协议处理
- `src/mcp/router.ts`：JSON-RPC 方法分发
- `src/mcp/tools-registry.ts`：工具注册与过滤
- `src/mcp/result.ts`：统一结果包装
- `src/tools/native/`
- `src/tools/tavily/`
- `src/tools/context7/`
- `src/tools/unsplash/`
- `src/tools/puremd/`
- `src/tools/devutils/`
- `src/lib/env.ts`
- `src/lib/keys.ts`
- `src/lib/fetch.ts`
- `src/lib/errors.ts`
- `src/lib/math/`
- `src/lib/time/`

## 13. Phase 划分

### Phase 0：项目脚手架与 MCP 协议壳

范围：
- 初始化 Cloudflare Workers TypeScript 项目
- 配置 wrangler
- 建立 `/mcp` 单入口
- 其他路径返回 404
- 实现 JSON-RPC 基础处理
- 实现 `initialize` / `notifications/initialized` / `tools/list` / `tools/call`
- 实现统一错误格式与工具注册表

完成标准：
- Claude / Claude Code 可识别为 remote HTTP MCP
- 能列出最小工具列表
- 能调用一个测试工具成功返回

### Phase 1：原生核心工具

范围：
- `weather`
- `webfetch`
- `calc`
- `time`
- `ip`

完成标准：
- 原生 5 工具完成并通过本地验证

### Phase 2：外部服务接入与 key 轮换

范围：
- `tavily.search`
- `tavily.extract`
- `context7.resolve-library-id`
- `context7.query-docs`
- `unsplash.search_photos`
- `puremd.extract`
- key 轮换与工具隐藏逻辑

完成标准：
- 缺 key 不暴露，有 key 可调用
- 至少跑通每类服务 1 条 golden path

### Phase 3：DevUtils 子集

范围：
- 首期选定的 devutils 子集工具

完成标准：
- 工具无状态、轻依赖、Worker 友好

### Phase 4：集成验证与部署文档

范围：
- `wrangler dev` 验证
- Cloudflare 部署验证
- Claude / Claude Code 真实接入验证
- key 配置说明
- 路由 / 工具 / 错误处理回归验证

完成标准：
- 单个远程 MCP 地址可安装并使用

## 14. Roadmap（写入计划但首期不实现）

### 14.1 `news.*`

来源：newsmcp。

计划工具：
- `news.get_news`
- `news.get_news_detail`
- `news.get_topics`
- `news.get_regions`

策略：
- 未来通过其公开 REST API 封装
- 不复刻新闻聚合后端
- 首期不实现、不暴露

### 14.2 `domain.*`

来源：agent-domain-service-mcp。

计划工具：
- `domain.check_domain`
- `domain.explore_name`
- `domain.search_domains`
- `domain.list_categories`

策略：
- 未来通过 AgentDomainService HTTP API 封装
- 首期不实现、不暴露

## 15. 测试与验收标准

### 15.1 协议层

必须验证：
- `POST /mcp` 正常
- `GET /mcp` 返回 405
- `DELETE /mcp` 返回 405
- 其他路径返回 404
- `initialize` 正常
- `notifications/initialized` 返回 202
- `tools/list` 正常
- `tools/call` 正常
- 未知方法返回 JSON-RPC `Method not found`

### 15.2 原生工具

#### `weather`
- 普通城市查询成功
- 特殊格式地点查询成功
- text / json 两种模式验证
- 错误 query 有可读错误

#### `webfetch`
- GET 文本页面成功
- POST 回显接口成功
- 自定义 header 生效
- `return_responseheaders=true` 返回响应头
- 非法 URL 报错
- 非 http/https scheme 报错

#### `calc`
- 四则运算成功
- `sqrt/pi/sin` 成功
- 非法表达式报错
- 数学域错误报错

#### `time`
- 默认 UTC 正常
- 指定时区正常
- 非法 timezone 报错

#### `ip`
- 返回 `request.cf` 可用字段
- 缺少某字段不崩溃
- IP 允许在某些环境下为 `null`

### 15.3 外部服务工具

每类服务都要验证：
- 无 env：工具不出现在 `tools/list`
- 单 key：工具可用
- 多 key：可解析且随机选取

并分别验证 golden path 与错误分支。

### 15.4 DevUtils 子集

每个工具至少覆盖：
- 正常输入
- 边界输入
- 非法输入

### 15.5 部署验收

部署到 Cloudflare 后，必须验证：
- `/mcp` 可访问
- 其余路径 404
- 动态工具隐藏正确
- Claude / Claude Code 可接入并至少调用：
  - 1 个原生工具
  - 1 个带 key 外部工具
  - 1 个 devutils 工具

## 16. 非目标

首期明确不做：

- resources
- prompts
- sampling
- roots
- 动态远程 MCP tools 聚合
- 旧 HTTP+SSE 兼容
- 服务端 session / SSE streaming
- 持久缓存
- 用户认证体系
- `news.*` / `domain.*` 实现

## 17. 结论

该项目首期将作为一个**单 Worker、单端点、无状态、静态工具目录、动态按 env 暴露模块**的远程 HTTP MCP server 实现。

其核心目标不是做一个“万能动态网关”，而是做一个**在 Cloudflare Workers 约束下稳定、清晰、可部署、可直接给 Claude 使用的多合一远程 MCP 工具集**。

首期优先完成 MCP 协议壳、原生核心工具、Tavily/Context7/Unsplash/Pure.md 接入与 devutils 子集；`newsmcp` 与 `agent-domain-service-mcp` 进入 roadmap，但不纳入首期实现。