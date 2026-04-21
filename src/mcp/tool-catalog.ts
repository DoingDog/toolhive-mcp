import type { ToolDefinition } from "./schema";
import type { ToolHandler, ToolManifestEntry } from "./tool-manifest";

export type ToolCatalogProjection = {
  definitions: ToolDefinition[];
  aliasMap: Map<string, string>;
  handlerMap: Map<string, ToolHandler>;
};

export function buildToolDefinitions(entries: ToolManifestEntry[]): ToolDefinition[] {
  return entries.map(({ name, description, inputSchema, envRequirement }) => ({
    name,
    description,
    inputSchema,
    ...(envRequirement ? { requiresEnv: envRequirement } : {})
  }));
}

export function buildAliasMap(entries: ToolManifestEntry[]): Map<string, string> {
  return new Map(entries.flatMap((entry) => entry.aliases.map((alias) => [alias, entry.name] as const)));
}

export function buildHandlerMap(entries: ToolManifestEntry[]): Map<string, ToolHandler> {
  return new Map(entries.map((entry) => [entry.name, entry.handler] as const));
}

export function buildToolCatalog(entries: ToolManifestEntry[]): ToolCatalogProjection {
  return {
    definitions: buildToolDefinitions(entries),
    aliasMap: buildAliasMap(entries),
    handlerMap: buildHandlerMap(entries)
  };
}
