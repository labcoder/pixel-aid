import type { SpriteFrame } from "@pixelaid/shared";

export function mapFrameToSource(frame: SpriteFrame, scaleX: number, scaleY: number): SpriteFrame {
  if (frame.sourceRect) {
    const sourceScaleX = frame.sourceRect.w / Math.max(1, frame.rect.w);
    const sourceScaleY = frame.sourceRect.h / Math.max(1, frame.rect.h);

    return {
      ...frame,
      rect: { ...frame.sourceRect },
      pivot: {
        x: Math.round(frame.pivot.x * sourceScaleX),
        y: Math.round(frame.pivot.y * sourceScaleY)
      },
      ...(frame.anchors ? { anchors: scaleAnchors(frame.anchors, sourceScaleX, sourceScaleY) } : {}),
      ...(frame.boxes ? { boxes: scaleBoxes(frame.boxes, sourceScaleX, sourceScaleY) } : {})
    };
  }

  return {
    ...frame,
    rect: {
      x: Math.round(frame.rect.x * scaleX),
      y: Math.round(frame.rect.y * scaleY),
      w: Math.max(1, Math.round(frame.rect.w * scaleX)),
      h: Math.max(1, Math.round(frame.rect.h * scaleY))
    },
    pivot: {
      x: Math.round(frame.pivot.x * scaleX),
      y: Math.round(frame.pivot.y * scaleY)
    },
    ...(frame.anchors ? { anchors: scaleAnchors(frame.anchors, scaleX, scaleY) } : {}),
    ...(frame.boxes ? { boxes: scaleBoxes(frame.boxes, scaleX, scaleY) } : {})
  };
}

export function createSourceFrameMappingKey(frames: readonly SpriteFrame[], scaleX: number, scaleY: number): string {
  return frames.map((frame) => frameSignature(mapFrameToSource(frame, scaleX, scaleY))).join("|");
}

function frameSignature(frame: SpriteFrame): string {
  return [
    frame.name,
    rectSignature(frame.rect),
    pointSignature(frame.pivot),
    frame.anchors?.map((anchor) => `${anchor.name}:${pointSignature(anchor.point)}:${anchor.color}`).join(",") ?? "",
    frame.boxes?.map((box) => `${box.name}:${rectSignature(box.rect)}:${box.color}`).join(",") ?? ""
  ].join(":");
}

function rectSignature(rect: SpriteFrame["rect"]): string {
  return `${rect.x},${rect.y},${rect.w},${rect.h}`;
}

function pointSignature(point: SpriteFrame["pivot"]): string {
  return `${point.x},${point.y}`;
}

function scaleAnchors(anchors: NonNullable<SpriteFrame["anchors"]>, scaleX: number, scaleY: number): NonNullable<SpriteFrame["anchors"]> {
  return anchors.map((anchor) => ({
    ...anchor,
    point: {
      x: Math.round(anchor.point.x * scaleX),
      y: Math.round(anchor.point.y * scaleY)
    }
  }));
}

function scaleBoxes(boxes: NonNullable<SpriteFrame["boxes"]>, scaleX: number, scaleY: number): NonNullable<SpriteFrame["boxes"]> {
  return boxes.map((box) => ({
    ...box,
    rect: {
      x: Math.round(box.rect.x * scaleX),
      y: Math.round(box.rect.y * scaleY),
      w: Math.max(1, Math.round(box.rect.w * scaleX)),
      h: Math.max(1, Math.round(box.rect.h * scaleY))
    }
  }));
}
