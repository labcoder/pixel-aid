import type { PixelAssetManifest } from "@pixelaid/shared";
import type { EngineExportBundle, EngineExportWarning } from "./engineTypes";
import { collectCommonEngineWarnings } from "./engineWarnings";

const GODOT_IMPORTER_PATH = "godot/PixelAidSpriteFramesImporter.gd";
const GODOT_README_PATH = "godot/README.md";
const DEFAULT_SPRITEFRAMES_RESOURCE_PATH = "res://pixelaid_spriteframes.tres";

export function createGodotImportExport(
  manifest: PixelAssetManifest,
  texturePath = `res://art/${manifest.meta.image}`
): EngineExportBundle {
  return {
    files: [
      { path: GODOT_README_PATH, kind: "text", contents: createGodotReadme(manifest, texturePath) },
      { path: GODOT_IMPORTER_PATH, kind: "text", contents: createGodotImporterScript(manifest, texturePath) }
    ],
    warnings: [...collectCommonEngineWarnings(manifest, "godot"), ...collectGodotWarnings(manifest)]
  };
}

function createGodotReadme(manifest: PixelAssetManifest, texturePath: string): string {
  return [
    "# Godot Import",
    "",
    `Image: \`${manifest.meta.image}\``,
    `Expected texture path: \`${texturePath}\``,
    `Generated helper: \`${GODOT_IMPORTER_PATH}\``,
    "",
    "1. Copy the PixelAid PNG into your Godot project at the expected texture path, or edit the helper constant.",
    "2. Select the PNG in Godot and set texture filtering to Nearest.",
    "3. Use lossless import/compression for pixel art.",
    "4. Disable mipmaps unless this asset is intentionally viewed at distance or steep camera angles.",
    "5. Run `PixelAidSpriteFramesImporter.gd` from the editor to create `res://pixelaid_spriteframes.tres`.",
    "",
    "The helper embeds frame rectangles, pivots, durations, and animation tags generated from the PixelAid manifest.",
    "Godot `SpriteFrames` do not apply per-frame pivots directly; the helper stores them as `pixelaid_pivot` metadata on each atlas texture.",
    ""
  ].join("\n");
}

function createGodotImporterScript(manifest: PixelAssetManifest, texturePath: string): string {
  return [
    "@tool",
    "extends EditorScript",
    "",
    `const PIXELAID_TEXTURE_PATH := ${toGodotString(texturePath)}`,
    `const PIXELAID_OUTPUT_PATH := ${toGodotString(DEFAULT_SPRITEFRAMES_RESOURCE_PATH)}`,
    `const PIXELAID_FRAMES := ${serializeGodotFrames(manifest)}`,
    `const PIXELAID_ANIMATIONS := ${serializeGodotAnimations(manifest)}`,
    "",
    "func _run() -> void:",
    "    var texture: Texture2D = load(PIXELAID_TEXTURE_PATH)",
    "    if texture == null:",
    "        push_error(\"PixelAid texture not found: %s\" % PIXELAID_TEXTURE_PATH)",
    "        return",
    "    var sprite_frames := SpriteFrames.new()",
    "    for animation_name in PIXELAID_ANIMATIONS.keys():",
    "        var animation: Dictionary = PIXELAID_ANIMATIONS[animation_name]",
    "        if sprite_frames.has_animation(animation_name):",
    "            sprite_frames.clear(animation_name)",
    "        else:",
    "            sprite_frames.add_animation(animation_name)",
    "        sprite_frames.set_animation_loop(animation_name, animation.get(\"loop\", true))",
    "        sprite_frames.set_animation_speed(animation_name, max(0.001, float(animation.get(\"fps\", 8))))",
    "        for frame_name in _ordered_frame_names(animation):",
    "            var frame := _find_frame(frame_name)",
    "            if frame.is_empty():",
    "                push_warning(\"Missing PixelAid frame: %s\" % frame_name)",
    "                continue",
    "            var atlas := _create_atlas_texture(texture, frame)",
    "            var duration_seconds := max(0.001, float(frame.get(\"duration_ms\", 120)) / 1000.0)",
    "            sprite_frames.add_frame(animation_name, atlas, duration_seconds)",
    "    sprite_frames.set_meta(\"pixelaid_texture_path\", PIXELAID_TEXTURE_PATH)",
    "    sprite_frames.set_meta(\"pixelaid_frame_count\", PIXELAID_FRAMES.size())",
    "    var save_error := ResourceSaver.save(sprite_frames, PIXELAID_OUTPUT_PATH)",
    "    if save_error != OK:",
    "        push_error(\"Could not save PixelAid SpriteFrames resource: %s\" % error_string(save_error))",
    "        return",
    "    print(\"Saved PixelAid SpriteFrames resource to %s\" % PIXELAID_OUTPUT_PATH)",
    "",
    "func _create_atlas_texture(texture: Texture2D, frame: Dictionary) -> AtlasTexture:",
    "    var rect: Dictionary = frame.get(\"rect\", {})",
    "    var pivot: Dictionary = frame.get(\"pivot\", {})",
    "    var atlas := AtlasTexture.new()",
    "    atlas.atlas = texture",
    "    atlas.region = Rect2(rect.get(\"x\", 0), rect.get(\"y\", 0), rect.get(\"w\", 1), rect.get(\"h\", 1))",
    "    atlas.set_meta(\"pixelaid_pivot\", Vector2(pivot.get(\"x\", 0), pivot.get(\"y\", 0)))",
    "    atlas.set_meta(\"pixelaid_duration_ms\", frame.get(\"duration_ms\", 120))",
    "    atlas.set_meta(\"pixelaid_frame_name\", frame.get(\"name\", \"\"))",
    "    return atlas",
    "",
    "func _ordered_frame_names(animation: Dictionary) -> Array:",
    "    var frames := Array(animation.get(\"frames\", []))",
    "    if animation.get(\"direction\", \"forward\") == \"reverse\":",
    "        frames.reverse()",
    "    return frames",
    "",
    "func _find_frame(frame_name: String) -> Dictionary:",
    "    for frame in PIXELAID_FRAMES:",
    "        if frame.get(\"name\", \"\") == frame_name:",
    "            return frame",
    "    return {}",
    ""
  ].join("\n");
}

