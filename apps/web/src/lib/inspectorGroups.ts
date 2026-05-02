import type { AssetMode, AssetType } from "@pixelaid/shared";

export type InspectorGroupId = "asset" | "cleanup" | "grid" | "frame" | "viewport" | "export";

export const defaultInspectorGroupOrder: InspectorGroupId[] = ["asset", "cleanup", "grid", "frame", "viewport", "export"];

export type InspectorVisibilityContext = {
  assetType: AssetType;
  mode: AssetMode;
  frameCount?: number;
  animationCount?: number;
};

const frameInspectorAssetTypes: readonly AssetType[] = ["spriteSheet", "animationSheet", "characterSheet", "tileset", "tilemap"];

export function moveInspectorGroup(
  groups: readonly InspectorGroupId[],
  group: InspectorGroupId,
  direction: "up" | "down"
): InspectorGroupId[] {
  const index = groups.indexOf(group);
  const offset = direction === "up" ? -1 : 1;
  const targetIndex = index + offset;
  if (index < 0 || targetIndex < 0 || targetIndex >= groups.length) {
    return [...groups];
  }

  const next = [...groups];
  [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
  return next;
}

export function shouldShowFrameInspector(context: InspectorVisibilityContext): boolean {
  return (
    context.mode !== "single" ||
    frameInspectorAssetTypes.includes(context.assetType) ||
    (context.frameCount ?? 0) > 0 ||
    (context.animationCount ?? 0) > 0
  );
}

export function isInspectorGroupVisible(group: InspectorGroupId, context: InspectorVisibilityContext): boolean {
  if (group === "frame") {
    return shouldShowFrameInspector(context);
  }

  return true;
}

export function getVisibleInspectorGroups(
  groups: readonly InspectorGroupId[],
  context: InspectorVisibilityContext
): InspectorGroupId[] {
  return groups.filter((group) => isInspectorGroupVisible(group, context));
}

export function moveVisibleInspectorGroup(
  groups: readonly InspectorGroupId[],
  visibleGroups: readonly InspectorGroupId[],
  group: InspectorGroupId,
  direction: "up" | "down"
): InspectorGroupId[] {
  const visibleIndex = visibleGroups.indexOf(group);
  const offset = direction === "up" ? -1 : 1;
  const targetVisibleGroup = visibleGroups[visibleIndex + offset];
  if (visibleIndex < 0 || targetVisibleGroup === undefined) {
    return [...groups];
  }

  const sourceIndex = groups.indexOf(group);
  const targetIndex = groups.indexOf(targetVisibleGroup);
  if (sourceIndex < 0 || targetIndex < 0) {
    return [...groups];
  }

  const next = [...groups];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex]!, next[sourceIndex]!];
  return next;
}

export function isInspectorGroupDefaultOpen(group: InspectorGroupId): boolean {
  return group === "asset";
}
