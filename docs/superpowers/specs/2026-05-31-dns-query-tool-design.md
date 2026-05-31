# DNS 查询 MCP 工具设计文档

- 日期：2026-05-31
- 状态：已确认设计，待进入 implementation plan
- 目标：在现有 Cloudflare Workers Remote HTTP MCP server 中新增 `dns_query` 工具，基于 Google Public DNS JSON API 查询 DNS 记录。工具对常见 RR type 提供命名输入，对其他上游支持的类型提供数字类型码输入，并完成测试、实现、部署与调用实测。

## 1. 背景与目标

用户希望在现有 MCP server 中增加一个查询 DNS 记录的能力，要求如下：

1. 工具名为 `dns_query`。
2. 基于 Google Public DNS JSON API：`https://dns.google/resolve`。
3. 常见 RR type 可直接用名称查询；其他 dns.google 支持的类型可通过 `1..65535` 数字类型码查询。
4. 首版输入保持收敛，只暴露 `name`、`type`、`do`、`cd`。
5. DNS `Status != 0` 是 DNS 协议层结果，不作为 MCP 工具执行失败处理。
6. 输出保留原始 DNS record `data`，并对少数常用记录提供轻量 `parsed` 字段。
7. 按现有仓库流程补测试、实现、生成文档、部署并做本地和远程调用实测。

## 2. 范围

### 2.1 本次实现

- 新增一个默认启用的 external tool：`dns_query`。
- 调用 `https://dns.google/resolve` 执行 GET 查询。
- 支持以下输入：
  - `name`：必填 DNS 查询名。
  - `type`：可选，默认 `A`。
  - `do`：可选 boolean，映射 DNSSEC OK。
  - `cd`：可选 boolean，映射 Checking Disabled。
- 命名支持以下 RR type：`A`、`AAAA`、`CNAME`、`MX`、`TXT`、`NS`、`SOA`、`PTR`、`SRV`、`CAA`、`DS`、`DNSKEY`、`RRSIG`、`NSEC`、`NSEC3`、`SVCB`、`HTTPS`、`ANY`。
- 数字类型码支持 integer 或十进制数字字符串，范围 `1..65535`。
- 规范化 dns.google 响应字段。
- 对 `A`、`AAAA`、`MX`、`TXT`、`CAA` 做保守解析。
- 更新 README 生成区块。
- 增加 handler、manifest、MCP 调用路径相关测试。
- 完成本地 Worker smoke；在 Cloudflare 配置和认证可用时完成部署和远程 smoke。

### 2.2 不做

- 不支持 `edns_client_subnet`。
- 不支持 `random_padding`。
- 不暴露 `ct`，不返回 wire-format DNS message。
- 不支持切换 provider。
- 不支持缓存。
- 不新增 Cloudflare secret 或 env gate。
- 不实现完整 RR type parser。
- 不重构现有 external tools。

## 3. 架构

采用最小集成方案：**manifest 注册 + 单文件工具实现 + 规范化输出**。

### 3.1 工具实现

新增文件：

- `src/tools/external/dns.ts`

职责：

1. 接收 `unknown` 参数并做 handler 级语义校验。
2. 规范化查询参数。
3. 构造 `https://dns.google/resolve` GET URL。
4. 调用 `fetch`。
5. 将 HTTP、JSON、响应结构错误映射为 `upstream_error`。
6. 将本地参数错误映射为 `validation_error`。
7. 将合法 DNS JSON 响应规范化为稳定 payload。
8. 对少数常见记录生成 `parsed` 字段。

首版不新增 `src/lib/dns.ts` 或 provider 抽象层。RR type 映射和轻量 parser 保持在 `dns.ts` 内部，避免为单个工具提前抽象。

### 3.2 Manifest 注册

修改文件：

- `src/mcp/tool-manifest.ts`

使用现有 `externalTool()` 模式注册：

- `legacyName: "dns.query"`
- canonical tool name：`dns_query`
- alias：`dns.query`
- category：`external`
- 不设置 `envRequirement`

`tools/list` 对外暴露 `dns_query`。`dns.query` 作为兼容 alias 可用于 `tools/call`。

### 3.3 README 生成

修改工具 manifest 后运行：

