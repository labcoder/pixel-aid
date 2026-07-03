import { rgbToHex, rgbToOklab } from "./color";
import type { ColorCount } from "./palette";

type FamilyKind = "neutral" | "chromatic";
type SplitAxis = "l" | "a" | "b";

type FamilyFirstEntry = ColorCount & {
  l: number;
  a: number;
  b: number;
  chroma: number;
  hue: number;
  weight: number;
};

type FamilyBucket = {
  kind: FamilyKind;
  index: number;
  entries: FamilyFirstEntry[];
  totalWeight: number;
  meanL: number;
  meanA: number;
  meanB: number;
  seatingOrder: number;
};

type Leaf = {
  familyOrder: number;
  creationOrder: number;
  entries: FamilyFirstEntry[];
  representative: FamilyFirstEntry;
  unsplittable: boolean;
};

const NEUTRAL_CHROMA_THRESHOLD = 0.035;
const CHROMA_WEIGHT_EDGE0 = 0.04;
const CHROMA_WEIGHT_EDGE1 = 0.12;
const FAMILY_FLOOR_RATIO = 0.0005;
const HUE_SPLIT_SPREAD_DEGREES = 30;

export function extractFamilyFirstPaletteFromCounts(counts: Map<number, ColorCount>, maxColors: number): string[] {
  if (counts.size === 0) {
    return ["#000000"];
  }
  const budget = Math.max(1, Math.floor(maxColors));
  const entries = createEntries(counts);
  if (entries.length <= budget) {
    return entries.sort(compareRankedEntries).map((entry) => rgbToHex(entry.color));
  }

  const seatedFamilies = seatFamilies(createFamilies(entries), budget);
  if (seatedFamilies.length === 0) {
    return ["#000000"];
  }

  let nextCreationOrder = 0;
  const leaves: Leaf[] = seatedFamilies.map((family) => ({
    familyOrder: family.seatingOrder,
    creationOrder: nextCreationOrder++,
    entries: family.entries,
    representative: medoid(family.entries),
    unsplittable: false
  }));

  while (leaves.length < budget) {
    const splitIndex = selectSplitLeaf(leaves);
    if (splitIndex < 0) {
      break;
    }
    const leaf = leaves[splitIndex]!;
    const split = splitLeaf(leaf, nextCreationOrder);
    if (!split) {
      leaf.unsplittable = true;
      continue;
    }
    nextCreationOrder += 1;
    leaves.splice(splitIndex, 1, split[0], split[1]);
  }

  leaves.sort((left, right) => left.familyOrder - right.familyOrder || left.representative.l - right.representative.l || left.representative.color - right.representative.color);
  return leaves.slice(0, budget).map((leaf) => rgbToHex(leaf.representative.color));
}

function createEntries(counts: Map<number, ColorCount>): FamilyFirstEntry[] {
  return [...counts.values()]
    .sort((left, right) => left.color - right.color)
    .map((entry) => {
      const lab = rgbToOklab(entry.color);
      const chroma = Math.hypot(lab.y, lab.z);
      const hue = normalizeHue((Math.atan2(lab.z, lab.y) * 180) / Math.PI);
      const chromaBoost = 1 + smoothstep(chroma, CHROMA_WEIGHT_EDGE0, CHROMA_WEIGHT_EDGE1);
      return {
        ...entry,
        l: lab.x,
        a: lab.y,
        b: lab.z,
        chroma,
        hue,
        weight: Math.max(0, entry.count) ** 0.75 * chromaBoost
      };
    });
}

function createFamilies(entries: readonly FamilyFirstEntry[]): FamilyBucket[] {
  const buckets = new Map<string, FamilyBucket>();
  for (const entry of entries) {
    const kind: FamilyKind = entry.chroma < NEUTRAL_CHROMA_THRESHOLD ? "neutral" : "chromatic";
    const index = kind === "neutral" ? clampInt(Math.floor(entry.l * 4), 0, 3) : clampInt(Math.floor(entry.hue / 45), 0, 7);
    const key = `${kind}:${index}`;
    let family = buckets.get(key);
    if (!family) {
      family = { kind, index, entries: [], totalWeight: 0, meanL: 0, meanA: 0, meanB: 0, seatingOrder: 0 };
      buckets.set(key, family);
    }
    family.entries.push(entry);
  }

  const families = [...buckets.values()];
  for (const family of families) {
    recomputeFamilyStats(family);
  }
  return mergeBelowFloorFamilies(families);
}

