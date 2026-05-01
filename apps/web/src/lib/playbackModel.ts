export type PlaybackDirection = "forward" | "reverse" | "ping-pong" | "hold";
export type PlaybackStepDirection = -1 | 1;

export type PlaybackState = {
  frameIndex: number;
  playing: boolean;
  fps: number;
  loop: boolean;
  direction: PlaybackDirection;
  playDirection: PlaybackStepDirection;
  accumulatorMs: number;
};

export type PlaybackFrameTiming = {
  durationMs?: number;
};

export function getInitialPlaybackState(frameCount: number): PlaybackState {
  return {
    frameIndex: frameCount > 0 ? 0 : -1,
    playing: false,
    fps: 8,
    loop: true,
    direction: "forward",
    playDirection: 1,
    accumulatorMs: 0
  };
}

export function clampFps(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }

  return Math.max(1, Math.min(60, Math.round(value)));
}

export function getFrameDurationMs(frame: PlaybackFrameTiming | undefined, fps: number): number {
  if (frame?.durationMs && frame.durationMs > 0) {
    return frame.durationMs;
  }

  return 1000 / clampFps(fps);
}

export function scrubPlayback({ frameCount, frameIndex }: { frameCount: number; frameIndex: number }): number {
  if (frameCount <= 0) {
    return -1;
  }

  return Math.max(0, Math.min(frameCount - 1, Math.round(frameIndex)));
}

export function stepPlaybackFrame({
  frameCount,
  frameIndex,
  direction,
  loop
}: {
  frameCount: number;
  frameIndex: number;
  direction: -1 | 1;
  loop: boolean;
}): { frameIndex: number; playing: boolean } {
  if (frameCount <= 0) {
    return { frameIndex: -1, playing: false };
  }

  const nextIndex = frameIndex + direction;
  if (nextIndex >= 0 && nextIndex < frameCount) {
    return { frameIndex: nextIndex, playing: true };
  }

  if (loop) {
    return { frameIndex: direction > 0 ? 0 : frameCount - 1, playing: true };
  }

  return { frameIndex: direction > 0 ? frameCount - 1 : 0, playing: false };
}

export function getInitialPlayDirection(direction: PlaybackDirection): PlaybackStepDirection {
  return direction === "reverse" ? -1 : 1;
}

export function tickPlayback({
  frameCount,
  frameIndex,
  accumulatorMs,
  deltaMs,
  fps,
  loop,
  direction = "forward",
  playDirection = getInitialPlayDirection(direction),
  frames
}: {
  frameCount: number;
  frameIndex: number;
  accumulatorMs: number;
  deltaMs: number;
  fps: number;
  loop: boolean;
  direction?: PlaybackDirection;
  playDirection?: PlaybackStepDirection;
  frames?: PlaybackFrameTiming[];
}): { frameIndex: number; accumulatorMs: number; playDirection: PlaybackStepDirection; playing: boolean } {
  if (frameCount <= 0) {
    return { frameIndex: -1, accumulatorMs: 0, playDirection, playing: false };
  }

  let currentIndex = scrubPlayback({ frameCount, frameIndex });
  let remainingMs = Math.max(0, accumulatorMs + deltaMs);
  let currentPlayDirection = direction === "reverse" ? -1 : playDirection;
  let playing = true;

  if (direction === "hold") {
    const durationMs = getFrameDurationMs(frames?.[currentIndex], fps);
    if (remainingMs < durationMs) {
      return { frameIndex: currentIndex, accumulatorMs: remainingMs, playDirection: currentPlayDirection, playing };
    }

    return {
      frameIndex: currentIndex,
      accumulatorMs: loop ? remainingMs % durationMs : 0,
      playDirection: currentPlayDirection,
      playing: loop
    };
  }

  if (frameCount === 1) {
    const durationMs = getFrameDurationMs(frames?.[0], fps);
    if (remainingMs < durationMs) {
      return { frameIndex: 0, accumulatorMs: remainingMs, playDirection: currentPlayDirection, playing };
    }

    return {
      frameIndex: 0,
      accumulatorMs: loop ? remainingMs % durationMs : 0,
      playDirection: currentPlayDirection,
      playing: loop
    };
  }

  while (playing && remainingMs >= getFrameDurationMs(frames?.[currentIndex], fps)) {
    remainingMs -= getFrameDurationMs(frames?.[currentIndex], fps);
    const stepped = stepDirectedPlaybackFrame({
      frameCount,
      frameIndex: currentIndex,
      direction,
      playDirection: currentPlayDirection,
      loop
    });
    currentIndex = stepped.frameIndex;
    currentPlayDirection = stepped.playDirection;
    playing = stepped.playing;
  }

  return {
    frameIndex: currentIndex,
    accumulatorMs: playing ? remainingMs : 0,
    playDirection: currentPlayDirection,
    playing
  };
}

function stepDirectedPlaybackFrame({
  frameCount,
  frameIndex,
  direction,
  playDirection,
  loop
}: {
  frameCount: number;
  frameIndex: number;
  direction: PlaybackDirection;
  playDirection: PlaybackStepDirection;
  loop: boolean;
}): { frameIndex: number; playDirection: PlaybackStepDirection; playing: boolean } {
  if (direction !== "ping-pong") {
    if (direction === "hold") {
      return { frameIndex, playDirection, playing: true };
    }

    const stepDirection = direction === "reverse" ? -1 : 1;
    const stepped = stepPlaybackFrame({ frameCount, frameIndex, direction: stepDirection, loop });
    return { ...stepped, playDirection: stepDirection };
  }

  const nextIndex = frameIndex + playDirection;
  if (nextIndex >= 0 && nextIndex < frameCount) {
    return { frameIndex: nextIndex, playDirection, playing: true };
  }

  if (playDirection > 0) {
    return { frameIndex: frameCount - 2, playDirection: -1, playing: true };
  }

  if (!loop) {
    return { frameIndex: 0, playDirection: -1, playing: false };
  }

  return { frameIndex: 1, playDirection: 1, playing: true };
}