function serializeGodotFrames(manifest: PixelAssetManifest): string {
  const frames = manifest.frames.map(
    (frame) =>
      `{${[
        `"name": ${toGodotString(frame.name)}`,
        `"rect": ${serializeGodotRect(frame.rect)}`,
        `"pivot": {"x": ${frame.pivot.x}, "y": ${frame.pivot.y}}`,
        `"duration_ms": ${frame.durationMs}`
      ].join(", ")}}`
  );

  return `[${frames.join(", ")}]`;
}

function serializeGodotAnimations(manifest: PixelAssetManifest): string {
  const animations = Object.entries(manifest.animations);
  if (animations.length === 0) {
    const frameNames = manifest.frames.map((frame) => frame.name);
    return `{${toGodotString("default")}: ${serializeGodotAnimation({
      frames: frameNames,
      fps: 8,
      loop: true,
      direction: "forward"
    })}}`;
  }

  return `{${animations
    .map(([animationName, animation]) => `${toGodotString(animationName)}: ${serializeGodotAnimation(animation)}`)
    .join(", ")}}`;
}

function serializeGodotAnimation(animation: {
  frames: readonly string[];
  fps?: number;
  loop: boolean;
  direction?: "forward" | "reverse" | "ping-pong";
}): string {
  const fps = animation.fps ?? 8;
  const direction = animation.direction ?? "forward";
  return `{${[
    `"frames": [${animation.frames.map(toGodotString).join(", ")}]`,
    `"fps": ${fps}`,
    `"loop": ${animation.loop ? "true" : "false"}`,
    `"direction": ${toGodotString(direction)}`
  ].join(", ")}}`;
}

function serializeGodotRect(rect: { x: number; y: number; w: number; h: number }): string {
  return `{"x": ${rect.x}, "y": ${rect.y}, "w": ${rect.w}, "h": ${rect.h}}`;
}

function collectGodotWarnings(manifest: PixelAssetManifest): EngineExportWarning[] {
  const warnings: EngineExportWarning[] = [];

  if (manifest.frames.some((frame) => frame.pivot.x !== Math.floor(frame.rect.w / 2) || frame.pivot.y !== frame.rect.h)) {
    warnings.push({
      target: "godot",
      code: "engine-godot-pivots-script-required",
      severity: "warning",
      message:
        "Godot SpriteFrames do not apply per-frame pivots directly; the helper stores manifest pivots as frame metadata for gameplay scripts."
    });
  }

  if (Object.values(manifest.animations).some((animation) => animation.direction && animation.direction !== "forward")) {
    warnings.push({
      target: "godot",
      code: "engine-godot-animation-direction",
      severity: "warning",
      message:
        "Godot helper stores animation names, loops, speed, and frame order; reverse or ping-pong playback still needs project script handling."
    });
  }

  return warnings;
}

function toGodotString(value: string): string {
  return JSON.stringify(value);
}