function mergeBelowFloorFamilies(families: FamilyBucket[]): FamilyBucket[] {
  const totalWeight = families.reduce((sum, family) => sum + family.totalWeight, 0);
  const floor = totalWeight * FAMILY_FLOOR_RATIO;
  let surviving = families.filter((family) => family.totalWeight >= floor);
  const belowFloor = families.filter((family) => family.totalWeight < floor);

  if (surviving.length === 0) {
    const largest = [...families].sort(compareFamiliesBySeatPriority)[0];
    surviving = largest ? [largest] : [];
  }

  const survivingSet = new Set(surviving);
  for (const family of belowFloor) {
    if (survivingSet.has(family)) {
      continue;
    }
    for (const entry of family.entries) {
      nearestFamily(entry, surviving).entries.push(entry);
    }
  }

  for (const family of surviving) {
    recomputeFamilyStats(family);
  }
  return surviving.sort(compareFamiliesBySeatPriority);
}

function seatFamilies(families: FamilyBucket[], budget: number): FamilyBucket[] {
  const seated = families.slice(0, Math.min(families.length, budget));
  for (let i = 0; i < seated.length; i += 1) {
    seated[i]!.seatingOrder = i;
  }
  return seated;
}

function recomputeFamilyStats(family: FamilyBucket): void {
  let totalWeight = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  family.entries.sort(compareEntriesByColor);
  for (const entry of family.entries) {
    totalWeight += entry.weight;
    sumL += entry.l * entry.weight;
    sumA += entry.a * entry.weight;
    sumB += entry.b * entry.weight;
  }
  family.totalWeight = totalWeight;
  family.meanL = totalWeight > 0 ? sumL / totalWeight : 0;
  family.meanA = totalWeight > 0 ? sumA / totalWeight : 0;
  family.meanB = totalWeight > 0 ? sumB / totalWeight : 0;
}

function compareFamiliesBySeatPriority(left: FamilyBucket, right: FamilyBucket): number {
  return right.totalWeight - left.totalWeight || familyKindRank(left.kind) - familyKindRank(right.kind) || left.index - right.index;
}

function familyKindRank(kind: FamilyKind): number {
  return kind === "neutral" ? 0 : 1;
}

function nearestFamily(entry: FamilyFirstEntry, families: readonly FamilyBucket[]): FamilyBucket {
  let best = families[0]!;
  let bestDistance = distanceSqToPoint(entry, best.meanL, best.meanA, best.meanB);
  for (let i = 1; i < families.length; i += 1) {
    const family = families[i]!;
    const distance = distanceSqToPoint(entry, family.meanL, family.meanA, family.meanB);
    if (distance < bestDistance || (distance === bestDistance && compareFamiliesBySeatPriority(family, best) < 0)) {
      best = family;
      bestDistance = distance;
    }
  }
  return best;
}

function selectSplitLeaf(leaves: readonly Leaf[]): number {
  let selected = -1;
  let selectedResidual = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < leaves.length; i += 1) {
    const leaf = leaves[i]!;
    if (leaf.unsplittable || leaf.entries.length <= 1) {
      continue;
    }
    const residual = leafResidual(leaf);
    if (
      selected < 0 ||
      residual > selectedResidual ||
      (residual === selectedResidual &&
        (leaf.familyOrder < leaves[selected]!.familyOrder ||
          (leaf.familyOrder === leaves[selected]!.familyOrder && leaf.creationOrder < leaves[selected]!.creationOrder)))
    ) {
      selected = i;
      selectedResidual = residual;
    }
  }
  return selected;
}

function splitLeaf(leaf: Leaf, nextCreationOrder: number): [Leaf, Leaf] | null {
  const axis = hueSpread(leaf.entries) < HUE_SPLIT_SPREAD_DEGREES ? "l" : dominantAxis(leaf.entries);
  const sorted = [...leaf.entries].sort((left, right) => axisValue(left, axis) - axisValue(right, axis) || left.color - right.color);
  if (axisValue(sorted[0]!, axis) === axisValue(sorted[sorted.length - 1]!, axis)) {
    return null;
  }

  const splitIndex = weightedMedianSplitIndex(sorted);
  if (splitIndex <= 0 || splitIndex >= sorted.length) {
    return null;
  }

  const leftEntries = sorted.slice(0, splitIndex);
  const rightEntries = sorted.slice(splitIndex);
  if (leftEntries.length === 0 || rightEntries.length === 0) {
    return null;
  }

  const representativeInLeft = leftEntries.some((entry) => entry.color === leaf.representative.color);
  const leftRepresentative = representativeInLeft ? leaf.representative : medoid(leftEntries);
  const rightRepresentative = representativeInLeft ? medoid(rightEntries) : leaf.representative;

  return [
    {
      familyOrder: leaf.familyOrder,
      creationOrder: leaf.creationOrder,
      entries: leftEntries,
      representative: leftRepresentative,
      unsplittable: false
    },
    {
      familyOrder: leaf.familyOrder,
      creationOrder: nextCreationOrder,
      entries: rightEntries,
      representative: rightRepresentative,
      unsplittable: false
    }
  ];
}

