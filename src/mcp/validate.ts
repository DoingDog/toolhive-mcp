import type { JsonSchema, JsonSchemaProperty } from "./schema";

export function validateToolArguments(schema: JsonSchema, args: unknown): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return "Invalid params";
  }

  const input = args as Record<string, unknown>;

  if (schema.anyOf) {
    const matchesAny = schema.anyOf.some((option) => validateToolArguments(option, input) === undefined);
    if (!matchesAny) {
      return "Invalid params";
    }
  }

  const properties = schema.properties ?? {};

  if (schema.minProperties !== undefined && Object.keys(input).length < schema.minProperties) {
    return "Invalid params";
  }

  for (const required of schema.required ?? []) {
    if (!(required in input)) return "Invalid params";
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(input)) {
      if (!(key in properties)) return "Invalid params";
    }
  }

  for (const [key, value] of Object.entries(input)) {
    const property = properties[key] as JsonSchemaProperty | undefined;
    if (!property) {
      if (typeof schema.additionalProperties === "object") {
        const error = validateValue(schema.additionalProperties, value);
        if (error) return "Invalid params";
      }
      continue;
    }

    const error = validateValue(property, value);
    if (error) return "Invalid params";
  }

  return undefined;
}

function validateValue(schema: JsonSchemaProperty, value: unknown): string | undefined {
  if (schema.anyOf) {
    const matchesAny = schema.anyOf.some((option) => validateValue(option, value) === undefined);
    if (!matchesAny) return "Invalid params";
  }

  if (schema.enum && !schema.enum.includes(value)) return "Invalid params";

  if (schema.type) {
    if (schema.type === "integer") {
      if (!Number.isInteger(value)) return "Invalid params";
    } else if (schema.type === "array") {
      if (!Array.isArray(value)) return "Invalid params";
      if (schema.items) {
        for (const item of value) {
          const error = validateValue(schema.items, item);
          if (error) return "Invalid params";
        }
      }
    } else if (schema.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) return "Invalid params";
      if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        for (const item of Object.values(value)) {
          const error = validateValue(schema.additionalProperties, item);
          if (error) return "Invalid params";
        }
      }
    } else if (typeof value !== schema.type) {
      return "Invalid params";
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return "Invalid params";
    if (schema.maximum !== undefined && value > schema.maximum) return "Invalid params";
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) return "Invalid params";
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return "Invalid params";
  }

  return undefined;
}
