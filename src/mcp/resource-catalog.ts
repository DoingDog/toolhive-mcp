import type { ResourceDefinition } from "./schema";
import type { ResourceHandler, ResourceManifestEntry } from "./resource-manifest";

export function buildResourceDefinitions(entries: ResourceManifestEntry[]): ResourceDefinition[] {
  return entries.map(({ uri, name, title, description, mimeType }) => ({
    uri,
    name,
    ...(title ? { title } : {}),
    description,
    mimeType
  }));
}

export function buildResourceHandlerMap(entries: ResourceManifestEntry[]): Map<string, ResourceHandler> {
  return new Map(entries.map((entry) => [entry.uri, entry.handler] as const));
}
