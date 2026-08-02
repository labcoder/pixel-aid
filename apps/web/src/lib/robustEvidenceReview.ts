import {
  createRobustEvidenceSettingsSnapshot,
  stableStringifyRobustEvidenceValue,
  type FixOptions,
  type GridAutoStrategy,
  type RGBAImage,
  type RobustEvidenceCandidateSlot
} from "@pixelaid/shared";

export const robustEvidenceParticipantStorageKey = "pixelaid.phase8.participant-id";
export const robustEvidenceAssignmentIndexStorageKey = "pixelaid.phase8.assignment-index";

export type RobustEvidenceBlindAssignment = {
  assignmentToken: string;
  index: number;
  assignment: Record<RobustEvidenceCandidateSlot, GridAutoStrategy>;
};

export function createEvidenceFixOptions(baseOptions: FixOptions, strategy: GridAutoStrategy): FixOptions {
  const automaticGrid = { ...baseOptions.grid };
  delete automaticGrid.scale;
  delete automaticGrid.scaleX;
  delete automaticGrid.scaleY;
  delete automaticGrid.phaseX;
  delete automaticGrid.phaseY;
  return {
    ...baseOptions,
    grid: {
      ...automaticGrid,
      detect: "auto",
      autoStrategy: strategy,
      ...(strategy === "robust" ? { robustSafety: "guarded" as const } : { robustSafety: "guarded" as const })
    }
  };
}

export function createBlindAssignment(assignmentToken: string, index: number): RobustEvidenceBlindAssignment {
  const robustFirst = Math.abs(Math.trunc(index)) % 2 === 1;
  return {
    assignmentToken,
    index: Math.max(0, Math.trunc(index)),
    assignment: robustFirst
      ? { candidateA: "robust", candidateB: "classic" }
      : { candidateA: "classic", candidateB: "robust" }
  };
}

export function getOrCreateEvidenceParticipantId(storage: Pick<Storage, "getItem" | "setItem">, uuid: () => string): string {
  const stored = storage.getItem(robustEvidenceParticipantStorageKey)?.trim();
  if (stored && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{5,127}$/u.test(stored)) return stored;
  const participantId = `participant:${uuid()}`;
  storage.setItem(robustEvidenceParticipantStorageKey, participantId);
  return participantId;
}

export function takeNextBlindAssignment(
  storage: Pick<Storage, "getItem" | "setItem">,
  uuid: () => string
): RobustEvidenceBlindAssignment {
  const storedIndex = Number.parseInt(storage.getItem(robustEvidenceAssignmentIndexStorageKey) ?? "0", 10);
  const index = Number.isSafeInteger(storedIndex) && storedIndex >= 0 ? storedIndex : 0;
  storage.setItem(robustEvidenceAssignmentIndexStorageKey, String(index + 1));
  return createBlindAssignment(`assignment:${uuid()}`, index);
}

export function resolveBlindCandidate<T>(
  slot: RobustEvidenceCandidateSlot,
  assignment: Record<RobustEvidenceCandidateSlot, GridAutoStrategy>,
  candidates: Record<GridAutoStrategy, T>
): T {
  return candidates[assignment[slot]];
}

export function comparisonSettingsMatch(classicOptions: FixOptions, robustOptions: FixOptions): boolean {
  return (
    stableStringifyRobustEvidenceValue(createRobustEvidenceSettingsSnapshot(classicOptions)) ===
    stableStringifyRobustEvidenceValue(createRobustEvidenceSettingsSnapshot(robustOptions))
  );
}

export async function hashEvidenceSettings(options: FixOptions): Promise<string> {
  const snapshot = createRobustEvidenceSettingsSnapshot(options);
  return sha256Bytes(new TextEncoder().encode(stableStringifyRobustEvidenceValue(snapshot)));
}

export async function hashEvidenceImage(image: RGBAImage): Promise<string> {
  const bytes = new Uint8Array(8 + image.data.byteLength);
  const dimensions = new DataView(bytes.buffer, 0, 8);
  dimensions.setUint32(0, image.width, true);
  dimensions.setUint32(4, image.height, true);
  bytes.set(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), 8);
  return sha256Bytes(bytes);
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const ownedBytes = new Uint8Array(bytes.byteLength);
  ownedBytes.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", ownedBytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
