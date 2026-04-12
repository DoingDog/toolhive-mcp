# Toolhive MCP Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the current project for a clean open-source GitHub release as **Toolhive MCP**, verify publication safety, rewrite docs, add 0BSD licensing, commit the completed work, create a new private GitHub repository, and push it.

**Architecture:** This release is a packaging and publication batch, not a feature batch. The work is split into four bounded concerns: publication safety audit, project identity rename, release documentation/licensing, and Git/GitHub publication. Existing code behavior should remain unchanged except for metadata and docs. Sensitive and local-only artifacts must be verified out of both the upload set and Git history before any push.

**Tech Stack:** TypeScript, Cloudflare Workers, Wrangler, Vitest, Git, GitHub CLI/OAuth.

---

## File map

### Existing files to modify
- Modify: `package.json` — rename package identity from `cloudflare-workers-multi-mcp` to Toolhive MCP-facing metadata
- Modify: `README.md` — replace with human-friendly English release README
- Modify: `.gitignore` — tighten if publication safety audit reveals missing ignore rules
- Modify: `wrangler.jsonc` — only if release-facing displayed name must be aligned there

### Existing files to inspect but not necessarily modify
- Inspect: `src/mcp/tool-registry.ts` — confirm canonical tool names and disabled domain tools are described accurately in docs
- Inspect: `src/mcp/router.ts` — confirm release docs reflect actual routing behavior
- Inspect: `.git/` history via git commands — verify no sensitive history

### New files to create
- Create: `README.zh-CN.md` — Chinese release README
- Create: `LICENSE` — 0BSD license text
- Create: `docs/superpowers/specs/2026-04-12-toolhive-mcp-release-design.md` — already written spec, keep unchanged unless review requires updates

### Commands to use during implementation
- `git status --short`
- `git ls-files`
- `git log --stat -- .dev.vars .env .claude .omc`
- `git log -S "token" -S "secret" -S "api_key" --all --oneline`
- `npx vitest run`
- `npm run typecheck`
- `git add ... && git commit -m "..."`
- `gh repo create ... --private`
- `git push -u origin main`

---

### Task 1: Audit publication safety in current working tree

**Files:**
- Inspect: `.gitignore`
- Inspect: tracked file list via `git ls-files`
- Inspect: working tree via `git status --short`

- [ ] **Step 1: Check the current working tree state**

Run:
```bash
git status --short
```

Expected:
- Shows the current modified tracked files from completed feature work
- May show `.claude/` and `.omc/` as untracked; these must not be committed

- [ ] **Step 2: Check the tracked file set for sensitive/local-only paths**

Run:
```bash
git ls-files
```

Expected:
- Output must not include `.dev.vars`, `.env`, `.env.*`, `.claude/`, `.omc/`, `.wrangler/`

- [ ] **Step 3: Check ignore coverage for local-only files**

Review:
```gitignore
.worktrees/
node_modules/
dist/
coverage/
.dev.vars
.dev.vars.*
.env
.env.*
.wrangler/
.superpowers/
.omc/research/
```

Action:
- If the audit shows `.claude/` or `.omc/` are not fully ignored, extend `.gitignore` minimally to ignore them
- Do not add broad unrelated ignore rules

- [ ] **Step 4: Verify the working tree audit passes**

Run:
```bash
git status --short && git ls-files | grep -E '^(\.dev\.vars|\.env|\.claude/|\.omc/|\.wrangler/)'
```

Expected:
- `git status --short` may still show legitimate tracked edits
- The grep command should print nothing for tracked sensitive/local-only files

- [ ] **Step 5: Commit ignore-rule fix only if needed**

If `.gitignore` changed, commit it later together with release-prep changes instead of making an isolated noise commit.

---

### Task 2: Audit Git history for secrets or unsafe publication history

**Files:**
- Inspect: repository history via git

- [ ] **Step 1: Check whether sensitive file paths ever appeared in history**

Run:
```bash
git log --stat -- .dev.vars .env .claude .omc .wrangler
```

Expected:
- Ideally no commits affecting these paths
- If any appear, inspect whether they contain real sensitive material or only harmless metadata

- [ ] **Step 2: Search history for obvious secret-like tokens**

Run:
```bash
git log -S "secret" -S "token" -S "api_key" -S "access_key" --all --oneline
```

Expected:
- Some hits may be documentation or variable names only
- If a hit looks suspicious, inspect the commit before proceeding

- [ ] **Step 3: Stop if real secrets are found**

Decision rule:
- If real secrets or committed env files are discovered, stop implementation and discuss history cleanup before pushing
- If no real secrets are found, continue

- [ ] **Step 4: Record the audit result in the release work summary**

No code block needed here; when reporting later, explicitly state whether the current repo and history were clean or required remediation.

---

### Task 3: Rename project identity to Toolhive MCP

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `wrangler.jsonc` only if release-facing naming needs consistency

- [ ] **Step 1: Write the failing metadata expectations into the release review checklist**

