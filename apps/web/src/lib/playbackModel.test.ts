import { describe, expect, test } from "vitest";
import {
  clampFps,
  getFrameDurationMs,
  getInitialPlaybackState,
  scrubPlayback,
  stepPlaybackFrame,
  tickPlayback
} from "./playbackModel";

describe("playback model", () => {
  test("steps frames forward and backward with loop wrapping", () => {
    expect(stepPlaybackFrame({ frameCount: 4, frameIndex: 3, direction: 1, loop: true })).toEqual({
      frameIndex: 0,
      playing: true
    });
    expect(stepPlaybackFrame({ frameCount: 4, frameIndex: 0, direction: -1, loop: true })).toEqual({
      frameIndex: 3,
      playing: true
    });
  });

  test("stops at the final frame when loop is disabled", () => {
    expect(stepPlaybackFrame({ frameCount: 4, frameIndex: 3, direction: 1, loop: false })).toEqual({
      frameIndex: 3,
      playing: false
    });
  });

  test("advances by elapsed time and keeps leftover accumulator", () => {
    const next = tickPlayback({
      frameCount: 4,
      frameIndex: 0,
      accumulatorMs: 0,
      deltaMs: 260,
      fps: 10,
      loop: true
    });

    expect(next).toEqual({
      frameIndex: 2,
      accumulatorMs: 60,
      playing: true
    });
  });

  test("clamps scrub and fps values", () => {
    expect(scrubPlayback({ frameCount: 4, frameIndex: 99 })).toBe(3);
    expect(scrubPlayback({ frameCount: 0, frameIndex: 2 })).toBe(-1);
    expect(clampFps(0)).toBe(1);
    expect(clampFps(99)).toBe(60);
  });

  test("uses frame duration before fps fallback", () => {
    expect(getFrameDurationMs({ durationMs: 80 }, 12)).toBe(80);
    expect(getFrameDurationMs({}, 20)).toBe(50);
    expect(getInitialPlaybackState(3)).toMatchObject({
      frameIndex: 0,
      playing: false,
      fps: 8,
      loop: true
    });
  });
});
