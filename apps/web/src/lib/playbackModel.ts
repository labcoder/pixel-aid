export type PlaybackState = {
  frameIndex: number;
  playing: boolean;
  fps: number;
  loop: boolean;
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

export function tickPlayback({
  frameCount,
  frameIndex,
  accumulatorMs,
  deltaMs,
  fps,
  loop,
  frames
}: {
  frameCount: number;
  frameIndex: number;
  accumulatorMs: number;
  deltaMs: number;
  fps: number;
  loop: boolean;
  frames?: PlaybackFrameTiming[];
}): { frameIndex: number; accumulatorMs: number; playing: boolean } {
  if (frameCount <= 0) {
    return { frameIndex: -1, accumulatorMs: 0, playing: false };
  }

  let currentIndex = scrubPlayback({ frameCount, frameIndex });
  let remainingMs = Math.max(0, accumulatorMs + deltaMs);
  let playing = true;

  while (playing && remainingMs >= getFrameDurationMs(frames?.[currentIndex], fps)) {
    remainingMs -= getFrameDurationMs(frames?.[currentIndex], fps);
    const stepped = stepPlaybackFrame({ frameCount, frameIndex: currentIndex, direction: 1, loop });
    currentIndex = stepped.frameIndex;
    playing = stepped.playing;
  }

  return {
    frameIndex: currentIndex,
    accumulatorMs: playing ? remainingMs : 0,
    playing
  };
}