Checklist target:
```text
- package name no longer says cloudflare-workers-multi-mcp
- README title says Toolhive MCP
- demo address is https://mcp.awsl.app/mcp
```

This is the non-test TDD equivalent for release work: define the expected visible outputs before editing.

- [ ] **Step 2: Update `package.json` project identity minimally**

Target shape:
```json
{
  "name": "toolhive-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module"
}
```

Notes:
- Keep package private for now
- Do not add extra scripts or metadata unless needed for release clarity

- [ ] **Step 3: Verify metadata change is correct**

Run:
```bash
node -p "require('./package.json').name"
```

Expected output:
```text
toolhive-mcp
```

- [ ] **Step 4: Align any visible release naming in docs/config**

Check whether `wrangler.jsonc` still needs the deployed Worker runtime name unchanged. If so, leave it as-is and describe Toolhive MCP as the project name in docs rather than renaming the deployed Worker artifact unless explicitly desired.

- [ ] **Step 5: Stage the rename-related files later with README changes**

Do not commit yet; this belongs in the release-prep commit.

---

### Task 4: Rewrite the English README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace the README title and opening summary**

Write this opening section:
```md
# Toolhive MCP

Toolhive MCP is a remote HTTP MCP server for Cloudflare Workers that bundles practical built-in tools, curated external integrations, and deployment-friendly serverless hosting into one endpoint.

Demo endpoint: `https://mcp.awsl.app/mcp`
```

- [ ] **Step 2: Add a clear “Why” section**

Write:
```md
## Why Toolhive MCP?

Running an MCP server on Cloudflare Workers makes it easy to deploy, cheap to keep online, and simple to expose as a stable remote endpoint. Toolhive MCP focuses on a practical all-in-one toolbox: core utilities, web/content helpers, developer utilities, and selected external APIs behind one `/mcp` endpoint.
```

- [ ] **Step 3: Add a feature overview that matches current reality**

Write:
```md
## Features

Current tool groups:

- Native tools: `weather`, `webfetch`, `calc`, `time`, `ip`
- Devutils: `devutils_*`
- Tavily: `tavily_*`
- Context7: `context7_*`
- Unsplash: `unsplash_search_photos`
- Pure.md: `puremd_extract`
- News: `news_*`

Currently disabled:

- Domain tools are intentionally disabled in the current release because the upstream service is unstable/unavailable.
```

- [ ] **Step 4: Add deployment and client-usage sections**

Write:
```md
## Endpoint

After deployment, the MCP endpoint is:

`https://mcp.awsl.app/mcp`

Only `/mcp` is supported.

## Deploy to Cloudflare Workers

```bash
npm install
npm run deploy
```
```

- [ ] **Step 5: Add secrets configuration and development commands**

Write:
```md
## Secrets

Configure API keys with Cloudflare secrets:

```bash
npx wrangler secret put TAVILY_API_KEYS
npx wrangler secret put CONTEXT7_API_KEYS
npx wrangler secret put UNSPLASH_ACCESS_KEYS
npx wrangler secret put PUREMD_API_KEYS
```

Each value can contain one key or a comma-separated key list.

## Development

```bash
npm install
npx vitest run
npm run typecheck
npm run dev
```
```

- [ ] **Step 6: Add license and acknowledgements sections**

Write:
```md
## License

This project is released under the 0BSD license.

## Acknowledgements

### Open-source references
- Reference projects and implementation ideas that informed this server

### Community packages
- Community and npm ecosystem work that influenced implementation details

### With Claude
- This project was developed with Claude’s assistance.
```

- [ ] **Step 7: Read the full README and remove internal-sounding phrasing**

Checklist:
- no roadmap text that is already outdated
- no “first release” phrasing if it reads stale
- no internal-only deployment notes
- demo endpoint included
- domain tools described honestly as disabled

---

### Task 5: Add the Chinese README

**Files:**
- Create: `README.zh-CN.md`

- [ ] **Step 1: Create the file with Chinese title and summary**

Write:
```md
# Toolhive MCP

Toolhive MCP 是一个部署在 Cloudflare Workers 上的远程 HTTP MCP server，把常用内置工具、精选外部集成，以及适合 serverless 部署的远程入口整合到了同一个 `/mcp` 端点里。

演示地址：`https://mcp.awsl.app/mcp`
```

- [ ] **Step 2: Add Chinese sections mirroring the English README**

Required sections:
```md
## 为什么做这个项目？
## 功能概览
## 接口地址
## 部署方式
## Secrets 配置
## 本地开发
## 当前禁用项说明
## 许可证
## 致谢
```

- [ ] **Step 3: Add the same three acknowledgement subsections in Chinese**

Write:
```md
### 开源参考
### 社区包与生态实现
### With Claude
```

- [ ] **Step 4: Review for natural Chinese phrasing**

Checklist:
- not literal machine translation
- preserves technical terms where useful
- includes demo address
- accurately states that domain tools are disabled

---

### Task 6: Add the 0BSD license

**Files:**
- Create: `LICENSE`

- [ ] **Step 1: Add the exact 0BSD license text**

Write this file content exactly:
```text
Zero-Clause BSD

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

