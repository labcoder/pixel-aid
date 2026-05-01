# @pixelaid/ai

Optional AI-image provider adapters for PixelAid.

This package is intentionally separate from `@pixelaid/core`. PixelAid cleanup, export, CLI, MCP, and local HTTP workflows must keep working without API keys, network calls, provider SDKs, or live image-generation services.

## Security Rules

- API keys are supplied by the caller and are never stored by this package.
- Provider SDKs are not required; the OpenAI adapter uses an injected `fetch` implementation.
- Tests use mock providers only and do not make paid or networked API calls.
- Secret-like metadata keys and values are filtered before being copied into PixelAid provenance.
- Generated images should be validated with `validateGeneratedImage` before they are decoded or routed through cleanup.

## OpenAI Adapter

`createOpenAiImageProvider` targets the OpenAI Image API generation endpoint with the documented `prompt`, `model`, `n`, `size`, `quality`, `background`, and `output_format` request fields. The adapter records provider, model, prompt, generated timestamp, safe settings, revised prompt, and token usage in PixelAid provenance.

Sources checked while implementing:

- https://platform.openai.com/docs/guides/images/image-generation
- https://platform.openai.com/docs/api-reference/images/createimage_api_params

## Generate To Fix

The expected workflow is:

1. Build a constrained pixel-art prompt with `buildPixelArtPrompt`.
2. Generate one or more candidates through a provider adapter.
3. Validate each generated image payload.
4. Decode/import the image in the caller.
5. Run the normal PixelAid fix/export pipeline.
6. Pass the generated image `provenance` into the manifest/export layer.
