import type { AppEnv } from "../lib/env";
import { buildPromptDefinitions } from "./prompt-catalog";
import { promptManifestEntries } from "./prompt-manifest";

export function getEnabledPrompts(_env: AppEnv) {
  return buildPromptDefinitions(promptManifestEntries);
}

export function findEnabledPrompt(name: string, _env: AppEnv) {
  return promptManifestEntries.find((prompt) => prompt.name === name);
}
