---
name: canvas-performance
description: Use when implementing, reviewing, or optimizing visual rendering, preview viewports, canvas layers, worker/offscreen rendering, sprite animation playback, or performance instrumentation. Applies to Canvas2D, OffscreenCanvas, WebGL, Three.js preview surfaces, zoom/pan rendering, dirty-region drawing, and avoiding React render bottlenecks. Do not use for pure algorithm work unless rendering performance is involved.
---

# Canvas and Rendering Performance Skill

## Mission

Keep the app feeling like a professional game-engine or art-tool editor: responsive panels, smooth viewports, sharp pixel previews, fast animation playback, and no UI stalls during heavy image processing.

## Non-negotiable rules

- React should own editor state and panel composition, not per-pixel rendering.
- Never render thousands of pixels, frames, or tiles as React elements.
- Draw image previews with Canvas2D, OffscreenCanvas, WebGL, or Three.js.
- Use `imageSmoothingEnabled = false` for pixel-art preview scaling.
- Use integer zoom levels or carefully snapped transforms for true pixel-art views.
- Use `requestAnimationFrame` for viewport animation and playback.
- Avoid re-rendering the canvas unless inputs changed or playback advanced.
- Move heavy image processing off the main thread.
- Transfer buffers when possible instead of copying them.
- Instrument performance before claiming something is fast.

## Editor rendering architecture

Use a layered model:

```txt
React app shell
  Panels, menus, inspector controls, project tree, tabs

Viewport controller
  Owns camera, zoom, pan, selection state, dirty flags

Renderer
  Canvas2D / OffscreenCanvas / WebGL / Three.js adapter

Worker pipeline
  Pixel processing, slicing, quantization, export preparation
```

React state may describe what should be shown. It should not directly paint every visual detail.

## Viewport requirements

The main preview/editor viewport should support:

- Sharp nearest-neighbor zoom.
- Pan/zoom without blurring.
- Grid overlay that can be toggled.
- Checkerboard transparency background.
- Before/after split view.
- Native-size readout.
- Zoom readout.
- Color count readout.
- Optional detected pseudo-grid overlay.
- Optional frame bounds and pivot overlays.

## Canvas2D guidance

When rendering true pixel art:

```ts
ctx.imageSmoothingEnabled = false;
ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, snappedX, snappedY);
ctx.drawImage(sourceCanvas, 0, 0);
```

Practical rules:

- Account for `devicePixelRatio`.
- Snap camera translation to avoid subpixel blur when in pixel-perfect mode.
- Keep source canvases at native asset resolution.
- Use cached offscreen buffers for expensive overlays.
- Rebuild overlays only when their inputs change.
- Clear only the needed area when using dirty rectangles, or clear full viewport when that is simpler and still fast.

## Worker and OffscreenCanvas guidance

Use workers for:

- Grid detection.
- Downsampling.
- Quantization.
- Batch frame processing.
- Large export preparation.

Use OffscreenCanvas when it improves responsiveness, but always provide a fallback path.

Message design:

```ts
type WorkerRequest =
  | { type: 'fix-image'; requestId: string; image: TransferableImage; options: PixelFixOptions }
  | { type: 'slice-sheet'; requestId: string; image: TransferableImage; options: SliceOptions }
  | { type: 'cancel'; requestId: string };

type WorkerResponse =
  | { type: 'progress'; requestId: string; percent: number; stage: string }
  | { type: 'result'; requestId: string; result: unknown; transfer?: Transferable[] }
  | { type: 'error'; requestId: string; message: string };
```

Transfer `ArrayBuffer`s where possible:

```ts
worker.postMessage(payload, [payload.image.data.buffer]);
```

Be careful: transferred buffers are detached from the sender. Clone only when the sender must retain ownership.

## Dirty rendering model

Use explicit invalidation:

```ts
viewport.invalidate('image-changed');
viewport.invalidate('camera-changed');
viewport.invalidate('overlay-changed');
```

Only schedule one pending frame:

```ts
if (!rafPending) {
  rafPending = true;
  requestAnimationFrame(render);
}
```

Inside `render`, clear `rafPending`, draw current state, and only request another frame for playback, animated overlays, or active camera gestures.

## Sprite animation playback

For the future sprite player:

- Decode all frames once.
- Use a single atlas texture/canvas when possible.
- Advance frames using accumulated elapsed time and each frame's `durationMs`.
- Do not use `setInterval` for animation playback.
- Use `requestAnimationFrame` and skip work if the selected frame did not change.
- Render pivot, collision boxes, and guides as separate overlays.

## Three.js sandbox guidance

For a 2D/3D sprite sandbox:

- Use nearest filtering on sprite textures.
- Disable mipmaps for pixel-art textures unless intentionally testing distance behavior.
- Reuse textures and materials.
- Dispose Three.js resources when assets are removed.
- Keep editor UI state separate from scene objects.
- Avoid recreating geometry/materials every frame.
- Use a thin adapter so the rest of the app does not become tightly coupled to Three.js.

## Performance instrumentation

Add lightweight metrics:

- Last render duration.
- Average render duration over N frames.
- Worker job duration.
- Memory estimates for image buffers.
- FPS during playback/sandbox mode.
- Number of canvas redraws triggered per second.

In dev mode, expose a performance panel or overlay. In production, keep it hidden unless enabled.

## Common anti-patterns to reject

- Rendering pixels as `<div>` elements.
- Recomputing processed image data on every React render.
- Storing massive `Uint8ClampedArray`s in React state when a ref/store would work better.
- Calling `getImageData` repeatedly during active animation.
- Creating new canvases or textures every frame.
- Using CSS transforms that blur pixel-art previews without an explicit reason.
- Running quantization on the main thread for large images.
- Updating the full React tree for every playback frame.

## Review checklist

Before considering a rendering change complete, verify:

- Pixel-art previews remain sharp at all intended zoom levels.
- Heavy processing does not block panel interactions.
- Playback uses `requestAnimationFrame`.
- The renderer avoids per-frame allocations in hot paths.
- Offscreen/worker paths have a fallback if required.
- The viewport redraws only when necessary.
- Performance metrics were used to validate the change.
