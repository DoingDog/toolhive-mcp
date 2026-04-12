# Toolhive MCP Release Design

## Context

The project is functionally complete and already deployed on Cloudflare Workers at a custom domain. The next step is not feature development but open-source release preparation. The release needs to rename the project to **Toolhive MCP**, verify that no local junk or sensitive files are present in the current repository state or Git history, rewrite the documentation into a more human-friendly English README plus a Chinese README, add the 0BSD license, preserve proper acknowledgements, commit the current uncommitted work cleanly, and finally create and push to a new private GitHub repository under the user's personal account via OAuth.

The release should optimize for a clean first impression on GitHub: short memorable branding, readable docs, minimal but professional commit history, and no accidental leakage of `.dev.vars`, `.env`, `.claude`, `.omc`, or other local-only artifacts. Existing disabled or deferred features should be represented honestly in docs, and code that is intentionally retained but not exposed should stay in the repo.

## Scope

This release batch includes:

1. Rename project metadata and outward-facing project identity to **Toolhive MCP**.
2. Verify current working tree and tracked files are safe for GitHub publication.
3. Audit Git history for sensitive files or secrets that would make publication unsafe.
4. Rewrite the primary README in English.
5. Add a Chinese README.
6. Add the 0BSD license.
7. Preserve and clearly structure acknowledgements for:
   - open-source references
   - community packages / npm ecosystem inspirations
   - Claude
8. Commit current feature work and release-prep work in clean boundaries.
9. Create a new private GitHub repository under the user's personal account and push the prepared repository.

This release batch does **not** include new product features, protocol changes, or post-release marketing tasks.

## Design

### 1. Naming and identity

The project name becomes **Toolhive MCP**.

The naming should be applied consistently in:
- `package.json` package name / description-facing identity
- README title and top-level positioning
- repository name when creating the GitHub repo
- deployment / usage examples where the project name is mentioned

The release should keep the name short and product-like while leaving implementation details such as Cloudflare Workers in the descriptive subtitle rather than the main title.

### 2. Publication safety checks

There are two distinct safety checks before any push:

#### Working tree / tracked-file check

Inspect:
- current tracked files
- current untracked files
- `.gitignore`
- files likely to be local-only or sensitive

Must verify that these are not being prepared for GitHub upload:
- `.dev.vars`
- `.dev.vars.*`
- `.env`
- `.env.*`
- `.claude/`
- `.omc/`
- `.wrangler/`
- other local cache / state / worktree artifacts

This is not just an ignore-file review; it must verify actual git state.

#### Git history safety check

Inspect commit history for:
- committed secrets
- committed env files
- committed local harness / assistant state
- obvious tokens or sensitive literal values

If history is clean, proceed normally.
If history contains sensitive content, stop and address history remediation before publication.

### 3. Documentation strategy

#### English README

The main README should read like a project a human maintainer would publish, not an internal notes file. It should be concise, practical, and honest.

Recommended structure:
1. Project title and one-paragraph summary
2. Why Toolhive MCP exists
3. Feature overview by tool group
4. Current endpoint / deployment shape
5. Demo address: `https://mcp.awsl.app/mcp`
6. How to deploy on Cloudflare Workers
7. How to configure secrets
8. How to use with an MCP client
9. Development / test commands
10. Notes on intentionally disabled tools or unstable upstreams
11. License
12. Acknowledgements

The README should reflect the current released reality:
- the current demo / live endpoint is `https://mcp.awsl.app/mcp`
- canonical tool names now use Anthropic-compatible naming
- domain tools are currently disabled
- code for deferred/disabled tools may still exist in the repo

#### Chinese README

A separate Chinese README should mirror the intent of the English one, not necessarily line-for-line literal translation. It should feel natural to Chinese-speaking developers and preserve technical correctness.

### 4. Acknowledgements

The acknowledgements section should be explicit and separated into three headings:

#### Open-source references
For code or implementation ideas inspired by other open-source projects.

#### Community packages
For npm/community packages or ecosystem implementations referenced or borrowed conceptually.

#### With Claude
A brief, direct acknowledgement that the project was developed with Claude assistance.

This structure avoids mixing “direct code inspiration” with “ecosystem dependencies” and keeps attribution readable.

### 5. License

Add `LICENSE` using the **0BSD** text.

The README should point to the 0BSD license and make the permissive intent clear without overexplaining.

### 6. Commit strategy

Before creating the GitHub repo, the repo should not remain in a dirty state.

Recommended commit boundary:

#### Commit 1 — completed functional changes
Capture current outstanding product/code changes that are already part of the finished implementation state.

#### Commit 2 — open-source release prep
Capture:
- rename to Toolhive MCP
- README rewrite
- Chinese README
- LICENSE
- any release-facing metadata cleanup
- ignore / publication safety fixes if needed

This keeps the functional work separate from the packaging/presentation work.

### 7. GitHub publication flow

The target is a **new private repository** under the user's personal GitHub account via OAuth-authenticated CLI/session.

Recommended flow:
1. Verify git state is clean after commits.
2. Create the new private GitHub repo with the final chosen name.
3. Add/update `origin`.
4. Push the prepared branch/history.
5. Verify remote contents and default branch.

The repository should remain private initially. Public visibility can be changed later after the user reviews the final presentation.

## Risks and handling

### Risk: sensitive files are ignored but already committed
Mitigation: inspect both current git state and history. Do not assume `.gitignore` alone is enough.

### Risk: release docs drift from actual current behavior
Mitigation: base README content on current deployed/implemented behavior, especially canonical tool names and disabled domain tools.

### Risk: cluttered first public history
Mitigation: use explicit commit boundaries before the first push.

### Risk: release accidentally includes local assistant state
Mitigation: explicitly inspect `.claude`, `.omc`, worktree artifacts, and untracked files before push.

## Implementation checklist

1. Inspect current package metadata, README, ignore rules, git status, tracked files.
2. Inspect git history for sensitive files and obvious secrets.
3. Rename project identity to Toolhive MCP.
4. Rewrite English README.
5. Add Chinese README.
6. Add 0BSD LICENSE.
7. Re-check git publication safety.
8. Commit completed implementation changes.
9. Commit release-prep changes.
10. Create new private GitHub repository under the user's personal account.
11. Push the prepared repository.
12. Verify remote state.

## Verification

### Local verification
- `git status --short`
- inspect tracked/untracked file list
- inspect `.gitignore`
- inspect commit history for sensitive files / obvious secrets
- review README / README zh / LICENSE contents for consistency

### Release verification
- confirm project name appears consistently as Toolhive MCP
- confirm `.dev.vars`, `.env*`, `.claude/`, `.omc/`, `.wrangler/` are not being uploaded
- confirm domain tools are documented as disabled if mentioned
- confirm acknowledgements have the three requested sections
- confirm GitHub repo is created as private under the user's personal account
- confirm push succeeds
