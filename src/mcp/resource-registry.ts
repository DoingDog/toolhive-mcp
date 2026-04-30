import type { AppEnv } from "../lib/env";
import { buildResourceDefinitions } from "./resource-catalog";
import { resourceManifestEntries } from "./resource-manifest";

export function getEnabledResources(_env: AppEnv) {
  return buildResourceDefinitions(resourceManifestEntries);
}

export function findEnabledResource(uri: string, _env: AppEnv) {
  return resourceManifestEntries.find((resource) => resource.uri === uri);
}
