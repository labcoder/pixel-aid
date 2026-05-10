# @pixelaid/ai

`@pixelaid/ai` contains optional AI-image provider adapters, prompt helpers, generated-image validation, and provenance helpers for PixelAid.

This package stays separate from `@pixelaid/core`. PixelAid cleanup, export, CLI, MCP, local HTTP, and editor workflows must keep working without API keys, network calls, provider SDKs, or live image-generation services.

## Status

WIP and optional. The package has a mock provider for tests, a prompt builder, generated-image validation, provenance sanitization, and an OpenAI image-generation adapter that uses caller-supplied `fetch` and API keys. It is not wired into the main editor as an end-user generation panel yet, and it is not required for local cleanup/export workflows.

Use this package for adapter-level development and tests. Do not make other PixelAid packages depend on live provider access.

## Commands

From the repo root:

```sh
npm run test -w @pixelaid/ai
npm run build -w @pixelaid/ai
npm run typecheck -w @pixelaid/ai
```

From `packages/ai`:

```sh
npm run test
npm run build
npm run typecheck
```

## Current Entrypoints

- `buildPixelArtPrompt`: builds constrained pixel-art prompts from structured asset requests.
- `createMockAiImageProvider`: returns deterministic generated-image records for tests.
- `createOpenAiImageProvider`: creates an OpenAI image-generation adapter using an injected or global `fetch` implementation.
- `validateGeneratedImage`: checks generated MIME type, payload presence, and byte-size limits before cleanup/import.
- `AiProviderError`: typed adapter error for missing keys, provider failures, and invalid responses.

## Security Rules

- API keys are supplied by the caller and are never stored by this package.
- Do not hardcode API keys or include them in tests, fixtures, logs, diagnostics, or committed config.
- Provider SDKs are not required. The OpenAI adapter uses `fetch`.
- Tests use mock providers only and do not make paid or networked API calls.
- Secret-like metadata keys and values are filtered before PixelAid copies settings into asset provenance.
- Treat generated images as untrusted input. Validate the payload before decoding or routing it through cleanup.

## OpenAI Adapter

`createOpenAiImageProvider` maps PixelAid's `GenerateImageRequest` to an OpenAI image generation request with fields such as `prompt`, `model`, `n`, `size`, `quality`, `background`, and `output_format`. The adapter records provider, model, prompt, generation timestamp, safe settings, revised prompt, and token usage in PixelAid provenance when the provider returns those fields.

The adapter is intentionally narrow: it currently implements text-to-image generation only. Image editing and variation support can be added behind the same provider interface later.

## Generate To Fix Workflow

The intended product flow is:

1. Build a constrained pixel-art prompt with `buildPixelArtPrompt`.
2. Generate one or more candidates through a provider adapter.
3. Validate each generated image payload.
4. Decode/import the image in the caller.
5. Run the normal PixelAid fix/export pipeline.
6. Pass generated-image provenance into the manifest/export layer.

The generated image should go through the same deterministic PixelAid cleanup path as any imported source image.

## Development Notes

- Keep provider-specific code behind `AiImageProvider`.
- Keep cancellation support on provider calls through `AbortSignal`.
- Check current official provider documentation before changing live provider request fields or response parsing.
- Keep prompt builder output direct and testable.
- Add mock-provider tests for new provider features before adding live-provider behavior.
