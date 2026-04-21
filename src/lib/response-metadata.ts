export type ResponseMetadata = {
  provider_used?: string;
  content_length?: number;
  truncated?: boolean;
  cached?: boolean;
  partial?: boolean;
};

export type ResponseMetadataInput = {
  providerUsed?: string;
  contentLength?: number;
  truncated?: boolean;
  cached?: boolean;
  partial?: boolean;
};

export function createResponseMetadata(input: ResponseMetadataInput): ResponseMetadata {
  return {
    ...(input.providerUsed !== undefined ? { provider_used: input.providerUsed } : {}),
    ...(input.contentLength !== undefined ? { content_length: input.contentLength } : {}),
    ...(input.truncated !== undefined ? { truncated: input.truncated } : {}),
    ...(input.cached !== undefined ? { cached: input.cached } : {}),
    ...(input.partial !== undefined ? { partial: input.partial } : {})
  };
}
