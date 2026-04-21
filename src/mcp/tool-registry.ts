import { type AppEnv } from "../lib/env";
import type { ToolDefinition } from "./schema";
import { buildAliasMap, buildToolDefinitions } from "./tool-catalog";
import { getManifestEnabledEntries } from "./tool-manifest";

type GetEnabledToolsOptions = {
  disabledTools?: string[];
};

function toManifestToolName(name: string): string {
  return name.replace(/[.-]/g, "_");
}

export function canonicalizeToolName(name: string): string {
  return name.replace(/\./g, "_");
}

function getEnabledAliasMap(env: AppEnv): Map<string, string> {
  return buildAliasMap(getManifestEnabledEntries(env));
}

export function getEnabledTools(env: AppEnv, options: GetEnabledToolsOptions = {}): ToolDefinition[] {
  const tools = buildToolDefinitions(getManifestEnabledEntries(env));
  const disabledTools = options.disabledTools;

  if (!disabledTools?.length) {
    return tools;
  }

  return tools.filter((tool) => !matchesDisabledTool(tool.name, disabledTools, env));
}

export function findEnabledTool(name: string, env: AppEnv): ToolDefinition | undefined {
  const canonicalName = getEnabledAliasMap(env).get(name) ?? toManifestToolName(name);
  return getEnabledTools(env).find((tool) => tool.name === canonicalName);
}

function matchesDisabledTool(name: string, disabledTools: string[], env: AppEnv): boolean {
  const aliasMap = getEnabledAliasMap(env);

  return disabledTools.some((disabledTool) => {
    if (disabledTool.endsWith(".*")) {
      const prefix = disabledTool.slice(0, -2);
      return name.startsWith(`${prefix}_`) || name.startsWith(`${toManifestToolName(prefix)}_`);
    }

    return name === (aliasMap.get(disabledTool) ?? toManifestToolName(disabledTool));
  });
}
