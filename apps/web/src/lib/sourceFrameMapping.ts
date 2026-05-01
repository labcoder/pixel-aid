import type { SpriteFrame } from "@pixelaid/shared";

export function mapFrameToSource(frame: SpriteFrame, scaleX: number, scaleY: number): SpriteFrame {
  if (frame.sourceRect) {
    return {
      ...frame,
      rect: { ...frame.sourceRect },
      pivot: {
        x: Math.round(frame.pivot.x * scaleX),
        y: Math.round(frame.pivot.y * scaleY)
      },
      ...(frame.anchors ? { anchors: scaleAnchors(frame.anchors, scaleX, scaleY) } : {}),
      ...(frame.boxes ? { boxes: scaleBoxes(frame.boxes, scaleX, scaleY) } : {})
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
