import type { GridCandidate } from "@pixelaid/shared";

const emptyGridCandidates: GridCandidate[] = [];
Object.freeze(emptyGridCandidates);

export function selectCachedGridCandidates(cache: Record<string, GridCandidate[]>, cacheKey: string): GridCandidate[] {
  if (!cacheKey) {
    return emptyGridCandidates;
  }

  return cache[cacheKey] ?? emptyGridCandidates;
}
