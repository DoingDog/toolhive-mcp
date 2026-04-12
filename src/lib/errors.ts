import type { ToolFailure } from "../mcp/result";

export function validationError(message: string, details?: unknown): ToolFailure {
  return {
    ok: false,
    error: {
      type: "validation_error",
      message,
      details
    }
  };
}

export function configError(message: string, details?: unknown): ToolFailure {
  return {
    ok: false,
    error: {
      type: "config_error",
      message,
      details
    }
  };
}

export function upstreamError(message: string, status?: number, details?: unknown): ToolFailure {
  return {
    ok: false,
    error: {
      type: "upstream_error",
      message,
      details: status === undefined ? details : { status, details }
    }
  };
}

export function internalError(message: string, details?: unknown): ToolFailure {
  return {
    ok: false,
    error: {
      type: "internal_error",
      message,
      details
    }
  };
}
