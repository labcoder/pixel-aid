import { describe, expect, it } from "vitest";
import {
  AiProviderError,
  buildPixelArtPrompt,
  createMockAiImageProvider,
  createOpenAiImageProvider,
  validateGeneratedImage,
} from "./index";

describe("AI provider adapters", () => {
  it("builds a pixel-art prompt that preserves production constraints", () => {
    const prompt = buildPixelArtPrompt({
      assetType: "spriteSheet",
      subject: "helmeted robot soldier",
      targetSize: "64x64",
      view: "side view",
      animation: "idle, walk, shoot",
      palette: "limited cyan and desaturated green palette",
      background: "transparent",
      extraConstraints: ["no labels", "consistent frame boxes"],
    });

    expect(prompt).toContain("helmeted robot soldier");
    expect(prompt).toContain("64x64");
    expect(prompt).toContain("real pixel art");
    expect(prompt).toContain("no anti-aliasing");
    expect(prompt).toContain("consistent frame boxes");
  });

  it("returns generated images with PixelAid provenance from a mock provider", async () => {
    const provider = createMockAiImageProvider({ now: () => new Date("2026-05-01T00:00:00.000Z") });
    const result = await provider.generateImage({
      prompt: "tiny potion icon",
      count: 2,
      size: "1024x1024",
      metadata: { apiKey: "fixture-api-key-redacted", style: "clean" },
    });

    expect(result.images).toHaveLength(2);
    expect(result.images[0]?.provenance).toEqual({
      origin: "ai",
      provider: "mock",
      model: "mock-image-model",
      prompt: "tiny potion icon",
      generatedAt: "2026-05-01T00:00:00.000Z",
      settings: {
        count: 2,
        size: "1024x1024",
        style: "clean",
      },
    });
  });

  it("validates generated image handoff payloads before cleanup", () => {
    expect(validateGeneratedImage({
      id: "candidate-1",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
      provenance: { origin: "ai", provider: "mock", prompt: "sprite" },
    })).toEqual({ ok: true, warnings: [] });

    expect(validateGeneratedImage({
      id: "bad",
      mimeType: "text/plain",
      bytes: new Uint8Array([1]),
      provenance: { origin: "ai" },
    }).ok).toBe(false);
  });

  it("maps OpenAI generation requests without requiring the OpenAI SDK", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; authorization?: string }> = [];
    const provider = createOpenAiImageProvider({
      apiKey: "fixture-api-key-redacted",
      model: "gpt-image-1.5",
      now: () => new Date("2026-05-01T00:00:00.000Z"),
      fetch: async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          authorization: init?.headers instanceof Headers
            ? init.headers.get("authorization") ?? undefined
            : ((init?.headers as Record<string, string>).authorization ?? (init?.headers as Record<string, string>).Authorization),
        });
        return new Response(JSON.stringify({
          data: [
            { b64_json: "AQID", revised_prompt: "revised sprite prompt", size: "1024x1024" },
          ],
          usage: { total_tokens: 42 },
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });

    const result = await provider.generateImage({
      prompt: "tiny knight sprite",
      count: 1,
      size: "1024x1024",
      quality: "medium",
      transparentBackground: true,
      outputFormat: "png",
      metadata: { userToken: "hidden", targetNativeSize: "64x64" },
    });

    expect(calls[0]).toMatchObject({
      url: "https://api.openai.com/v1/images/generations",
      authorization: "Bearer fixture-api-key-redacted",
    });
    expect(calls[0]?.body).toMatchObject({
      model: "gpt-image-1.5",
      prompt: "tiny knight sprite",
      n: 1,
      size: "1024x1024",
      quality: "medium",
      background: "transparent",
      output_format: "png",
    });
    expect(result.images[0]?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.images[0]?.provenance.settings).toMatchObject({
      targetNativeSize: "64x64",
      revisedPrompt: "revised sprite prompt",
      usageTotalTokens: 42,
    });
    expect(result.images[0]?.provenance.settings).not.toHaveProperty("userToken");
  });

  it("fails fast when an OpenAI adapter is created without a key", async () => {
    const provider = createOpenAiImageProvider({ apiKey: "" });

    await expect(provider.generateImage({ prompt: "sprite" })).rejects.toMatchObject({
      name: "AiProviderError",
      code: "missing_api_key",
    } satisfies Partial<AiProviderError>);
  });
});
