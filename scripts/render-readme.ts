import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "vite";

const rootDir = resolve(import.meta.dirname, "..");
const markerStart = "<!-- GENERATED:README_TOOLING:start -->";
const markerEnd = "<!-- GENERATED:README_TOOLING:end -->";
const demoUrl = "https://mcp.awsl.app/mcp";

type Locale = "en" | "zh-CN";
type Category = "native" | "external" | "devutils";

type ManifestSummary = {
  name: string;
  category: Category;
  envGated: boolean;
};

function formatToolList(names: string[]): string {
  return names.map((name) => `\`${name}\``).join(", ");
}

async function collectManifestSummary(): Promise<ManifestSummary[]> {
  const vite = await createServer({
    appType: "custom",
    server: { middlewareMode: true }
  });

  try {
    const manifestModule = await vite.ssrLoadModule("/src/mcp/tool-manifest.ts");
    const entries = manifestModule.toolManifestEntries as Array<{
      name: string;
      category: Category;
      envRequirement?: string;
    }>;

    return entries.map((entry) => ({
      name: entry.name,
      category: entry.category,
      envGated: entry.envRequirement !== undefined
    }));
  } finally {
    await vite.close();
  }
}

function getToolNames(entries: ManifestSummary[], category: Category, gated: boolean): string[] {
  return entries.filter((entry) => entry.category === category && entry.envGated === gated).map((entry) => entry.name);
}

function getPaperToolNames(entries: ManifestSummary[], gated: boolean): string[] {
  return entries
    .filter((entry) => entry.name.startsWith("paper_") && entry.envGated === gated)
    .map((entry) => entry.name);
}

function renderBlock(locale: Locale, entries: ManifestSummary[]): string {
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
      `- 原生工具：${formatToolList(getToolNames(entries, "native", false))}`,
      `- Paper 工具：${formatToolList(getPaperToolNames(entries, false))}`,
      `- 需环境变量的 Paper 工具：${formatToolList(getPaperToolNames(entries, true))}`,
      `- 外部工具：${formatToolList(getToolNames(entries, "external", false).filter((name) => !name.startsWith("paper_")))}`,
      `- 需环境变量的外部工具：${formatToolList(getToolNames(entries, "external", true).filter((name) => !name.startsWith("paper_")))}`,
      `- 开发者工具：${formatToolList(getToolNames(entries, "devutils", false))}`,
      "- 运行 `npm run render:readme` 可根据 `src/mcp/tool-manifest.ts` 刷新此区块。",
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
    `- Native tools: ${formatToolList(getToolNames(entries, "native", false))}`,
    `- Paper tools: ${formatToolList(getPaperToolNames(entries, false))}`,
    `- Env-gated paper tool: ${formatToolList(getPaperToolNames(entries, true))}`,
    `- External tools: ${formatToolList(getToolNames(entries, "external", false).filter((name) => !name.startsWith("paper_")))}`,
    `- Env-gated external tools: ${formatToolList(getToolNames(entries, "external", true).filter((name) => !name.startsWith("paper_")))}`,
    `- Developer utilities: ${formatToolList(getToolNames(entries, "devutils", false))}`,
    "- Run `npm run render:readme` to refresh this block from `src/mcp/tool-manifest.ts`.",
    markerEnd
  ].join("\n");
}

function replaceGeneratedBlock(filePath: string, locale: Locale, entries: ManifestSummary[]): void {
  const source = readFileSync(filePath, "utf8");
  const startIndex = source.indexOf(markerStart);
  const endIndex = source.indexOf(markerEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(`Missing README generation markers in ${filePath}`);
  }

  const before = source.slice(0, startIndex);
  const after = source.slice(endIndex + markerEnd.length);
  const next = `${before}${renderBlock(locale, entries)}${after}`;

  writeFileSync(filePath, next);
}

const manifestEntries = await collectManifestSummary();

replaceGeneratedBlock(resolve(rootDir, "README.md"), "en", manifestEntries);
replaceGeneratedBlock(resolve(rootDir, "README.zh-CN.md"), "zh-CN", manifestEntries);