```powershell
npm run render:readme
```

预期只更新由脚本生成的工具清单区块：

- `README.md`
- `README.zh-CN.md`

不手工重写相邻说明。

## 4. 输入设计

### 4.1 Schema

工具输入：

```json
{
  "name": "example.com",
  "type": "A",
  "do": false,
  "cd": false
}
```

字段：

| 字段 | 必填 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | 是 | string | 无 | DNS 查询名。handler 会 trim 并拒绝空字符串。 |
| `type` | 否 | string 或 integer | `A` | RR type 名称、十进制数字字符串或 `1..65535` integer 类型码。 |
| `do` | 否 | boolean | `false` | DNSSEC OK，请求 DNSSEC 相关数据。 |
| `cd` | 否 | boolean | `false` | Checking Disabled，用于 DNSSEC 诊断。 |

Manifest schema 应表达 `type` 支持 string 与 integer，并在 description 中写明命名集合、十进制数字字符串和 `1..65535` 范围。handler 仍做最终语义校验。

### 4.2 `name` 校验

规则：

1. 必须是字符串。
2. handler 使用 trim 后的值作为实际查询名。
3. trim 后不能为空。
4. trim 后长度不超过 253 个字符。
5. payload 的 `query.name` 回显 trim 后的查询名。

不做复杂域名正则。原因是 DNS 查询名可能包含尾点、下划线、反向解析名、服务发现前缀、通配符或 IDN punycode。过严正则容易误伤合法查询。明显非法输入交给 dns.google 返回 DNS 或 HTTP 层结果。

### 4.3 `type` 支持范围

字符串类型名支持：

- 基础：`A`、`AAAA`、`CNAME`、`MX`、`TXT`、`NS`、`SOA`、`PTR`
- 服务与安全：`SRV`、`CAA`、`DS`、`DNSKEY`
- DNSSEC 调试：`RRSIG`、`NSEC`、`NSEC3`
- 现代服务绑定：`SVCB`、`HTTPS`
- 高级：`ANY`

数字类型码支持 integer 或十进制数字字符串，范围 `1..65535`。例如 `65`、`"65"` 和 `"001"` 都合法，分别规范化为类型码 `65`、`65` 和 `1`。这让工具能查询 dns.google 上游支持但首版未命名的 RR type。

`type` 规范化规则：

1. 未传时使用 `A`。
2. 命名字符串会 trim 并统一转为大写。
3. 数字字符串必须是 trim 后匹配 `^[0-9]+$` 的 ASCII 十进制整数。
4. `"001"` 允许并规范化为类型码 `1`。
5. `"+65"`、`"65.0"`、`"1e2"`、`"65 66"`、`""`、负数字符串返回 `validation_error`。
6. number 输入必须是 JavaScript safe integer，且范围为 `1..65535`。
7. 小数、`NaN`、`Infinity`、越界数字返回 `validation_error`。
8. 未知非数字字符串返回 `validation_error`。

成功 payload 的 `query` 同时回显规范化后的类型信息：

```json
{
  "query": {
    "name": "example.com",
    "type": "HTTPS",
    "type_code": 65,
    "do": false,
    "cd": false
  }
}
```

未知数字类型码示例：`type: 65400` 会请求 `type=65400`，payload 回显：

```json
{
  "query": {
    "name": "example.com",
    "type": "TYPE_65400",
    "type_code": 65400,
    "do": false,
    "cd": false
  }
}
```

### 4.4 `do` / `cd` 校验

规则：

1. 未传时默认 `false`。
2. 只有 boolean 可接受。
3. `"true"`、`"false"`、`1`、`0`、`null`、数组、对象等非 boolean 输入返回 `validation_error`。
4. 只在用户显式传 `true` 时附加对应 query 参数。

### 4.5 请求映射

基础请求：

```text
https://dns.google/resolve?name=example.com&type=A
```

带 DNSSEC 参数：

```text
https://dns.google/resolve?name=example.com&type=MX&do=true&cd=true
```

数字类型码请求：

```text
https://dns.google/resolve?name=example.com&type=65
```

## 5. 输出设计

### 5.1 Handler envelope 与 payload

项目现有 handler 返回 `ToolExecutionResult` envelope。`dns_query` 也遵循该模式：

