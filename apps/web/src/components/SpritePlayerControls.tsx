import type { AnimationTag } from "@pixelaid/shared";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { ALL_ANIMATIONS } from "../lib/animationTimeline";
import type { PlaybackDirection } from "../lib/playbackModel";

export type SpritePlayerControlsProps = {
  animations: readonly AnimationTag[];
  selectedAnimationName: string;
  canPlay: boolean;
  canScrub: boolean;
  isPlaying: boolean;
  timelinePosition: number;
  frameCount: number;
  playbackFps: number;
  playbackDirection: PlaybackDirection;
  playbackLoop: boolean;
  normalizeTimelineFrames: boolean;
  showOnionSkin: boolean;
  currentFrameDurationMs: number;
  currentFrameDurationInput: number;
  currentFrameSelected: boolean;
  onAnimationChange: (name: string) => void;
  onStep: (direction: -1 | 1) => void;
  onTogglePlayback: () => void;
  onScrub: (position: number) => void;
  onFpsChange: (fps: number) => void;
  onDirectionChange: (direction: PlaybackDirection) => void;
  onDurationChange: (durationMs: number) => void;
  onLoopChange: (loop: boolean) => void;
  onNormalizeChange: (enabled: boolean) => void;
  onOnionSkinChange: (enabled: boolean) => void;
};

export function SpritePlayerControls({
  animations,
  selectedAnimationName,
  canPlay,
  canScrub,
  isPlaying,
  timelinePosition,
  frameCount,
  playbackFps,
  playbackDirection,
  playbackLoop,
  normalizeTimelineFrames,
  showOnionSkin,
  currentFrameDurationMs,
  currentFrameDurationInput,
  currentFrameSelected,
  onAnimationChange,
  onStep,
  onTogglePlayback,
  onScrub,
  onFpsChange,
  onDirectionChange,
  onDurationChange,
  onLoopChange,
  onNormalizeChange,
  onOnionSkinChange
}: SpritePlayerControlsProps) {
  return (
    <div className="player-controls" aria-label="Sprite playback controls">
      {animations.length > 0 ? (
        <label className="player-number">
          <span>Clip</span>
          <select value={selectedAnimationName} onChange={(event) => onAnimationChange(event.currentTarget.value)}>
            <option value={ALL_ANIMATIONS}>All rows</option>
            {animations.map((animation) => (
              <option key={animation.name} value={animation.name}>
                {animation.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button type="button" disabled={!canPlay} aria-label="Previous frame" onClick={() => onStep(-1)}>
        <SkipBack size={14} />
      </button>
      <button type="button" className="play-toggle" disabled={!canPlay} onClick={onTogglePlayback}>
        {isPlaying ? <Pause size={15} /> : <Play size={15} />}
        {isPlaying ? "Pause" : "Play"}
      </button>
      <button type="button" disabled={!canPlay} aria-label="Next frame" onClick={() => onStep(1)}>
        <SkipForward size={14} />
      </button>
      <label className="player-scrub">
        <span>Scrub</span>
        <input
          type="range"
          min="0"
          max={Math.max(0, frameCount - 1)}
          step="1"
          value={Math.max(0, timelinePosition)}
          disabled={!canScrub}
          onChange={(event) => onScrub(Number(event.currentTarget.value))}
        />
      </label>
      <label className="player-number">
        <span>FPS</span>
        <input type="number" min="1" max="60" value={playbackFps} onChange={(event) => onFpsChange(Number(event.currentTarget.value))} />
      </label>
      <label className="player-number">
        <span>Direction</span>
        <select value={playbackDirection} onChange={(event) => onDirectionChange(event.currentTarget.value as PlaybackDirection)}>
          <option value="forward">Forward</option>
          <option value="reverse">Reverse</option>
          <option value="ping-pong">Ping-pong</option>
        </select>
      </label>
      <label className="player-number" title={`Current frame duration ${Math.round(currentFrameDurationMs)}ms`}>
        <span>Duration ms</span>
        <input
          className="duration-input"
          type="number"
          min="1"
          max="60000"
          value={currentFrameDurationInput}
          disabled={!currentFrameSelected}
          onChange={(event) => onDurationChange(Number(event.currentTarget.value))}
        />
      </label>
      <label className="player-loop">
        <input type="checkbox" checked={playbackLoop} onChange={(event) => onLoopChange(event.currentTarget.checked)} />
        Loop
      </label>
      <label className="player-loop">
        <input type="checkbox" checked={normalizeTimelineFrames} onChange={(event) => onNormalizeChange(event.currentTarget.checked)} />
        Normalize
      </label>
      <label className="player-loop">
        <input type="checkbox" checked={showOnionSkin} onChange={(event) => onOnionSkinChange(event.currentTarget.checked)} />
        Onion
      </label>
    </div>
  );
}
