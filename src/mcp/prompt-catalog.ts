import type { PromptDefinition } from "./schema";
import type { PromptHandler, PromptManifestEntry } from "./prompt-manifest";

export function buildPromptDefinitions(entries: PromptManifestEntry[]): PromptDefinition[] {
  return entries.map(({ name, title, description, arguments: args }) => ({
    name,
    ...(title ? { title } : {}),
    description,
    ...(args ? { arguments: args } : {})
  }));
}

export function buildPromptHandlerMap(entries: PromptManifestEntry[]): Map<string, PromptHandler> {
  return new Map(entries.map((entry) => [entry.name, entry.handler] as const));
}