```json
{
  "ok": true,
  "data": {
    "query": {},
    "status": {},
    "answer": []
  }
}
```

本节后续示例均展示 `data` payload，而不是 envelope 本身。MCP `tools/call` 成功时，JSON-RPC 不返回 protocol error，MCP tool result 不设置 `isError`，`content[0].text` 是该 payload 的 JSON 字符串。

当 HTTP 200 且响应是合法 DNS JSON 时，handler 返回 `{ ok: true, data: <payload> }`。

示例 payload：

```json
{
  "query": {
    "name": "example.com",
    "type": "A",
    "type_code": 1,
    "do": false,
    "cd": false
  },
  "status": {
    "code": 0,
    "name": "NOERROR"
  },
  "flags": {
    "truncated": false,
    "recursion_desired": true,
    "recursion_available": true,
    "authenticated_data": false,
    "checking_disabled": false
  },
  "question": [
    {
      "name": "example.com.",
      "type": 1,
      "type_name": "A"
    }
  ],
  "answer": [
    {
      "name": "example.com.",
      "type": 1,
      "type_name": "A",
      "ttl": 300,
      "data": "93.184.216.34",
      "parsed": {
        "address": "93.184.216.34"
      }
    }
  ],
  "authority": [],
  "additional": [],
  "comment": null,
  "provider_used": "dns.google",
  "cached": false,
  "partial": false
}
```

### 5.2 最低合法响应结构

dns.google 响应要被视为合法 DNS JSON，必须满足：

1. 顶层是 JSON object。
2. `Status` 必须是 integer，且 `0..65535` 范围内。
3. `Question`、`Answer`、`Authority`、`Additional` 缺失时按空数组处理。
4. `Question`、`Answer`、`Authority`、`Additional` 如果存在，必须是数组；否则返回 `upstream_error`。
5. `TC`、`RD`、`RA`、`AD`、`CD` 如果缺失，输出对应 flag 为 `false`。
6. `Comment` 如果缺失，输出 `comment: null`。

DNS record 规范化规则：

1. `Question` 中 entry 非 object 或缺少数值型 `type` 时跳过该 entry；`name` 不是字符串时使用空字符串。
2. `Answer`、`Authority`、`Additional` 中 entry 非 object 时跳过该 entry。
3. `Answer`、`Authority`、`Additional` record 至少需要数值型 `type` 和字符串型 `data`；缺少时跳过该 record。
4. `Answer`、`Authority`、`Additional` record 的 `name` 不是字符串时使用空字符串。
5. `TTL` 不是 number 时输出 `ttl: null`。

只有顶层 shape 错误、`Status` 缺失/非 integer/越界、section 存在但非数组时，才视为响应结构异常并返回 `upstream_error`。

### 5.3 字段映射

| dns.google 字段 | 输出字段 |
| --- | --- |
| `Status` | `status.code` |
| `TC` | `flags.truncated` |
| `RD` | `flags.recursion_desired` |
| `RA` | `flags.recursion_available` |
| `AD` | `flags.authenticated_data` |
| `CD` | `flags.checking_disabled` |
| `Question` | `question` |
| `Answer` | `answer` |
| `Authority` | `authority` |
| `Additional` | `additional` |
| `Comment` | `comment` |

### 5.4 DNS RCODE 映射

至少映射常见 RCODE：

| code | name |
| --- | --- |
| 0 | `NOERROR` |
| 1 | `FORMERR` |
| 2 | `SERVFAIL` |
| 3 | `NXDOMAIN` |
| 4 | `NOTIMP` |
| 5 | `REFUSED` |

未知 RCODE 输出 `RCODE_<number>`。

### 5.5 RR type 映射

输出记录按记录自身的 `type` 映射 `type_name`，不能假设所有 Answer 都与请求 type 相同。原因是 CNAME 链和 DNSSEC 响应可能混合多种记录类型。

至少映射：

