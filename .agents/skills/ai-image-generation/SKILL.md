---
name: ai-image-generation
description: Use when implementing or reviewing AI image generation integrations, provider adapters, prompt builders, OpenAI/other image API flows, generate-edit-fix workflows, API-key handling, provenance metadata, generated asset queues, or UI panels for creating sprites on demand. Do not use for local pixel-fixing algorithms unless the task involves generated-image handoff.
---

# AI Image Generation Integration Skill

## Mission

Let users generate sprite concepts, character sheets, props, tiles, and reference images on demand, then immediately run them through the pixel-fixing pipeline to produce true engine-ready pixel-art assets.

The AI integration should be provider-agnostic, safe with API keys, and clearly separated from the deterministic processing core.

## Non-negotiable rules

- Do not hardcode API keys.
- Do not expose server-side API keys in client-side bundles.
- Use provider adapters instead of scattering provider-specific calls across the app.
- Keep generated-image metadata: provider, model, prompt, parameters, timestamp, and source image IDs when available.
- Treat generated images as untrusted input; validate dimensions and file type before processing.
- Provide cancellation and progress/error states.
- Mock providers in tests; do not require paid API calls for CI.
- Check current official provider docs before implementing or changing live API calls.

## Provider adapter shape

Use a small interface:

```ts
export type AiImageProvider = {
  id: string;
  displayName: string;
  capabilities: {
    textToImage: boolean;
    imageEdit: boolean;
    imageVariation: boolean;
    transparentBackground?: boolean;
    seed?: boolean;
  };
  generateImage(request: GenerateImageRequest, signal?: AbortSignal): Promise<GeneratedImageResult>;
  editImage?(request: EditImageRequest, signal?: AbortSignal): Promise<GeneratedImageResult>;
};

export type GenerateImageRequest = {
  prompt: string;
  size?: string;
  count?: number;
  stylePreset?: string;
  negativePrompt?: string;
  transparentBackground?: boolean;
  metadata?: Record<string, unknown>;
};

export type GeneratedImageResult = {
  images: Array<{
    id: string;
    mimeType: string;
    bytes?: Uint8Array;
    url?: string;
    width?: number;
    height?: number;
    provenance: AiImageProvenance;
  }>;
};

export type AiImageProvenance = {
  provider: string;
  model?: string;
  prompt: string;
  parameters: Record<string, unknown>;
  createdAt: string;
};
```

## Key management

Choose one of these modes deliberately:

### Bring-your-own-key web mode

- User enters a key locally.
- Make clear where it is stored.
- Prefer session-only storage unless the user opts in.
- Warn that browser-side calls may expose keys depending on provider CORS/API design.

### Server/proxy mode

- Store provider keys only on the server.
- The web client calls your backend.
- Add rate limits and abuse protections.
- Never log full secrets.

### Desktop mode

- Use secure storage where available.
- Keep provider config per user.
- Do not check secrets into settings files.

## Prompt builder guidance

Provide structured prompt presets rather than one giant text field.

Possible controls:

- Asset type: hero, enemy, NPC, prop, item, tileset, UI icon.
- View: side, top-down, 3/4, isometric, front, back.
- Animation intent: idle, walk, attack, hurt, death.
- Palette style: limited palette, Game Boy-like, warm fantasy, etc.
- Target native size: 16x16, 24x24, 32x32, 48x48, 64x64.
- Sheet layout: single sprite, 4-frame row, 8-direction character sheet.
- Background: transparent or plain solid background.
- Cleanup target: strict palette, no anti-aliasing, clear silhouette.

Keep a final prompt preview so users understand what will be sent.

## Generate → fix workflow

The ideal flow:

```txt
Prompt panel
  -> Generate candidates
  -> Candidate browser
  -> Select candidate
  -> Auto-detect pseudo-grid
  -> Fix to native pixel art
  -> Adjust palette/grid/alpha
  -> Export or send to player/sandbox
```

Do not require users to manually download/re-upload generated images.

## Provenance and reproducibility

Store:

- Provider.
- Model.
- Prompt.
- Parameters.
- Seed if available.
- Source image references if used for editing.
- Fix settings applied after generation.
- Final output manifest.

This helps users reproduce, audit, and iterate on assets.

## UI expectations

AI generation should feel like a panel in a game-art tool:

- Prompt builder panel.
- Candidate gallery.
- Generation queue/status.
- Cost/usage indicator when available.
- Selected candidate preview.
- One-click “Fix this asset”.
- Provenance/details inspector.

Avoid making AI generation dominate the app. The core product is still the asset-fixing/editor/export tool.

## Testing expectations

Add tests for:

- Prompt builder output.
- Provider request mapping.
- Provider response parsing.
- Error states.
- Cancellation.
- Generated image validation.
- Mock generate → fix pipeline.
- Provenance stored in manifest.

Use mock providers in CI:

```ts
export const mockAiProvider: AiImageProvider = {
  id: 'mock',
  displayName: 'Mock Provider',
  capabilities: { textToImage: true, imageEdit: false, imageVariation: false },
  async generateImage(request) {
    return makeFixtureGeneratedImage(request);
  },
};
```

## Review checklist

Before considering an AI integration change complete, verify:

- No API keys are hardcoded or bundled accidentally.
- Provider code is isolated behind adapters.
- Tests do not require live API calls.
- Generated image provenance is captured.
- The handoff to the pixel-fixing pipeline is direct and validated.
- Errors, cancellation, and rate/cost concerns are visible to users.
- Current official provider docs were checked for live API behavior.
