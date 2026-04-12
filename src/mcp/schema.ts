export type JsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiresEnv?: "CONTEXT7_API_KEYS" | "TAVILY_API_KEYS" | "UNSPLASH_ACCESS_KEYS" | "PUREMD_API_KEYS";
};

export const emptyObjectSchema: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};
