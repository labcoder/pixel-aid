---
name: sprite-player-sandbox
description: Use when implementing or reviewing the future sprite sheet player, animation preview controls, controllable character sandbox, scene preview, 2D test arena, or Three.js-based 3D sprite/object sandbox. Applies to playback timing, input controls, camera, sprite billboarding, texture filtering, scene setup, performance, and validating assets in motion. Do not use for the pixel-fixing algorithms unless the task involves visual playback or sandbox validation.
---

# Sprite Player and Sandbox Skill

## Mission

Let users validate that fixed sprites actually work as game assets: play animations, inspect timing, control a character in a test arena, and preview sprites or objects inside 2D/3D scenes.

This feature should feel like a lightweight game-engine preview panel, not a toy slideshow.

## Non-negotiable rules

- Use the generic sprite manifest as the source of animation truth.
- Preserve native pixel appearance with nearest filtering.
- Use `requestAnimationFrame` for playback.
- Do not update the React tree for every animation frame.
- Reuse textures, canvases, materials, and geometry.
- Keep player/sandbox code separate from the image-processing core.
- Make playback deterministic enough to test.
- Make input mappings explicit and configurable.

## Sprite player features

Minimum useful player:

- Animation selector.
- Play/pause.
- Step previous/next frame.
- Speed multiplier.
- Loop toggle.
- Native-size and zoom controls.
- Pivot overlay.
- Frame bounds overlay.
- Onion-skin previous/next frame option.
- Timeline scrubber.
- Per-frame duration display.

Playback rules:

- Use `durationMs` when present.
- If only FPS exists, derive `durationMs = 1000 / fps`.
- Use an accumulated-time loop rather than `setInterval`.
- Handle variable frame durations.
- Support loop, no-loop, reverse, and ping-pong when defined.

Pseudo-logic:

```ts
let accumulator = 0;
let lastTime = performance.now();

function tick(now: number) {
  const dt = (now - lastTime) * speed;
  lastTime = now;
  accumulator += dt;

  while (accumulator >= currentFrame.durationMs) {
    accumulator -= currentFrame.durationMs;
    advanceFrame();
  }

  renderer.draw(currentFrame);
  if (playing) requestAnimationFrame(tick);
}
```

## Controllable 2D sandbox

Goal: let users answer “does this sprite feel usable in a game?”

Support:

- Place character or object in a simple 2D test level.
- Keyboard input.
- Optional gamepad input later.
- Movement speed control.
- Basic direction-to-animation mapping.
- Camera follow toggle.
- Ground/grid background.
- Collision bounds overlay if metadata exists.
- Export/import sandbox presets later.

Do not build a full game engine. Keep this as an asset validation tool.

## Three.js 3D sandbox

Goal: preview sprites in a 3D-ish or 2.5D scene.

Support:

- Sprite as billboard or plane.
- Nearest texture filtering.
- Optional fixed camera-facing billboard mode.
- Basic grid floor.
- Orbit/pan camera controls.
- Neutral lighting/background presets.
- Scale controls.
- Preview with other reference objects.
- Dispose textures/materials/geometries on asset removal.

Texture rules:

- Disable smoothing.
- Avoid unwanted mipmaps for pixel-art previews unless the user is explicitly testing distance rendering.
- Keep texture updates batched.
- Avoid recreating textures every playback frame; prefer atlas UV changes or cached frame textures.

## Scene architecture

Keep a thin adapter layer:

```txt
SpriteManifest
  -> PlaybackModel
    -> RendererAdapter
      -> Canvas2DRenderer
      -> ThreeSpriteRenderer
```

The app should be able to use the same animation model in the 2D player and 3D sandbox.

## Input mapping

Represent controls as data:

```ts
export type SandboxControls = {
  moveLeft: string[];
  moveRight: string[];
  moveUp: string[];
  moveDown: string[];
  action: string[];
  playPause: string[];
};
```

Map movement to animation tags when possible:

```txt
idle_down, idle_up, idle_left, idle_right
walk_down, walk_up, walk_left, walk_right
attack_down, attack_up, attack_left, attack_right
```

If tags are missing, show a warning and let the user map animations manually.

## Performance expectations

- Use one render loop per active viewport.
- Stop render loops for hidden/inactive panels.
- Reuse buffers and textures.
- Do not recreate materials or canvases each frame.
- Avoid frequent `getImageData` calls during playback.
- Use atlas drawing when possible.
- Keep overlays cached and redraw only when needed.

## Testing expectations

Add tests for:

- Animation timing with variable frame durations.
- Loop/no-loop behavior.
- Ping-pong playback if supported.
- Frame stepping.
- Tag-to-animation mapping.
- Playback model independent from renderer.
- Sandbox input state transitions.

Manual QA should verify:

- The sprite remains sharp at all zoom levels.
- Playback does not stutter with large sheets.
- The sandbox stops rendering when hidden.
- Three.js resources are disposed when scenes are reset.

## Review checklist

Before considering a player/sandbox change complete, verify:

- Playback uses manifest frame timing.
- Rendering is sharp and nearest-filtered.
- React is not re-rendering every frame.
- The playback model is testable without a renderer.
- Input controls are configurable.
- 2D and 3D preview code does not leak into the core processing package.
