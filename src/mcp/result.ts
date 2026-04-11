export type ToolContent = { type: "text"; text: string };

export type McpToolResult = {
  content: ToolContent[];
  isError?: boolean;
};

export type ToolSuccess = {
  ok: true;
  data: unknown;
};

export type ToolFailure = {
  ok: false;
  error: {
    type: "validation_error" | "upstream_error" | "config_error" | "internal_error";
    message: string;
    details?: unknown;
  };
};

export type ToolExecutionResult = ToolSuccess | ToolFailure;

export function stringifyToolData(data: unknown): string {
  return typeof data === "string" ? data : JSON.stringify(data, null, 2);
}

export function toToolResult(result: ToolExecutionResult): McpToolResult {
  if (result.ok) {
    return {
      content: [{ type: "text", text: stringifyToolData(result.data) }]
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ error: result.error }, null, 2) }],
    isError: true
  };
}