| code | name |
| --- | --- |
| 1 | `A` |
| 2 | `NS` |
| 5 | `CNAME` |
| 6 | `SOA` |
| 12 | `PTR` |
| 15 | `MX` |
| 16 | `TXT` |
| 28 | `AAAA` |
| 33 | `SRV` |
| 43 | `DS` |
| 46 | `RRSIG` |
| 47 | `NSEC` |
| 48 | `DNSKEY` |
| 50 | `NSEC3` |
| 64 | `SVCB` |
| 65 | `HTTPS` |
| 255 | `ANY` |
| 257 | `CAA` |

未知类型输出 `TYPE_<number>`。

### 5.6 记录结构

每条 `answer`、`authority`、`additional` DNS record 输出：

```json
{
  "name": "example.com.",
  "type": 1,
  "type_name": "A",
  "ttl": 300,
  "data": "93.184.216.34",
  "parsed": {
    "address": "93.184.216.34"
  }
}
```

`parsed` 是可选字段。解析失败或类型不在轻量解析范围内时不输出 `parsed`；不得输出 `parsed: null` 或 `parsed: {}` 表示失败。

### 5.7 轻量解析规则

对 `answer`、`authority`、`additional` 中每条 record 使用同一套 `normalizeRecord` 逻辑。`question` record 不包含 `data`，不加 `parsed`。

只解析以下类型：

| 类型 | 示例 `data` | `parsed` |
| --- | --- | --- |
| `A` | `93.184.216.34` | `{ "address": "93.184.216.34" }` |
| `AAAA` | `2606:2800:220:1:248:1893:25c8:1946` | `{ "address": "2606:2800:220:1:248:1893:25c8:1946" }` |
| `MX` | `10 mail.example.com.` | `{ "preference": 10, "exchange": "mail.example.com." }` |
| `TXT` | `"v=spf1 include:_spf.example.com ~all"` | `{ "text": "v=spf1 include:_spf.example.com ~all", "strings": ["v=spf1 include:_spf.example.com ~all"] }` |
| `CAA` | `0 issue "letsencrypt.org"` | `{ "flags": 0, "tag": "issue", "value": "letsencrypt.org" }` |

解析边界：

1. `A` / `AAAA`：不做严格 IP 校验；只要 `data` 是非空字符串就输出 `address`。
2. `MX`：使用正则读取开头十进制整数 preference 和剩余 exchange，允许多个空格；不匹配则省略 `parsed`。
3. `TXT`：支持一个或多个双引号包裹的 character-string。`strings` 为每个去掉外层引号后的片段；只处理 `\"` 和 `\\` 两种简单转义。`text` 为 `strings.join("")`。例如 `"hello" "world"` 输出 `strings: ["hello", "world"]`、`text: "helloworld"`。如果引号未闭合或没有可识别的引号片段，则 `strings` 为 `[data]`，`text` 为原始 `data`。
4. `CAA`：支持 `flags tag value` 形式。`flags` 必须是 `0..255` 的十进制整数。`value` 可以是双引号包裹的字符串，也可以是不含空白的裸字符串。quoted value 允许空格，只处理 `\"` 和 `\\` 两种简单转义。空 value 或不匹配时省略 `parsed`。
5. 解析失败不返回错误，只省略 `parsed` 并保留原始 `data`。

## 6. 错误处理

### 6.1 工具失败

以下情况返回 `ToolExecutionResult` 失败 envelope：`{ ok: false, error: ... }`。MCP `tools/call` 会把它转换为 `isError: true` 的 tool result。

1. 本地参数非法：`validation_error`
   - `name` 不是 string
   - `name` trim 后为空
   - `name` trim 后长度超过 253
   - 不支持的非数字 `type`
   - 数字类型码不是 safe integer
   - 数字类型码不在 `1..65535`
   - 数字字符串不是 `^[0-9]+$`
   - `do` / `cd` 不是 boolean
2. 上游或传输失败：`upstream_error`
   - fetch 抛错
   - HTTP 非 2xx
   - JSON 解析失败
   - 顶层 JSON 不是 object
   - `Status` 缺失、非 integer 或不在 `0..65535`
   - `Question`、`Answer`、`Authority`、`Additional` 存在但不是数组

HTTP 429 仍归为 `upstream_error`，details 中保留 status 和响应摘要；首版不实现重试。

### 6.2 DNS 层非成功状态

以下情况不返回工具失败：