- [ ] **Step 2: Verify README and LICENSE agree**

Check:
- README says 0BSD
- LICENSE file exists and contains the 0BSD text exactly

---

### Task 7: Commit current functional work

**Files:**
- Stage only the completed code/test/config changes from the functional work already done before release packaging

- [ ] **Step 1: Review which tracked changes belong to the completed implementation**

Run:
```bash
git status --short
```

Expected to include current code/test/config changes such as:
- `src/mcp/router.ts`
- `src/mcp/tool-registry.ts`
- `tests/mcp/protocol.test.ts`
- `tests/mcp/tool-registry.test.ts`
- `tests/tools/external.test.ts`
- `tests/tools/native.test.ts`
- `wrangler.jsonc`

- [ ] **Step 2: Stage only the completed implementation files**

Run:
```bash
git add src/mcp/router.ts src/mcp/tool-registry.ts tests/mcp/protocol.test.ts tests/mcp/tool-registry.test.ts tests/tools/external.test.ts tests/tools/native.test.ts wrangler.jsonc
```

- [ ] **Step 3: Commit the completed implementation state**

Run:
```bash
git commit -m "feat: finalize MCP tools and deployment behavior"
```

Expected:
- Commit succeeds
- Working tree still contains README/license/release-doc changes only (plus ignored/untracked local state)

---

### Task 8: Commit release-prep changes

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Create: `README.zh-CN.md`
- Create: `LICENSE`
- Modify: `.gitignore` if needed
- Create/keep: release design docs under `docs/superpowers/`

- [ ] **Step 1: Stage release-prep files**

Run:
```bash
git add package.json README.md README.zh-CN.md LICENSE .gitignore docs/superpowers/specs/2026-04-12-toolhive-mcp-release-design.md docs/superpowers/plans/2026-04-12-toolhive-mcp-release.md
```

If `.gitignore` did not change, omit it from the command.

- [ ] **Step 2: Commit release-prep changes**

Run:
```bash
git commit -m "docs: prepare Toolhive MCP for open-source release"
```

- [ ] **Step 3: Verify the repo is clean except ignored local state**

Run:
```bash
git status --short
```

Expected:
- no staged or modified tracked files remaining
- only ignored/untracked local assistant state may remain, and it must not be part of tracked files

---

### Task 9: Create the new private GitHub repository and push

**Files:**
- Remote repository only

- [ ] **Step 1: Confirm GitHub auth works for the user’s personal account**

Run:
```bash
gh auth status
```

Expected:
- authenticated via OAuth
- personal account available

- [ ] **Step 2: Create the new private repo**

Run:
```bash
gh repo create toolhive-mcp --private --source=. --remote=origin --push
```

Expected:
- new private repository created
- `origin` configured
- current branch pushed

- [ ] **Step 3: Verify the remote URL**

Run:
```bash
git remote -v
```

Expected:
- `origin` points to the newly created GitHub repository

- [ ] **Step 4: Verify final branch state after push**

Run:
```bash
git status --short && git log --oneline -2
```

Expected:
- clean tracked working tree
- top two commits should correspond to:
  - functional completion
  - release preparation

---

### Task 10: Final release verification

**Files:**
- Review only

- [ ] **Step 1: Verify publication safety one last time**

Run:
```bash
git ls-files | grep -E '^(\.dev\.vars|\.env|\.claude/|\.omc/|\.wrangler/)'
```

Expected:
- no output

- [ ] **Step 2: Verify README references the live demo endpoint**

Check that both READMEs mention:
```text
https://mcp.awsl.app/mcp
```

- [ ] **Step 3: Verify domain tools are described as disabled if mentioned**

Checklist:
- no README section implies `domain_*` is available now
- current docs match deployed behavior

- [ ] **Step 4: Summarize the release outcome**

Report:
- chosen name: Toolhive MCP
- publication safety result for current repo and history
- README / README zh / LICENSE added
- commit SHAs for functional and release commits
- GitHub repo created and pushed privately

---

## Self-review

### Spec coverage
- Rename to Toolhive MCP: covered in Task 3 and Task 4/5
- Verify no junk/sensitive files in current repo: covered in Task 1
- Verify Git history is clean: covered in Task 2
- Human-friendly README rewrite: covered in Task 4
- Chinese README: covered in Task 5
- 0BSD license: covered in Task 6
- Acknowledgements sections: covered in Task 4/5
- Commit uncommitted changes: covered in Task 7 and Task 8
- Create new private GitHub repo and push: covered in Task 9
- Include demo address `mcp.awsl.app`: covered in Task 4/5 and Task 10

### Placeholder scan
- No TODO/TBD placeholders remain
- Exact file paths and commands included
- README/license content is spelled out where needed

### Type/signature consistency
- Commit messages and repo name consistently use Toolhive MCP / toolhive-mcp
- Demo endpoint consistently uses `https://mcp.awsl.app/mcp`

---

Plan complete and saved to `docs/superpowers/plans/2026-04-12-toolhive-mcp-release.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
