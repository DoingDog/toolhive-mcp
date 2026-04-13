import { parseKeyList } from "./keys";

export type AppEnv = Record<string, string | undefined>;

export function hasKeys(
  env: AppEnv,
  name: "CONTEXT7_API_KEYS" | "TAVILY_API_KEYS" | "UNSPLASH_ACCESS_KEYS" | "PUREMD_API_KEYS" | "EXA_API_KEYS"
): boolean {
  return parseKeyList(env[name]).length > 0;
}