- `Status = 2 / SERVFAIL`
- `Status = 3 / NXDOMAIN`
- `Status = 5 / REFUSED`
- 其他非 0 DNS RCODE

只要 HTTP 200 且响应是合法 DNS JSON，就返回 `{ ok: true, data: <payload> }`。MCP `tools/call` 外层不应返回 JSON-RPC protocol error，tool result 不应设置 `isError`。DNS 层结果只通过 payload 的 `status.code`、`status.name` 和 `comment` 表达。

这个语义必须在测试中锁定，避免后续维护时把 NXDOMAIN 等合法 DNS 响应改成 `upstream_error`。

## 7. 测试计划

采用 TDD：先写失败测试，再实现。

### 7.1 Handler 单测

修改：

- `tests/tools/external.test.ts`

覆盖：

1. 默认查询
   - 输入 `{ name: " example.com " }`
   - 请求 `https://dns.google/resolve?name=example.com&type=A`
   - handler 返回 `{ ok: true, data: ... }`
   - `data.provider_used === "dns.google"`
   - `data.query.name === "example.com"`
   - `data.query.type === "A"`
   - `data.query.type_code === 1`
2. DNSSEC 参数
   - 输入 `{ name: "example.com", type: "MX", do: true, cd: true }`
   - 请求包含 `type=MX`、`do=true`、`cd=true`
   - `do` / `cd` 传入 `"true"`、`1`、`null`、对象时返回 `validation_error`
3. 数字类型码
   - 输入 `{ name: "example.com", type: 65 }`
   - 请求包含 `type=65`
   - `data.query.type === "HTTPS"`
   - `data.query.type_code === 65`
   - 返回记录 `type: 65` 映射为 `HTTPS`
4. 数字字符串类型码
   - 输入 `{ name: "example.com", type: "65400" }`
   - 请求包含 `type=65400`
   - `data.query.type === "TYPE_65400"`
   - `data.query.type_code === 65400`
   - `"001"` 规范化为 `type_code: 1`
   - `"+65"`、`"65.0"`、`"1e2"`、`"65 66"`、空字符串、负数字符串返回 `validation_error`
   - `65.5`、`NaN`、`Infinity`、`0`、`65536` 返回 `validation_error`
5. 命名常见类型
   - 逐项覆盖 `A`、`AAAA`、`CNAME`、`MX`、`TXT`、`NS`、`SOA`、`PTR`、`SRV`、`CAA`、`DS`、`DNSKEY`、`RRSIG`、`NSEC`、`NSEC3`、`SVCB`、`HTTPS`、`ANY`。
   - 每个输入验证请求 URL 使用规范化后的 type 名称。
   - 每个输入验证 `data.query.type` 与 `data.query.type_code` 回显正确。
   - 至少一个样例覆盖小写和前后空白，例如 `" mx "` 规范化为 `MX`。
6. DNS `Status != 0`
   - mock `Status: 3`
   - handler 返回 `{ ok: true, data: ... }`
   - `data.status.name === "NXDOMAIN"`
7. 轻量解析
   - A/AAAA 解析 `address`
   - MX 解析 `preference` 和 `exchange`
   - TXT 解析单段、多段、escaped quote/backslash；未闭合引号回退为原始 `data`
   - CAA 解析 quoted value、裸 value、quoted value 中的空格；非法 flags 或空 value 时省略 `parsed`
   - 未解析类型保留 `data` 和 `type_name`，并断言 `parsed` 字段不存在
   - 解析失败时断言 `parsed` 字段不存在，而不是 `null` 或 `{}`
8. 合法响应结构边界
   - `Question` / `Answer` / `Authority` / `Additional` 缺失时输出空数组
   - 这些 section 存在但不是数组时返回 `upstream_error`
   - `Question` 中 entry 非 object 或缺少数值型 `type` 时跳过该 entry
   - `Answer`、`Authority`、`Additional` 都使用相同 record normalization
   - `Answer`、`Authority`、`Additional` 中缺少 `type` 或 `data` 的 record 被跳过
   - `TTL` 非 number 时输出 `ttl: null`
   - `Status` 非 integer、负数、越界时返回 `upstream_error`
9. `name` 错误路径
   - 非 string 返回 `validation_error`
   - trim 后空字符串返回 `validation_error`
   - 长度 253 通过
   - 长度 254 返回 `validation_error`
