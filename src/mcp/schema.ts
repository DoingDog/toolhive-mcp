export type JsonSchemaProperty = {
  type?: "string" | "boolean" | "integer" | "number" | "object" | "array";
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchemaProperty;
  anyOf?: JsonSchemaProperty[];
  additionalProperties?: boolean | JsonSchemaProperty;
};

export type JsonSchema = {
  type: "object";
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  minProperties?: number;
  anyOf?: JsonSchema[];
  additionalProperties?: boolean | JsonSchemaProperty;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  requiresEnv?:
    | "CONTEXT7_API_KEYS"
    | "TAVILY_API_KEYS"
    | "UNSPLASH_ACCESS_KEYS"
    | "PUREMD_API_KEYS"
    | "EXA_API_KEYS"
    | "PAPER_SEARCH_MCP_UNPAYWALL_EMAILS";
};

export const emptyObjectSchema: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false
};
