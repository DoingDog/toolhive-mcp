import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const rootDir = resolve(import.meta.dirname, "..");
const markerStart = "<!-- GENERATED:README_TOOLING:start -->";
const markerEnd = "<!-- GENERATED:README_TOOLING:end -->";
const demoUrl = "https://mcp.awsl.app/mcp?key=elysia";

type Locale = "en" | "zh-CN";
type Category = "native" | "external" | "devutils";

type ToolManifestSummary = {
  name: string;
  category: Category;
  envGated: boolean;
};

type ResourceSummary = {
  uri: string;
  mimeType: string;
  kind: "static" | "runtime";
};

type PromptSummary = {
  name: string;
};

type ReadmeSummary = {
  tools: ToolManifestSummary[];
  resources: ResourceSummary[];
  prompts: PromptSummary[];
};

function formatList(values: string[]): string {
  return values.map((value) => `\`${value}\``).join(", ");
}

function formatResourceList(resources: ResourceSummary[]): string[] {
  return resources.map((resource) => `- \`${resource.uri}\` (${resource.mimeType}, ${resource.kind})`);
}

async function collectReadmeSummary(): Promise<ReadmeSummary> {
  const vite = await createServer({
    root: rootDir,
    appType: "custom",
    server: { middlewareMode: true }
  });

  try {
    const toolManifestModule = await vite.ssrLoadModule("/src/mcp/tool-manifest.ts");
    const resourceManifestModule = await vite.ssrLoadModule("/src/mcp/resource-manifest.ts");
    const promptRegistryModule = await vite.ssrLoadModule("/src/mcp/prompt-registry.ts");
    const toolEntries = toolManifestModule.toolManifestEntries as Array<{
      name: string;
      category: Category;
      envRequirement?: string;
    }>;
    const resources = resourceManifestModule.resourceManifestEntries as Array<{
      uri: string;
      mimeType: string;
      kind: "static" | "runtime";
    }>;
    const prompts = promptRegistryModule.getEnabledPrompts({}) as Array<{ name: string }>;

    return {
      tools: toolEntries.map((entry) => ({
        name: entry.name,
        category: entry.category,
        envGated: entry.envRequirement !== undefined
      })),
      resources: resources.map((resource) => ({ uri: resource.uri, mimeType: resource.mimeType, kind: resource.kind })),
      prompts: prompts.map((prompt) => ({ name: prompt.name }))
    };
  } finally {
    await vite.close();
  }
}

function getToolNames(entries: ToolManifestSummary[], category: Category, gated: boolean): string[] {
  return entries.filter((entry) => entry.category === category && entry.envGated === gated).map((entry) => entry.name);
}

function getPaperToolNames(entries: ToolManifestSummary[], gated: boolean): string[] {
  return entries
    .filter((entry) => entry.name.startsWith("paper_") && entry.envGated === gated)
    .map((entry) => entry.name);
}

function renderBlock(locale: Locale, summary: ReadmeSummary): string {
  const { tools, resources, prompts } = summary;

  if (locale === "zh-CN") {
    return [
      markerStart,
      "### 自动生成的工具快照",
      "",
      `演示地址：\`${demoUrl}\``,
      "",
      "支持的认证方式：",
      "",
      "- Bearer",
      "- x-api-key / API key",
      "- query `key`",
      "",
      "基于 manifest 的工具列表：",
      "",
      `- 原生工具：${formatList(getToolNames(tools, "native", false))}`,
      `- Paper 工具：${formatList(getPaperToolNames(tools, false))}`,
      `- 需环境变量的 Paper 工具：${formatList(getPaperToolNames(tools, true))}`,
      `- 外部工具：${formatList(getToolNames(tools, "external", false).filter((name) => !name.startsWith("paper_")))}`,
      `- 需环境变量的外部工具：${formatList(getToolNames(tools, "external", true).filter((name) => !name.startsWith("paper_")))}`,
      `- 开发者工具：${formatList(getToolNames(tools, "devutils", false))}`,
      "",
      "内置 Resources：",
      ...formatResourceList(resources),
      "",
      "内置 Prompts：",
      `- ${formatList(prompts.map((prompt) => prompt.name))}`,
      "- 运行 `npm run render:readme` 可根据 `src/mcp/tool-manifest.ts`、`src/mcp/resource-manifest.ts` 和 `src/mcp/prompt-manifest.ts` 刷新此区块。",
      markerEnd
    ].join("\n");
  }

  return [
    markerStart,
    "### Generated tool snapshot",
    "",
    `Demo endpoint: \`${demoUrl}\``,
    "",
    "Supported auth:",
    "",
    "- Bearer",
    "- x-api-key / API key",
    "- query `key`",
    "",
    "Manifest-backed tool surface:",
    "",
    `- Native tools: ${formatList(getToolNames(tools, "native", false))}`,
    `- Paper tools: ${formatList(getPaperToolNames(tools, false))}`,
    `- Env-gated paper tool: ${formatList(getPaperToolNames(tools, true))}`,
    `- External tools: ${formatList(getToolNames(tools, "external", false).filter((name) => !name.startsWith("paper_")))}`,
    `- Env-gated external tools: ${formatList(getToolNames(tools, "external", true).filter((name) => !name.startsWith("paper_")))}`,
    `- Developer utilities: ${formatList(getToolNames(tools, "devutils", false))}`,
    "",
    "Built-in resources:",
    ...formatResourceList(resources),
    "",
    "Built-in prompts:",
    `- ${formatList(prompts.map((prompt) => prompt.name))}`,
    "- Run `npm run render:readme` to refresh this block from `src/mcp/tool-manifest.ts`, `src/mcp/resource-manifest.ts`, and `src/mcp/prompt-manifest.ts`.",
    markerEnd
  ].join("\n");
}

function replaceGeneratedBlock(filePath: string, locale: Locale, summary: ReadmeSummary): void {
  const source = readFileSync(filePath, "utf8");
  const startIndex = source.indexOf(markerStart);
  const endIndex = source.indexOf(markerEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing README generation markers in ${filePath}`);
  }

  const before = source.slice(0, startIndex);
  const after = source.slice(endIndex + markerEnd.length);
  const next = `${before}${renderBlock(locale, summary)}${after}`;

  writeFileSync(filePath, next);
}

const readmeSummary = await collectReadmeSummary();

replaceGeneratedBlock(resolve(rootDir, "README.md"), "en", readmeSummary);
replaceGeneratedBlock(resolve(rootDir, "README.zh-CN.md"), "zh-CN", readmeSummary);
