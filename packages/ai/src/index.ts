import type { AssetProvenance, AssetProvenanceSettingValue, AssetType } from "@pixelaid/shared";

export type AiProviderCapabilityMap = {
  textToImage: boolean;
  imageEdit: boolean;
  imageVariation: boolean;
  transparentBackground?: boolean;
  seed?: boolean;
};

export type GenerateImageRequest = {
  prompt: string;
  size?: string;
  count?: number;
  stylePreset?: string;
  negativePrompt?: string;
  transparentBackground?: boolean;
  outputFormat?: "png" | "jpeg" | "webp";
  quality?: "low" | "medium" | "high" | "auto";
  seed?: string | number;
  sourceImage?: string;
  metadata?: Record<string, unknown>;
};

export type EditImageRequest = GenerateImageRequest & {
  image: Uint8Array;
  mask?: Uint8Array;
};

export type GeneratedImage = {
  id: string;
  mimeType: string;
  bytes?: Uint8Array;
  url?: string;
  width?: number;
  height?: number;
  provenance: AssetProvenance;
};

export type GeneratedImageResult = {
  images: GeneratedImage[];
  warnings: string[];
};

export type AiImageProvider = {
  id: string;
  displayName: string;
  capabilities: AiProviderCapabilityMap;
  generateImage: (request: GenerateImageRequest, signal?: AbortSignal) => Promise<GeneratedImageResult>;
  editImage?: (request: EditImageRequest, signal?: AbortSignal) => Promise<GeneratedImageResult>;
};

export type PixelArtPromptRequest = {
  assetType: AssetType | "spriteSheet";
  subject: string;
  targetSize?: string;
  view?: string;
  animation?: string;
  palette?: string;
  background?: "transparent" | "solid" | string;
  extraConstraints?: string[];
};

export type AiValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: { code: "invalid_image"; message: string } };

export type MockAiImageProviderOptions = {
  id?: string;
  displayName?: string;
  model?: string;
  now?: () => Date;
  bytes?: Uint8Array;
};

export type OpenAiImageProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetch?: typeof fetch;
  now?: () => Date;
};

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
    size?: string;
  }>;
  usage?: {
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

const supportedGeneratedMimeTypes = new Set(["image/png", "image/webp", "image/jpeg"]);
const secretKeyPattern = /(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|token$|secret|password|credential|authorization|bearer)/i;
const secretValuePatterns = [/^bearer\s+/i, /^sk-[a-z0-9_-]{8,}/i];
const defaultOpenAiEndpoint = "https://api.openai.com/v1/images/generations";

export class AiProviderError extends Error {
  override name = "AiProviderError";

  constructor(
    public readonly code: "missing_api_key" | "provider_error" | "invalid_response",
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function buildPixelArtPrompt(request: PixelArtPromptRequest): string {
  const parts = [
    `Create real pixel art for a ${request.assetType}: ${request.subject}.`,
    "Use a consistent native pixel grid, intentional hard-edged pixels, no blur, and no anti-aliasing.",
    "Keep the silhouette readable and avoid fake enlarged pixel texture.",
  ];

  if (request.targetSize) {
    parts.push(`Target native size: ${request.targetSize}.`);
  }
  if (request.view) {
    parts.push(`View: ${request.view}.`);
  }
  if (request.animation) {
    parts.push(`Animation or sheet intent: ${request.animation}.`);
  }
  if (request.palette) {
    parts.push(`Palette: ${request.palette}.`);
  }
  if (request.background) {
    parts.push(`Background: ${request.background}.`);
  }
  if (request.extraConstraints) {
    parts.push(...request.extraConstraints.map((constraint) => `Constraint: ${constraint}.`));
  }

  return parts.join(" ");
}

export function createMockAiImageProvider(options: MockAiImageProviderOptions = {}): AiImageProvider {
  const id = options.id ?? "mock";
  const model = options.model ?? "mock-image-model";
  const now = options.now ?? (() => new Date());
  const bytes = options.bytes ?? new Uint8Array([137, 80, 78, 71]);

  return {
    id,
    displayName: options.displayName ?? "Mock AI Image Provider",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      imageVariation: false,
      transparentBackground: true,
      seed: true,
    },
    async generateImage(request) {
      const count = clampCount(request.count);
      return {
        images: Array.from({ length: count }, (_, index) => ({
          id: `${id}-${index + 1}`,
          mimeType: "image/png",
          bytes: new Uint8Array(bytes),
          provenance: createAssetProvenance({
            provider: id,
            model,
            request,
            createdAt: now().toISOString(),
          }),
        })),
        warnings: [],
      };
    },
  };
}

export function createOpenAiImageProvider(options: OpenAiImageProviderOptions = {}): AiImageProvider {
  const model = options.model ?? "gpt-image-1.5";
  const endpoint = options.endpoint ?? defaultOpenAiEndpoint;
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    id: "openai",
    displayName: "OpenAI Images",
    capabilities: {
      textToImage: true,
      imageEdit: false,
      imageVariation: false,
      transparentBackground: true,
      seed: false,
    },
    async generateImage(request, signal) {
      const apiKey = options.apiKey?.trim();
      if (!apiKey) {
        throw new AiProviderError("missing_api_key", "OpenAI image generation requires a user-provided API key.");
      }
      if (!fetchImpl) {
        throw new AiProviderError("provider_error", "OpenAI image generation requires a fetch implementation.");
      }

      const body = createOpenAiGenerationBody(model, request);
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      };
      if (signal) {
        init.signal = signal;
      }
      const response = await fetchImpl(endpoint, init);
      const payload = await response.json().catch(() => undefined) as OpenAiImageResponse | undefined;
      if (!response.ok) {
        throw new AiProviderError("provider_error", payload?.error?.message ?? `OpenAI image generation failed with HTTP ${response.status}.`, {
          status: response.status,
          type: payload?.error?.type,
          code: payload?.error?.code,
        });
      }
      if (!payload?.data || payload.data.length === 0) {
        throw new AiProviderError("invalid_response", "OpenAI image generation returned no images.");
      }

      return {
        images: payload.data.map((item, index) => ({
          id: `openai-${index + 1}`,
          mimeType: mimeTypeFromFormat(request.outputFormat ?? "png"),
          ...(item.b64_json ? { bytes: decodeBase64(item.b64_json) } : {}),
          ...(item.url ? { url: item.url } : {}),
          ...parseImageSize(item.size ?? request.size),
          provenance: createAssetProvenance({
            provider: "openai",
            model,
            request,
            createdAt: now().toISOString(),
            extraSettings: {
              ...(item.revised_prompt ? { revisedPrompt: item.revised_prompt } : {}),
              ...(payload.usage?.total_tokens ? { usageTotalTokens: payload.usage.total_tokens } : {}),
            },
          }),
        })),
        warnings: [],
      };
    },
  };
}