function weightedMedianSplitIndex(sorted: readonly FamilyFirstEntry[]): number {
  const totalWeight = sorted.reduce((sum, entry) => sum + entry.weight, 0);
  const halfWeight = totalWeight / 2;
  let runningWeight = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    runningWeight += sorted[i]!.weight;
    if (runningWeight >= halfWeight) {
      return i + 1;
    }
  }
  return Math.floor(sorted.length / 2);
}

function dominantAxis(entries: readonly FamilyFirstEntry[]): SplitAxis {
  const mean = weightedMean(entries);
  let varL = 0;
  let varA = 0;
  let varB = 0;
  for (const entry of entries) {
    varL += (entry.l - mean.l) * (entry.l - mean.l) * entry.weight;
    varA += (entry.a - mean.a) * (entry.a - mean.a) * entry.weight;
    varB += (entry.b - mean.b) * (entry.b - mean.b) * entry.weight;
  }
  if (varL >= varA && varL >= varB) {
    return "l";
  }
  if (varA >= varB) {
    return "a";
  }
  return "b";
}

function weightedMean(entries: readonly FamilyFirstEntry[]): { l: number; a: number; b: number } {
  let totalWeight = 0;
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  for (const entry of entries) {
    totalWeight += entry.weight;
    sumL += entry.l * entry.weight;
    sumA += entry.a * entry.weight;
    sumB += entry.b * entry.weight;
  }
  return totalWeight > 0 ? { l: sumL / totalWeight, a: sumA / totalWeight, b: sumB / totalWeight } : { l: 0, a: 0, b: 0 };
}

function medoid(entries: readonly FamilyFirstEntry[]): FamilyFirstEntry {
  const mean = weightedMean(entries);
  let best = entries[0]!;
  let bestDistance = distanceSqToPoint(best, mean.l, mean.a, mean.b);
  for (let i = 1; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const distance = distanceSqToPoint(entry, mean.l, mean.a, mean.b);
    if (distance < bestDistance || (distance === bestDistance && entry.color < best.color)) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

function leafResidual(leaf: Leaf): number {
  let residual = 0;
  for (const entry of leaf.entries) {
    residual += entry.weight * distanceSq(entry, leaf.representative);
  }
  return residual;
}

function hueSpread(entries: readonly FamilyFirstEntry[]): number {
  const hues = entries.filter((entry) => entry.chroma >= NEUTRAL_CHROMA_THRESHOLD).map((entry) => entry.hue).sort((left, right) => left - right);
  if (hues.length <= 1) {
    return 0;
  }

  const wrapped = hues.concat(hues.map((hue) => hue + 360));
  let best = 0;
  let right = 0;
  for (let left = 0; left < hues.length; left += 1) {
    if (right < left) {
      right = left;
    }
    while (right + 1 < left + hues.length && wrapped[right + 1]! - wrapped[left]! <= 180) {
      right += 1;
    }
    best = Math.max(best, wrapped[right]! - wrapped[left]!);
  }
  return best;
}

function axisValue(entry: FamilyFirstEntry, axis: SplitAxis): number {
  if (axis === "l") {
    return entry.l;
  }
  return axis === "a" ? entry.a : entry.b;
}

function distanceSq(left: FamilyFirstEntry, right: FamilyFirstEntry): number {
  return distanceSqToPoint(left, right.l, right.a, right.b);
}

function distanceSqToPoint(entry: FamilyFirstEntry, l: number, a: number, b: number): number {
  const dL = (entry.l - l) * 0.75;
  const dA = entry.a - a;
  const dB = entry.b - b;
  return dL * dL + dA * dA + dB * dB;
}

function smoothstep(value: number, edge0: number, edge1: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function normalizeHue(hue: number): number {
  const normalized = hue % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compareEntriesByColor(left: FamilyFirstEntry, right: FamilyFirstEntry): number {
  return left.color - right.color;
}

function compareRankedEntries(left: FamilyFirstEntry, right: FamilyFirstEntry): number {
  return right.count - left.count || left.firstSeen - right.firstSeen || left.color - right.color;
}