10. 其他错误路径
   - 不支持的 `type` 字符串返回 `validation_error`
   - HTTP 非 2xx 返回 `upstream_error`
   - 非 JSON 返回 `upstream_error`
   - 缺少数值型 `Status` 返回 `upstream_error`

测试全部 mock `fetch`，不依赖真实网络。

### 7.2 Manifest / MCP 层测试

修改：

- `tests/mcp/tool-registry.test.ts`

覆盖：

1. `dns_query` 出现在默认 enabled tools 中。
2. `dns_query` 不需要 env key。
3. `tools/list` 中 input schema 包含 `name`、`type`、`do`、`cd`。
4. `tools/list` 的 `type` schema/description 表达 string 与 integer 输入、命名集合、十进制数字字符串和 `1..65535` 范围。
5. canonical name 是 `dns_query`。
6. alias `dns.query` 可用于 tool lookup / call。
7. 通过 `tools/call` 调用 mock NXDOMAIN 时：
   - JSON-RPC 返回成功 response，不是 protocol error。
   - tool result 不设置 `isError`。
   - `content[0].text` 解析后 `status.name === "NXDOMAIN"`。

如果现有测试已经统一覆盖 README 与 manifest 对齐，则不重复大型断言，只让生成后的 README 参与现有对齐检查。

### 7.3 全量验证命令

实现后运行：

```powershell
npm run render:readme
npm test
npm run typecheck
```

## 8. 本地调用实测

启动本地 Worker：

```powershell
npm run dev
```

执行方式：在独立终端或后台任务中启动 dev server；等待 `/readyz` 返回 200 后再跑 smoke；smoke 完成后停止 dev server，避免留下长驻进程。

HTTP smoke 请求统一带：

```text
content-type: application/json
accept: application/json, text/event-stream
```

如果本地未启用 `MCP_AUTH_KEYS`，`initialize`、`tools/list`、`tools/call` 都可不带认证。如果本地 dev 环境继承了 `MCP_AUTH_KEYS`，则 `initialize` 仍不带认证，`tools/list` 和 `tools/call` 必须带 Bearer、`x-api-key` 或 query `key`；否则 401 不代表 `dns_query` 实现失败。

固定 NXDOMAIN smoke 域名使用：

```text
nonexistent-dns-query-smoke.invalid
```

`.invalid` 是保留 TLD，避免未来被注册导致 smoke 不稳定。

`initialize` JSON-RPC body：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "dns-query-smoke",
      "version": "1"
    }
  }
}
```

`tools/list` JSON-RPC body：

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

`tools/call` A 示例 body：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "dns_query",
    "arguments": {
      "name": "example.com",
      "type": "A"
    }
  }
}
```

`tools/call` MX 示例 body：

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "dns_query",
    "arguments": {
      "name": "example.com",
      "type": "MX"
    }
  }
}
```

`tools/call` NXDOMAIN 示例 body：

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "tools/call",
  "params": {
    "name": "dns_query",
    "arguments": {
      "name": "nonexistent-dns-query-smoke.invalid",
      "type": "A"
    }
  }
}
```

可复制 smoke 步骤应覆盖：

1. `GET http://127.0.0.1:8787/healthz`
2. `GET http://127.0.0.1:8787/readyz`
3. `GET http://127.0.0.1:8787/version`
4. `POST http://127.0.0.1:8787/mcp` 调用 `initialize`
5. `POST http://127.0.0.1:8787/mcp` 调用 `tools/list`，确认存在 `dns_query`
6. `POST http://127.0.0.1:8787/mcp` 调用 `tools/call` 查询 `example.com` 的 `A`
7. `POST http://127.0.0.1:8787/mcp` 调用 `tools/call` 查询 `example.com` 的 `MX`
8. `POST http://127.0.0.1:8787/mcp` 调用 `tools/call` 查询 `nonexistent-dns-query-smoke.invalid` 的 `A`，确认 JSON-RPC 成功、tool result 未设置 `isError`、payload `status.name` 为 `NXDOMAIN`

