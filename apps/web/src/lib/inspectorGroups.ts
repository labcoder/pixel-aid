export type InspectorGroupId = "asset" | "cleanup" | "grid" | "frame" | "viewport" | "export";

export const defaultInspectorGroupOrder: InspectorGroupId[] = ["asset", "cleanup", "grid", "frame", "viewport", "export"];

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
