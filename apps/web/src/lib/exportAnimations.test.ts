import { describe, expect, test } from "vitest";
import type { AnimationTag } from "@pixelaid/shared";
import { animationTagsToManifestAnimations } from "./exportAnimations";

describe("export animations", () => {
  test("converts detected row animation tags into manifest animations", () => {
    const tags: AnimationTag[] = [
      { name: "row_1", frameNames: ["row_1_000", "row_1_001"], fps: 10, loop: true },
      { name: "row_2", frameNames: ["row_2_000"], loop: false }
    ];

    expect(animationTagsToManifestAnimations(tags, { fallbackFps: 8, fallbackLoop: true })).toEqual({
      row_1: {
        frames: ["row_1_000", "row_1_001"],
        fps: 10,
        loop: true
      },
      row_2: {
        frames: ["row_2_000"],
        fps: 8,
        loop: false
      }
    });
  });

  test("omits empty animation tags", () => {
    expect(
      animationTagsToManifestAnimations([{ name: "empty", frameNames: [], loop: true }], {
        fallbackFps: 8,
        fallbackLoop: true
      })
    ).toEqual({});
  });

  test("exports animation playback direction when present", () => {
    const tags: AnimationTag[] = [
      { name: "shoot", frameNames: ["shoot_000", "shoot_001"], fps: 12, loop: false, direction: "ping-pong" }
    ];

    expect(animationTagsToManifestAnimations(tags, { fallbackFps: 8, fallbackLoop: true })).toEqual({
      shoot: {
        frames: ["shoot_000", "shoot_001"],
        fps: 12,
        loop: false,
        direction: "ping-pong"
      }
    });
  });

  test("uses fallback playback direction for animation tags without their own direction", () => {
    const tags: AnimationTag[] = [{ name: "walk", frameNames: ["walk_000"], fps: 8, loop: true }];

    expect(
      animationTagsToManifestAnimations(tags, { fallbackFps: 8, fallbackLoop: true, fallbackDirection: "reverse" })
    ).toEqual({
      walk: {
        frames: ["walk_000"],
        fps: 8,
        loop: true,
        direction: "reverse"
      }
    });
  });
});