export function validateGeneratedImage(image: GeneratedImage, maxBytes = 50 * 1024 * 1024): AiValidationResult {
  if (!supportedGeneratedMimeTypes.has(image.mimeType)) {
    return { ok: false, error: { code: "invalid_image", message: `Unsupported generated image MIME type "${image.mimeType}".` } };
  }
  if (!image.bytes && !image.url) {
    return { ok: false, error: { code: "invalid_image", message: "Generated image must include bytes or a URL." } };
  }
  if (image.bytes && image.bytes.byteLength > maxBytes) {
    return { ok: false, error: { code: "invalid_image", message: `Generated image exceeds ${maxBytes} bytes.` } };
  }

  const warnings: string[] = [];
  if (image.url && !image.bytes) {
    warnings.push("Generated image references a URL; download and validate bytes before running PixelAid cleanup.");
  }
  return { ok: true, warnings };
}

function createOpenAiGenerationBody(model: string, request: GenerateImageRequest): Record<string, unknown> {
  return {
    model,
    prompt: request.prompt,
    n: clampCount(request.count),
    ...(request.size ? { size: request.size } : {}),
    ...(request.quality ? { quality: request.quality } : {}),
    ...(request.transparentBackground !== undefined ? { background: request.transparentBackground ? "transparent" : "opaque" } : {}),
    ...(request.outputFormat ? { output_format: request.outputFormat } : {}),
  };
}

function createAssetProvenance(options: {
  provider: string;
  model: string;
  request: GenerateImageRequest;
  createdAt: string;
  extraSettings?: Record<string, unknown>;
}): AssetProvenance {
  const settings = sanitizeSettings({
    count: options.request.count,
    size: options.request.size,
    stylePreset: options.request.stylePreset,
    transparentBackground: options.request.transparentBackground,
    outputFormat: options.request.outputFormat,
    quality: options.request.quality,
    ...options.request.metadata,
    ...options.extraSettings,
  });

  return {
    origin: "ai",
    provider: options.provider,
    model: options.model,
    prompt: options.request.prompt,
    ...(options.request.negativePrompt ? { negativePrompt: options.request.negativePrompt } : {}),
    ...(options.request.seed !== undefined ? { seed: options.request.seed } : {}),
    ...(options.request.sourceImage ? { sourceImage: options.request.sourceImage } : {}),
    generatedAt: options.createdAt,
    ...(settings ? { settings } : {}),
  };
}

function sanitizeSettings(settings: Record<string, unknown>): Record<string, AssetProvenanceSettingValue> | undefined {
  const sanitized: Record<string, AssetProvenanceSettingValue> = {};

  for (const [rawKey, rawValue] of Object.entries(settings)) {
    const key = rawKey.trim();
    if (key.length === 0 || secretKeyPattern.test(key)) {
      continue;
    }

    const value = toSettingValue(rawValue);
    if (value === undefined || isSecretLikeSettingValue(value)) {
      continue;
    }
    sanitized[key] = value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function toSettingValue(value: unknown): AssetProvenanceSettingValue | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean" || value === null) {
    return value;
  }
  return undefined;
}

function isSecretLikeSettingValue(value: AssetProvenanceSettingValue): boolean {
  return typeof value === "string" && secretValuePatterns.some((pattern) => pattern.test(value.trim()));
}

function clampCount(count: number | undefined): number {
  if (count === undefined || !Number.isFinite(count)) {
    return 1;
  }
  return Math.min(10, Math.max(1, Math.trunc(count)));
}

function mimeTypeFromFormat(format: NonNullable<GenerateImageRequest["outputFormat"]>): string {
  return `image/${format}`;
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function parseImageSize(size: string | undefined): { width?: number; height?: number } {
  const match = /^(\d+)x(\d+)$/i.exec(size ?? "");
  if (!match) {
    return {};
  }

  return {
    width: Number(match[1]!),
    height: Number(match[2]!),
  };
}