本项目当前无状态 MCP 路由不要求 smoke 维护 `Mcp-Session-Id`。若未来协议层变为有状态，smoke 脚本应按当时 router 测试 helper 更新。

## 9. 部署与远程实测

### 9.1 强制验收项

实现完成前必须通过：

1. `npm run render:readme`
2. `npm test`
3. `npm run typecheck`
4. 本地 Worker smoke

### 9.2 条件验收项

远程部署和远程 smoke 在以下条件满足时执行：

1. 当前 Cloudflare 登录状态可用于 `npm run deploy`。
2. `wrangler.jsonc` 中 custom domain `mcp.awsl.app` 和 `workers_dev:false` 与当前账号/路由匹配。
3. 如远程启用了 `MCP_AUTH_KEYS`，当前会话可获得有效认证方式。

部署前检查：

- 当前 `wrangler.jsonc` 绑定 custom domain：`mcp.awsl.app`
- `workers_dev:false`
- 运行非破坏性账号检查命令，例如 `npx wrangler whoami` 或仓库当前 Wrangler 版本支持的等价命令。
- 将账号检查输出与目标 Cloudflare 账号/路由匹配情况作为部署门禁。
- 如果当前 Cloudflare 账号、登录状态或 route/domain 不确定，停止并让用户确认，不继续运行 `npm run deploy`。

部署命令：

```powershell
npm run deploy
```

部署后远程 smoke：

1. `GET https://mcp.awsl.app/healthz`
2. `GET https://mcp.awsl.app/readyz`
3. `GET https://mcp.awsl.app/version`
4. `POST https://mcp.awsl.app/mcp` 调用 `initialize`
5. `POST https://mcp.awsl.app/mcp` 调用 `tools/list`，确认存在 `dns_query`
6. `POST https://mcp.awsl.app/mcp` 调用 `tools/call` 查询 `example.com` 的 `A`
7. `POST https://mcp.awsl.app/mcp` 调用 `tools/call` 查询 `example.com` 的 `MX`
8. `POST https://mcp.awsl.app/mcp` 调用 `tools/call` 查询 `nonexistent-dns-query-smoke.invalid` 的 `A`

远程 smoke 使用与本地 smoke 相同的 headers 和 JSON-RPC body，只替换 base URL。

如果远程启用了 `MCP_AUTH_KEYS`，`tools/list` 和 `tools/call` 按现有认证方式带 Bearer、`x-api-key` 或 query `key`；`initialize` 保持公开。若无法获得认证 key，不尝试猜测或绕过，记录为远程 smoke 阻塞。

如果远程部署或远程 smoke 因 Cloudflare 权限、账号/路由不匹配、认证 key 不可得或上游平台故障阻塞，需要在最终交付说明中记录：

- 阻塞步骤
- 失败命令或 HTTP 状态
- 已完成的本地验证证据
- 用户需要提供或确认的下一步
- 远程部署验收状态：阻塞，未通过

这种情况下实现可以完成，但不能把远程部署验收描述为通过。

## 10. 成功标准

实现完成时必须满足：

1. `dns_query` 出现在 MCP `tools/list` 中。
2. 不配置任何新 secret 时，`dns_query` 默认可用。
3. 命名 type 支持集合完整覆盖：`A`、`AAAA`、`CNAME`、`MX`、`TXT`、`NS`、`SOA`、`PTR`、`SRV`、`CAA`、`DS`、`DNSKEY`、`RRSIG`、`NSEC`、`NSEC3`、`SVCB`、`HTTPS`、`ANY`。
4. 其他上游支持类型可通过 `1..65535` 数字类型码查询。
5. HTTP 200 + DNS `Status != 0` 返回 MCP 工具成功结果，并在 payload 中表达 RCODE。
6. A、AAAA、MX、TXT、CAA 记录有轻量 `parsed` 字段。
7. 其他记录类型至少保留 `data` 和 `type_name`。
8. README 英文和中文生成区块已更新。
9. `npm test` 通过。
10. `npm run typecheck` 通过。
11. 本地 Worker 调用实测通过。
12. 如 Cloudflare 环境可用，部署到 `mcp.awsl.app` 后远程调用实测通过；如部署配置/认证阻塞，最终交付说明明确记录阻塞原因和下一步，并标记远程部署验收未通过。
