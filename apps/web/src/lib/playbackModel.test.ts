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
      playDirection: 1,
      playing: true
    });
  });

  test("ticks in reverse direction", () => {
    const next = tickPlayback({
      frameCount: 4,
      frameIndex: 3,
      accumulatorMs: 0,
      deltaMs: 110,
      fps: 10,
      loop: true,
      direction: "reverse",
      playDirection: -1
    });

    expect(next).toEqual({
      frameIndex: 2,
      accumulatorMs: 10,
      playDirection: -1,
      playing: true
    });
  });

  test("bounces at the ends in ping-pong direction", () => {
    const next = tickPlayback({
      frameCount: 4,
      frameIndex: 3,
      accumulatorMs: 0,
      deltaMs: 110,
      fps: 10,
      loop: true,
      direction: "ping-pong",
      playDirection: 1
    });

    expect(next).toEqual({
      frameIndex: 2,
      accumulatorMs: 10,
      playDirection: -1,
      playing: true
    });
  });

  test("stops ping-pong playback after returning to the first frame when loop is disabled", () => {
    const next = tickPlayback({
      frameCount: 3,
      frameIndex: 1,
      accumulatorMs: 0,
      deltaMs: 220,
      fps: 10,
      loop: false,
      direction: "ping-pong",
      playDirection: -1
    });

    expect(next).toEqual({
      frameIndex: 0,
      accumulatorMs: 0,
      playDirection: -1,
      playing: false
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
