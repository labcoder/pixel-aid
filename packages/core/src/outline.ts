import type { OutlineCleanupDiagnostics, OutlineMode, RGBAImage } from "@pixelaid/shared";
import { applyAlphaMode } from "./alpha";
import { analyzeBackground } from "./backgroundAnalysis";
import { clampByte, parseHexColor, rgbChannelsToOklab, rgbToHex, unpackRgb } from "./color";
import { cloneImage } from "./image";

export type OutlineCleanupOptions = {
  color?: string | undefined;
  sourceColors?: string[] | undefined;
  alpha?: number | undefined;
  size?: number | undefined;
  removeOrphans?: boolean;
  closeGaps?: boolean;
  preserveSinglePixelDetails?: boolean;
  alphaThreshold?: number;
  backgroundTolerance?: number;
};

export type OutlineCleanupResult = {
  image: RGBAImage;
  diagnostics: OutlineCleanupDiagnostics;
};

export type OutlineColorCandidate = {
  color: string;
  count: number;
  outsideContact: number;
  luma: number;
  score: number;
  repairSafeScore?: number;
  boundaryCoverage?: number;
  outsideContactCoverage?: number;
  boundaryEnrichment?: number;
  backgroundSeparationOklab?: number;
  distance1Ratio?: number;
  distance2Ratio?: number;
  distance3PlusRatio?: number;
  interiorSupportRatio?: number;
  innerDarkerRatio?: number;
  innerDarkerWithin2Ratio?: number;
  fringeSuspectScore?: number;
  isFringeSuspect?: boolean;
  confidence?: number;
  classification?: "deliberate" | "partial" | "weak";
  role?: "outline-source" | "fringe-matte" | "ambiguous";
  analysisStage?: "raw" | "alpha-cleaned" | "semantic-silhouette";
  semanticScore?: number;
};

export type OutlineSemanticAnalysis = {
  outlineCandidates: OutlineColorCandidate[];
  fringeCandidates: OutlineColorCandidate[];
};

const DARK_EDGE_LUMA = 96;
const SOURCE_COLOR_MATCH_DISTANCE = 18;
const FRINGE_SUSPECT_THRESHOLD = 0.2;

export function applyOutlineCleanup(image: RGBAImage, mode: OutlineMode, options: OutlineCleanupOptions = {}): RGBAImage {
  return applyOutlineCleanupDetailed(image, mode, options).image;
}

export function applyOutlineCleanupDetailed(image: RGBAImage, mode: OutlineMode, options: OutlineCleanupOptions = {}): OutlineCleanupResult {
  const candidateOptions: Pick<OutlineCleanupOptions, "alphaThreshold" | "backgroundTolerance"> = {};
  if (options.alphaThreshold !== undefined) {
    candidateOptions.alphaThreshold = options.alphaThreshold;
  }
  if (options.backgroundTolerance !== undefined) {
    candidateOptions.backgroundTolerance = options.backgroundTolerance;
  }
  const detectedCandidateCount = mode === "none" ? 0 : detectOutlineColorCandidates(image, candidateOptions).length;
  const diagnostics = createOutlineDiagnostics(mode, normalizeSourceColors(options.sourceColors).length, detectedCandidateCount);

  if (mode === "none" && !options.removeOrphans && !options.closeGaps) {
    diagnostics.summary = "outline cleanup disabled";
    return { image: cloneImage(image), diagnostics };
  }

  const alphaThreshold = options.alphaThreshold ?? 8;
  const backgroundTolerance = options.backgroundTolerance ?? 18;
  const background = estimateCornerBackground(image);
  const output = cloneImage(image);
  const rawSubjectMask = buildSubjectMask(image, alphaThreshold, background, backgroundTolerance);
  let subjectMask = rawSubjectMask;

  if (options.removeOrphans) {
    subjectMask = removeOrphanComponents(subjectMask, image.width, image.height, options.preserveSinglePixelDetails ?? true);
    clearRemovedSubjectPixels(output, rawSubjectMask, subjectMask);
  }

  if (options.closeGaps) {
    const gapClosedMask = closeOnePixelGaps(subjectMask, image.width, image.height);
    fillClosedSubjectGaps(output, image, subjectMask, gapClosedMask);
    subjectMask = gapClosedMask;
  }

  if (mode === "none") {
    diagnostics.summary = summarizeOutlineDiagnostics(diagnostics);
    return { image: output, diagnostics };
  }

  const outlineAlpha = clampByte(options.alpha ?? 255);
  const size = normalizeOutlineSize(options.size ?? 1);
  const selectedSourceColors = normalizeSourceColors(options.sourceColors);
  diagnostics.explicitSourceColorCount = selectedSourceColors.length;
  const detectedOutlineColor =
    selectedSourceColors[0] ??
    (mode === "repairExisting"
      ? detectExistingOutlineColor(image, alphaThreshold, backgroundTolerance)
      : detectDarkExistingOutlineColor(image, alphaThreshold, background, backgroundTolerance));
  const outlineColor =
    options.color !== undefined
      ? parseHexColor(options.color)
      : mode === "repairExisting"
        ? detectedOutlineColor
        : detectedOutlineColor ??
          detectDarkestSubjectColor(image, alphaThreshold, background, backgroundTolerance) ??
          0;

  if (outlineColor === null) {
    diagnostics.warnings.push("No outline candidate found for repairExisting; outline cleanup was skipped.");
    diagnostics.summary = summarizeOutlineDiagnostics(diagnostics);
    return { image: output, diagnostics };
  }
  diagnostics.selectedColor = rgbToHex(outlineColor);

  const [r, g, b] = unpackRgb(outlineColor, 255);
  const outlineSourceMask =
    mode === "repairExisting" ? buildOutlineSourceMask(image, subjectMask, selectedSourceColors.length > 0 ? selectedSourceColors : detectedOutlineColor !== null ? [detectedOutlineColor] : []) : undefined;
  const outlineNeighborMask =
    outlineSourceMask && outlineSourceMask.some((value) => value === 1) ? subtractMask(subjectMask, outlineSourceMask) : subjectMask;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      const index = y * image.width + x;
      if (subjectMask[index] === 1 || !hasMaskedSubjectNeighbor(outlineNeighborMask, image.width, image.height, x, y, size)) {
        continue;
      }

      output.data[offset] = r;
      output.data[offset + 1] = g;
      output.data[offset + 2] = b;
      output.data[offset + 3] = outlineAlpha;
      diagnostics.appliedPixels += 1;
    }
  }

  diagnostics.summary = summarizeOutlineDiagnostics(diagnostics);
  return { image: output, diagnostics };
}

function createOutlineDiagnostics(mode: OutlineMode, explicitSourceColorCount: number, detectedCandidateCount: number): OutlineCleanupDiagnostics {
  return {
    mode,
    explicitSourceColorCount,
    detectedCandidateCount,
    appliedPixels: 0,
    warnings: [],
    summary: "outline cleanup ready"
  };
}

function summarizeOutlineDiagnostics(diagnostics: OutlineCleanupDiagnostics): string {
  if (diagnostics.mode === "none") {
    return diagnostics.appliedPixels > 0 ? `outline cleanup adjusted ${diagnostics.appliedPixels} mask pixel${diagnostics.appliedPixels === 1 ? "" : "s"}` : "outline cleanup disabled";
  }
  if (diagnostics.appliedPixels === 0) {
    return diagnostics.selectedColor
      ? `outline cleanup selected ${diagnostics.selectedColor} but did not need to add pixels`
      : "outline cleanup skipped because no outline candidate was available";
  }
  return `outline cleanup used ${diagnostics.selectedColor ?? "auto"} and wrote ${diagnostics.appliedPixels} pixel${diagnostics.appliedPixels === 1 ? "" : "s"}`;
}

export function detectOutlineColorCandidates(
  image: RGBAImage,
  options: Pick<OutlineCleanupOptions, "alphaThreshold" | "backgroundTolerance"> & { maxCandidates?: number; bucketDistance?: number } = {}
): OutlineColorCandidate[] {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const backgroundTolerance = options.backgroundTolerance ?? 18;
  const background = estimateCornerBackground(image);
  const backgroundModel = createExteriorBackgroundModel(image, background, backgroundTolerance);
  const outsideMask = buildExteriorOutsideMask(image, alphaThreshold, backgroundModel);
  const exteriorDepth = buildExteriorDepthMap(outsideMask, image.width, image.height);
  const bucketCounts = new Uint32Array(4096);
  const bucketOutsideContact = new Uint32Array(4096);
  const bucketInteriorCounts = new Uint32Array(4096);
  const bucketDistance2Counts = new Uint32Array(4096);
  const bucketDistance3PlusCounts = new Uint32Array(4096);
  const bucketInnerDarkerCounts = new Uint32Array(4096);
  const bucketInnerDarkerWithin2Counts = new Uint32Array(4096);
  const bucketRepresentatives = new Uint32Array(4096);
  const hasRepresentative = new Uint8Array(4096);
  let totalBoundary = 0;
  let totalOutsideContact = 0;
  let totalInterior = 0;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const index = y * image.width + x;
      const offset = index * 4;
      if (image.data[offset + 3]! <= alphaThreshold || outsideMask[index] === 1) {
        continue;
      }

      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      const bucket = quantizeOutlineBucket(r, g, b);
      const outsideContact = countExterior4Neighbors(outsideMask, image.width, image.height, x, y);
      if (outsideContact === 0) {
        bucketInteriorCounts[bucket] = bucketInteriorCounts[bucket]! + 1;
        const interiorDepth = exteriorDepth[index]!;
        if (interiorDepth <= 2) {
          bucketDistance2Counts[bucket] = bucketDistance2Counts[bucket]! + 1;
        } else {
          bucketDistance3PlusCounts[bucket] = bucketDistance3PlusCounts[bucket]! + 1;
        }
        totalInterior += 1;
        continue;
      }

      bucketCounts[bucket] = bucketCounts[bucket]! + 1;
      bucketOutsideContact[bucket] = bucketOutsideContact[bucket]! + outsideContact;
      const candidateLuma = luminance(r, g, b);
      if (hasInnerDarkerNeighbor(image, outsideMask, exteriorDepth, alphaThreshold, bucket, x, y, candidateLuma, 1)) {
        bucketInnerDarkerCounts[bucket] = bucketInnerDarkerCounts[bucket]! + 1;
      }
      if (hasInnerDarkerNeighbor(image, outsideMask, exteriorDepth, alphaThreshold, bucket, x, y, candidateLuma, 2)) {
        bucketInnerDarkerWithin2Counts[bucket] = bucketInnerDarkerWithin2Counts[bucket]! + 1;
      }
      totalBoundary += 1;
      totalOutsideContact += outsideContact;
      if (hasRepresentative[bucket] === 0) {
        bucketRepresentatives[bucket] = (r << 16) | (g << 8) | b;
        hasRepresentative[bucket] = 1;
      }
    }
  }

  if (totalBoundary < 2) {
    return [];
  }

  const candidates: OutlineColorCandidate[] = [];
  const contactDenominator = Math.max(1, totalOutsideContact);
  const interiorDenominator = Math.max(1, totalInterior);
  for (let bucket = 0; bucket < bucketCounts.length; bucket += 1) {
    const count = bucketCounts[bucket]!;
    if (count === 0 || backgroundModel.backgroundLikeBuckets[bucket] === 1) {
      continue;
    }

    const representative = bucketRepresentatives[bucket]!;
    const [r, g, b] = unpackRgb(representative, 255);
    const outsideContact = bucketOutsideContact[bucket]!;
    const boundaryCoverage = count / totalBoundary;
    const outsideContactCoverage = outsideContact / contactDenominator;
    const interiorCoverage = bucketInteriorCounts[bucket]! / interiorDenominator;
    const boundaryEnrichment = boundaryCoverage / Math.max(0.005, interiorCoverage);
    const rawScore = count * 10 + outsideContact * 4 + boundaryEnrichment * 3 + outsideContactCoverage * 10;
    const backgroundSeparationOklab = backgroundModel.backgroundDistance[bucket]!;
    const normalizedBackgroundSeparation = Math.min(1, Math.max(0, (backgroundSeparationOklab - backgroundModel.backgroundLikeThreshold) / 0.12));
    const familyPenalty = backgroundModel.backgroundFamilyBuckets[bucket] === 1 ? 0.12 + normalizedBackgroundSeparation * 0.33 : 1;
    const score = rawScore * familyPenalty;
    const confidence = outlineCandidateConfidence(boundaryCoverage, outsideContactCoverage, boundaryEnrichment, backgroundSeparationOklab);
    const totalBucketPixels = Math.max(1, count + bucketInteriorCounts[bucket]!);
    const distance2Count = bucketDistance2Counts[bucket]!;
    const distance3PlusCount = bucketDistance3PlusCounts[bucket]!;
    const distance1Ratio = count / totalBucketPixels;
    const distance2Ratio = distance2Count / totalBucketPixels;
    const distance3PlusRatio = distance3PlusCount / totalBucketPixels;
    const interiorSupportRatio = distance3PlusCount / Math.max(1, count + distance2Count);
    const innerDarkerRatio = bucketInnerDarkerCounts[bucket]! / Math.max(1, count);
    const innerDarkerWithin2Ratio = bucketInnerDarkerWithin2Counts[bucket]! / Math.max(1, count);
    const lowInteriorSupport = 1 - Math.min(1, interiorSupportRatio);
    const outerFringeScore = distance1Ratio * Math.max(innerDarkerRatio, innerDarkerWithin2Ratio) * lowInteriorSupport;
    const lowBackgroundSeparation = Math.max(0, (0.22 - backgroundSeparationOklab) / 0.22);
    const lowSeparationOuterScore = distance1Ratio * lowInteriorSupport * lowBackgroundSeparation;
    const fringeSuspectScore = Math.max(outerFringeScore, lowSeparationOuterScore);
    const repairSafeScore = score * (1 - Math.min(0.95, fringeSuspectScore));
    candidates.push({
      color: rgbToHex(representative),
      count,
      outsideContact,
      luma: luminance(r, g, b),
      score,
      repairSafeScore,
      boundaryCoverage,
      outsideContactCoverage,
      boundaryEnrichment,
      backgroundSeparationOklab,
      distance1Ratio,
      distance2Ratio,
      distance3PlusRatio,
      interiorSupportRatio,
      innerDarkerRatio,
      innerDarkerWithin2Ratio,
      fringeSuspectScore,
      isFringeSuspect: fringeSuspectScore >= FRINGE_SUSPECT_THRESHOLD,
      confidence,
      classification: classifyOutlineCandidate(confidence)
    });
  }

  return candidates
    .sort((a, b) => (b.repairSafeScore ?? b.score) - (a.repairSafeScore ?? a.score) || b.score - a.score || b.count - a.count || b.outsideContact - a.outsideContact || a.color.localeCompare(b.color))
    .slice(0, options.maxCandidates ?? 8);
}

export function analyzeOutlineSemantics(
  image: RGBAImage,
  options: Pick<OutlineCleanupOptions, "alphaThreshold" | "backgroundTolerance"> & { maxCandidates?: number; bucketDistance?: number } = {}
): OutlineSemanticAnalysis {
  const alphaThreshold = options.alphaThreshold ?? 8;
  const backgroundTolerance = options.backgroundTolerance ?? 18;
  const maxCandidates = options.maxCandidates ?? 8;
  const rawCandidateLimit = Math.max(maxCandidates * 3, 12);
  const detectionOptions = {
    alphaThreshold,
    backgroundTolerance,
    maxCandidates: rawCandidateLimit,
    ...(options.bucketDistance !== undefined ? { bucketDistance: options.bucketDistance } : {})
  };
  const rawCandidates = detectOutlineColorCandidates(image, detectionOptions);
  const fringeBuckets = new Uint8Array(4096);
  for (const candidate of rawCandidates) {
    if (isSemanticFringeCandidate(candidate)) {
      fringeBuckets[outlineCandidateBucket(candidate)] = 1;
    }
  }
  const semanticInput = cloneImage(image);
  const alphaCleaned = applyAlphaMode(image, "backgroundFloodFill", {
    threshold: alphaThreshold,
    tolerance: backgroundTolerance,
    decontaminateRgb: false,
    backgroundDetection: "classic"
  }).image;
  const alphaCleanedCandidates = detectOutlineColorCandidates(alphaCleaned, detectionOptions);
  const preserveDarkSourceAlpha = !alphaCleanedCandidates.some((candidate) => candidate.luma <= 64);

  for (let offset = 3; offset < semanticInput.data.length; offset += 4) {
    const colorOffset = offset - 3;
    const sourceAlpha = image.data[offset]!;
    const sourceLuma = luminance(image.data[colorOffset]!, image.data[colorOffset + 1]!, image.data[colorOffset + 2]!);
    const sourceBucket = quantizeOutlineBucket(image.data[colorOffset]!, image.data[colorOffset + 1]!, image.data[colorOffset + 2]!);
    semanticInput.data[offset] =
      preserveDarkSourceAlpha && sourceAlpha > alphaThreshold && sourceLuma <= 64 && fringeBuckets[sourceBucket] !== 1 ? sourceAlpha : alphaCleaned.data[offset]!;
  }

  if (fringeBuckets.some((value) => value === 1)) {
    for (let offset = 0; offset < semanticInput.data.length; offset += 4) {
      if (semanticInput.data[offset + 3]! <= alphaThreshold) {
        continue;
      }
      const bucket = quantizeOutlineBucket(semanticInput.data[offset]!, semanticInput.data[offset + 1]!, semanticInput.data[offset + 2]!);
      if (fringeBuckets[bucket] === 1) {
        semanticInput.data[offset + 3] = 0;
      }
    }
  }

  const outlineCandidates = detectOutlineColorCandidates(semanticInput, detectionOptions)
    .map((candidate) => semanticOutlineCandidate(candidate))
    .filter((candidate) => isSemanticOutlineSourceCandidate(candidate))
    .slice(0, maxCandidates);
  const outlineBuckets = new Uint8Array(4096);
  for (const candidate of outlineCandidates) {
    outlineBuckets[outlineCandidateBucket(candidate)] = 1;
  }

  const fringeCandidates = rawCandidates
    .filter((candidate) => outlineBuckets[outlineCandidateBucket(candidate)] === 0)
    .map((candidate) => semanticFringeCandidate(candidate))
    .slice(0, maxCandidates);

  return { outlineCandidates, fringeCandidates };
}

function isSemanticFringeCandidate(candidate: OutlineColorCandidate): boolean {
  return (
    candidate.isFringeSuspect === true ||
    ((candidate.distance1Ratio ?? 0) >= 0.9 &&
      (candidate.interiorSupportRatio ?? 1) <= 0.08 &&
      ((candidate.innerDarkerRatio ?? 0) >= 0.08 || (candidate.innerDarkerWithin2Ratio ?? 0) >= 0.08))
  );
}

function isSemanticOutlineSourceCandidate(candidate: OutlineColorCandidate): boolean {
  if (candidate.luma <= 64) {
    return true;
  }
  if (candidate.isFringeSuspect === true || candidate.classification === "weak") {
    return false;
  }
  const distance1Ratio = candidate.distance1Ratio ?? 0;
  const distance3PlusRatio = candidate.distance3PlusRatio ?? 0;
  const interiorSupportRatio = candidate.interiorSupportRatio ?? 0;
  const backgroundSeparationOklab = candidate.backgroundSeparationOklab ?? 1;
  const outerOnlyBackgroundMatte =
    distance1Ratio >= 0.8 && distance3PlusRatio <= 0.02 && interiorSupportRatio <= 0.04 && backgroundSeparationOklab <= 0.36;
  return !outerOnlyBackgroundMatte;
}

function semanticOutlineCandidate(candidate: OutlineColorCandidate): OutlineColorCandidate {
  return {
    ...candidate,
    role: "outline-source",
    analysisStage: "semantic-silhouette",
    semanticScore: candidate.repairSafeScore ?? candidate.score
  };
}

function semanticFringeCandidate(candidate: OutlineColorCandidate): OutlineColorCandidate {
  return {
    ...candidate,
    role: "fringe-matte",
    analysisStage: "raw",
    semanticScore: 0
  };
}

function outlineCandidateBucket(candidate: OutlineColorCandidate): number {
  const rgb = Number.parseInt(candidate.color.slice(1), 16);
  return quantizeOutlineBucket((rgb >> 16) & 0xff, (rgb >> 8) & 0xff, rgb & 0xff);
}


type BackgroundSample = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ExteriorBackgroundModel = {
  corner: BackgroundSample;
  tolerance: number;
  backgroundLikeThreshold: number;
  backgroundLikeBuckets: Uint8Array;
  backgroundFamilyBuckets: Uint8Array;
  backgroundDistance: Float32Array;
};

function detectExistingOutlineColor(image: RGBAImage, alphaThreshold: number, backgroundTolerance: number): number | null {
  const candidates = detectOutlineColorCandidates(image, { alphaThreshold, backgroundTolerance });
  const selected = candidates.find((candidate) => candidate.classification === "deliberate" && (candidate.confidence ?? 0) >= 0.8);
  const tinyDarkEdgeFallback = selectTinyDarkEdgeRepairCandidate(candidates, selected);
  const repairCandidate = tinyDarkEdgeFallback ?? selected;
  return repairCandidate ? Number.parseInt(repairCandidate.color.slice(1), 16) : null;
}

function selectTinyDarkEdgeRepairCandidate(candidates: readonly OutlineColorCandidate[], selected: OutlineColorCandidate | undefined): OutlineColorCandidate | undefined {
  if (!selected || selected.luma <= DARK_EDGE_LUMA || candidates.reduce((sum, candidate) => sum + candidate.count, 0) > 2) {
    return undefined;
  }

  const darkCandidates = candidates.filter(
    (candidate) =>
      candidate.luma <= DARK_EDGE_LUMA &&
      candidate.classification === "deliberate" &&
      (candidate.confidence ?? 0) >= 0.8 &&
      candidate.count === 1 &&
      candidate.outsideContact >= 2
  );
  return darkCandidates.length === 1 ? darkCandidates[0] : undefined;
}

function detectDarkExistingOutlineColor(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (
        isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance) ||
        !hasOutsideNeighbor(image, x, y, alphaThreshold, background, backgroundTolerance)
      ) {
        continue;
      }

      const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (luma <= DARK_EDGE_LUMA && luma < bestLuma) {
        bestLuma = luma;
        bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      }
    }
  }

  return bestColor;
}

function outlineCandidateConfidence(boundaryCoverage: number, outsideContactCoverage: number, boundaryEnrichment: number, backgroundSeparationOklab: number): number {
  const boundarySupport = Math.min(1, boundaryCoverage / 0.08);
  const contactSupport = Math.min(1, outsideContactCoverage / 0.08);
  const enrichmentSupport = Math.min(1, Math.sqrt(Math.max(0, boundaryEnrichment - 1)) / 2);
  const separationSupport = Math.min(1, backgroundSeparationOklab / 0.16);
  return Math.max(0, Math.min(1, boundarySupport * 0.38 + contactSupport * 0.27 + enrichmentSupport * 0.25 + separationSupport * 0.1));
}

function classifyOutlineCandidate(confidence: number): "deliberate" | "partial" | "weak" {
  if (confidence >= 0.8) {
    return "deliberate";
  }
  if (confidence >= 0.55) {
    return "partial";
  }
  return "weak";
}

function detectDarkestSubjectColor(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): number | null {
  let bestColor: number | null = null;
  let bestLuma = Number.POSITIVE_INFINITY;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance)) {
        continue;
      }

      const offset = (y * image.width + x) * 4;
      const luma = luminance(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!);
      if (luma < bestLuma) {
        bestLuma = luma;
        bestColor = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
      }
    }
  }

  return bestColor;
}

function normalizeSourceColors(colors: readonly string[] | undefined): number[] {
  if (!colors) {
    return [];
  }

  const parsed: number[] = [];
  for (const color of colors) {
    try {
      parsed.push(parseHexColor(color));
    } catch {
      // Ignore invalid UI-supplied colors instead of aborting the whole cleanup pass.
    }
  }

  return [...new Set(parsed)];
}

function buildOutlineSourceMask(image: RGBAImage, subjectMask: Uint8Array, sourceColors: readonly number[]): Uint8Array {
  const mask = new Uint8Array(subjectMask.length);
  if (sourceColors.length === 0) {
    return mask;
  }

  for (let index = 0; index < subjectMask.length; index += 1) {
    if (subjectMask[index] === 0) {
      continue;
    }

    const offset = index * 4;
    const color = (image.data[offset]! << 16) | (image.data[offset + 1]! << 8) | image.data[offset + 2]!;
    if (sourceColors.some((sourceColor) => colorDistance(color, sourceColor) <= SOURCE_COLOR_MATCH_DISTANCE)) {
      mask[index] = 1;
    }
  }

  return mask;
}

function subtractMask(subjectMask: Uint8Array, subtract: Uint8Array): Uint8Array {
  const output = new Uint8Array(subjectMask.length);
  for (let index = 0; index < subjectMask.length; index += 1) {
    output[index] = subjectMask[index] === 1 && subtract[index] === 0 ? 1 : 0;
  }
  return output;
}

function buildSubjectMask(
  image: RGBAImage,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (!isOutsidePixel(image, x, y, alphaThreshold, background, backgroundTolerance)) {
        mask[y * image.width + x] = 1;
      }
    }
  }

  return mask;
}

function quantizeOutlineBucket(r: number, g: number, b: number): number {
  return ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
}

function createExteriorBackgroundModel(image: RGBAImage, corner: BackgroundSample, tolerance: number): ExteriorBackgroundModel {
  const analysis = analyzeBackground(image);
  const backgroundLikeBuckets = new Uint8Array(4096);
  const backgroundFamilyBuckets = new Uint8Array(4096);
  const backgroundDistance = new Float32Array(4096);
  const threshold = Math.max(analysis.thresholdOklab, ...analysis.clusters.map((cluster) => cluster.radiusOklab + 0.035));
  for (let bucket = 0; bucket < backgroundLikeBuckets.length; bucket += 1) {
    const r = ((bucket >> 8) & 0xf) * 16 + 8;
    const g = ((bucket >> 4) & 0xf) * 16 + 8;
    const b = (bucket & 0xf) * 16 + 8;
    const lab = rgbChannelsToOklab(r, g, b);
    const chroma = Math.sqrt(lab.y * lab.y + lab.z * lab.z);
    let minDistance = Number.POSITIVE_INFINITY;
    for (const cluster of analysis.clusters) {
      const dl = lab.x - cluster.centerL;
      const da = lab.y - cluster.centerA;
      const db = lab.z - cluster.centerB;
      const distance = Math.sqrt(dl * dl + da * da + db * db);
      if (distance < minDistance) {
        minDistance = distance;
      }
      if (distance <= threshold) {
        backgroundLikeBuckets[bucket] = 1;
      }
      const clusterChroma = Math.sqrt(cluster.centerA * cluster.centerA + cluster.centerB * cluster.centerB);
      if (chroma > 0.05 && clusterChroma > 0.05 && (lab.y * cluster.centerA + lab.z * cluster.centerB) / (chroma * clusterChroma) >= 0.9) {
        backgroundFamilyBuckets[bucket] = 1;
      }
      if (backgroundLikeBuckets[bucket] === 1 && backgroundFamilyBuckets[bucket] === 1 && minDistance === 0) {
        break;
      }
    }
    backgroundDistance[bucket] = Number.isFinite(minDistance) ? minDistance : 1;
  }
  return { corner, tolerance, backgroundLikeThreshold: threshold, backgroundLikeBuckets, backgroundFamilyBuckets, backgroundDistance };
}

function buildExteriorOutsideMask(image: RGBAImage, alphaThreshold: number, background: ExteriorBackgroundModel): Uint8Array {
  const { width, height } = image;
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let read = 0;
  let write = 0;

  for (let x = 0; x < width; x += 1) {
    write = enqueueExteriorPixel(image, mask, queue, write, x, 0, alphaThreshold, background);
    if (height > 1) {
      write = enqueueExteriorPixel(image, mask, queue, write, x, height - 1, alphaThreshold, background);
    }
  }
  for (let y = 1; y < height - 1; y += 1) {
    write = enqueueExteriorPixel(image, mask, queue, write, 0, y, alphaThreshold, background);
    if (width > 1) {
      write = enqueueExteriorPixel(image, mask, queue, write, width - 1, y, alphaThreshold, background);
    }
  }

  while (read < write) {
    const current = queue[read]!;
    read += 1;
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) {
      write = enqueueExteriorPixel(image, mask, queue, write, x - 1, y, alphaThreshold, background);
    }
    if (x + 1 < width) {
      write = enqueueExteriorPixel(image, mask, queue, write, x + 1, y, alphaThreshold, background);
    }
    if (y > 0) {
      write = enqueueExteriorPixel(image, mask, queue, write, x, y - 1, alphaThreshold, background);
    }
    if (y + 1 < height) {
      write = enqueueExteriorPixel(image, mask, queue, write, x, y + 1, alphaThreshold, background);
    }
  }

  return mask;
}

function enqueueExteriorPixel(
  image: RGBAImage,
  mask: Uint8Array,
  queue: Int32Array,
  write: number,
  x: number,
  y: number,
  alphaThreshold: number,
  background: ExteriorBackgroundModel
): number {
  const index = y * image.width + x;
  if (mask[index] === 1 || !isBackgroundLikePixel(image, index, alphaThreshold, background)) {
    return write;
  }
  mask[index] = 1;
  queue[write] = index;
  return write + 1;
}

function isBackgroundLikePixel(image: RGBAImage, index: number, alphaThreshold: number, background: ExteriorBackgroundModel): boolean {
  const offset = index * 4;
  const alpha = image.data[offset + 3]!;
  if (alpha <= alphaThreshold) {
    return true;
  }
  if (background.backgroundLikeBuckets[quantizeOutlineBucket(image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!)] === 1) {
    return true;
  }
  return (
    Math.abs(image.data[offset]! - background.corner.r) +
      Math.abs(image.data[offset + 1]! - background.corner.g) +
      Math.abs(image.data[offset + 2]! - background.corner.b) +
      Math.abs(alpha - background.corner.a) <=
    background.tolerance
  );
}

function countExterior4Neighbors(mask: Uint8Array, width: number, height: number, x: number, y: number): number {
  let count = 0;
  if (x === 0 || mask[y * width + x - 1] === 1) {
    count += 1;
  }
  if (x + 1 === width || mask[y * width + x + 1] === 1) {
    count += 1;
  }
  if (y === 0 || mask[(y - 1) * width + x] === 1) {
    count += 1;
  }
  if (y + 1 === height || mask[(y + 1) * width + x] === 1) {
    count += 1;
  }
  return count;
}

const UNREACHABLE_EXTERIOR_DEPTH = 0xffff;

function buildExteriorDepthMap(outsideMask: Uint8Array, width: number, height: number): Uint16Array {
  const depth = new Uint16Array(width * height);
  depth.fill(UNREACHABLE_EXTERIOR_DEPTH);
  const queue = new Int32Array(width * height);
  let read = 0;
  let write = 0;

  for (let index = 0; index < outsideMask.length; index += 1) {
    if (outsideMask[index] === 1) {
      depth[index] = 0;
      queue[write] = index;
      write += 1;
    }
  }

  while (read < write) {
    const current = queue[read]!;
    read += 1;
    const nextDepth = depth[current]! + 1;
    const x = current % width;
    const y = Math.floor(current / width);
    if (x > 0) {
      write = enqueueDepthNeighbor(outsideMask, depth, queue, write, current - 1, nextDepth);
    }
    if (x + 1 < width) {
      write = enqueueDepthNeighbor(outsideMask, depth, queue, write, current + 1, nextDepth);
    }
    if (y > 0) {
      write = enqueueDepthNeighbor(outsideMask, depth, queue, write, current - width, nextDepth);
    }
    if (y + 1 < height) {
      write = enqueueDepthNeighbor(outsideMask, depth, queue, write, current + width, nextDepth);
    }
  }

  return depth;
}

function enqueueDepthNeighbor(
  outsideMask: Uint8Array,
  depth: Uint16Array,
  queue: Int32Array,
  write: number,
  index: number,
  nextDepth: number
): number {
  if (outsideMask[index] === 1 || depth[index] !== UNREACHABLE_EXTERIOR_DEPTH) {
    return write;
  }
  depth[index] = Math.min(UNREACHABLE_EXTERIOR_DEPTH - 1, nextDepth);
  queue[write] = index;
  return write + 1;
}

function hasInnerDarkerNeighbor(
  image: RGBAImage,
  outsideMask: Uint8Array,
  exteriorDepth: Uint16Array,
  alphaThreshold: number,
  candidateBucket: number,
  x: number,
  y: number,
  candidateLuma: number,
  distance: number
): boolean {
  const candidateDepth = exteriorDepth[y * image.width + x]!;
  if (candidateDepth === UNREACHABLE_EXTERIOR_DEPTH) {
    return false;
  }

  for (let dy = -distance; dy <= distance; dy += 1) {
    for (let dx = -distance; dx <= distance; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
        continue;
      }
      const index = ny * image.width + nx;
      if (outsideMask[index] === 1) {
        continue;
      }
      const neighborDepth = exteriorDepth[index]!;
      if (neighborDepth <= candidateDepth || neighborDepth > candidateDepth + distance) {
        continue;
      }
      const offset = index * 4;
      if (image.data[offset + 3]! <= alphaThreshold) {
        continue;
      }
      const r = image.data[offset]!;
      const g = image.data[offset + 1]!;
      const b = image.data[offset + 2]!;
      if (quantizeOutlineBucket(r, g, b) === candidateBucket) {
        continue;
      }
      const neighborLuma = luminance(r, g, b);
      if (neighborLuma + 12 < candidateLuma || neighborLuma <= 64) {
        return true;
      }
    }
  }
  return false;
}

function removeOrphanComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  preserveSinglePixelDetails: boolean
): Uint8Array {
  const labels = new Int32Array(mask.length);
  const queue = new Int32Array(mask.length);
  const sizes: number[] = [0];
  let label = 0;
  let largestSize = 0;

  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 0 || labels[index] !== 0) {
      continue;
    }

    label += 1;
    let read = 0;
    let write = 0;
    labels[index] = label;
    queue[write] = index;
    write += 1;

    while (read < write) {
      const current = queue[read]!;
      read += 1;
      const x = current % width;
      const y = Math.floor(current / width);

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) {
            continue;
          }

          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
            continue;
          }

          const neighbor = ny * width + nx;
          if (mask[neighbor] === 0 || labels[neighbor] !== 0) {
            continue;
          }

          labels[neighbor] = label;
          queue[write] = neighbor;
          write += 1;
        }
      }
    }

    sizes[label] = write;
    if (write > largestSize) {
      largestSize = write;
    }
  }

  if (label <= 1) {
    return mask;
  }

  const minComponentSize = preserveSinglePixelDetails ? 2 : 4;
  const output = new Uint8Array(mask);
  for (let index = 0; index < output.length; index += 1) {
    const component = labels[index]!;
    if (component > 0 && sizes[component]! < minComponentSize && sizes[component]! < largestSize) {
      output[index] = 0;
    }
  }

  return output;
}

function closeOnePixelGaps(mask: Uint8Array, width: number, height: number): Uint8Array {
  const output = new Uint8Array(mask);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (mask[index] === 1) {
        continue;
      }

      const north = mask[index - width]!;
      const south = mask[index + width]!;
      const west = mask[index - 1]!;
      const east = mask[index + 1]!;
      if (north + south + west + east === 4 || countMaskedNeighbors(mask, width, height, x, y, 1) >= 7) {
        output[index] = 1;
      }
    }
  }

  return output;
}

function clearRemovedSubjectPixels(output: RGBAImage, rawMask: Uint8Array, cleanMask: Uint8Array): void {
  for (let index = 0; index < rawMask.length; index += 1) {
    if (rawMask[index] === 1 && cleanMask[index] === 0) {
      const offset = index * 4;
      output.data[offset] = 0;
      output.data[offset + 1] = 0;
      output.data[offset + 2] = 0;
      output.data[offset + 3] = 0;
    }
  }
}

function fillClosedSubjectGaps(output: RGBAImage, image: RGBAImage, sourceMask: Uint8Array, cleanMask: Uint8Array): void {
  for (let index = 0; index < cleanMask.length; index += 1) {
    if (sourceMask[index] === 1 || cleanMask[index] === 0) {
      continue;
    }

    const x = index % image.width;
    const y = Math.floor(index / image.width);
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) {
          continue;
        }

        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) {
          continue;
        }

        const neighbor = ny * image.width + nx;
        if (sourceMask[neighbor] === 0) {
          continue;
        }

        const offset = neighbor * 4;
        r += image.data[offset]!;
        g += image.data[offset + 1]!;
        b += image.data[offset + 2]!;
        a += image.data[offset + 3]!;
        count += 1;
      }
    }

    if (count === 0) {
      continue;
    }

    const offset = index * 4;
    output.data[offset] = Math.round(r / count);
    output.data[offset + 1] = Math.round(g / count);
    output.data[offset + 2] = Math.round(b / count);
    output.data[offset + 3] = Math.round(a / count);
  }
}

function hasMaskedSubjectNeighbor(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number
): boolean {
  for (let dy = -size; dy <= size; dy += 1) {
    for (let dx = -size; dx <= size; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      if (mask[ny * width + nx] === 1) {
        return true;
      }
    }
  }

  return false;
}

function countMaskedNeighbors(mask: Uint8Array, width: number, height: number, x: number, y: number, size: number): number {
  let count = 0;
  for (let dy = -size; dy <= size; dy += 1) {
    for (let dx = -size; dx <= size; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      count += mask[ny * width + nx]!;
    }
  }

  return count;
}

function normalizeOutlineSize(size: number): number {
  if (!Number.isFinite(size)) {
    return 1;
  }

  return Math.max(1, Math.min(8, Math.round(size)));
}

function hasOutsideNeighbor(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      if (isOutsidePixel(image, x + dx, y + dy, alphaThreshold, background, backgroundTolerance)) {
        return true;
      }
    }
  }

  return false;
}

function isOutsidePixel(
  image: RGBAImage,
  x: number,
  y: number,
  alphaThreshold: number,
  background: BackgroundSample,
  backgroundTolerance: number
): boolean {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
    return true;
  }

  const offset = (y * image.width + x) * 4;
  const alpha = image.data[offset + 3]!;
  if (alpha <= alphaThreshold) {
    return true;
  }

  return (
    Math.abs(image.data[offset]! - background.r) +
      Math.abs(image.data[offset + 1]! - background.g) +
      Math.abs(image.data[offset + 2]! - background.b) +
      Math.abs(alpha - background.a) <=
    backgroundTolerance
  );
}

function colorDistance(left: number, right: number): number {
  const [lr, lg, lb] = unpackRgb(left, 255);
  const [rr, rg, rb] = unpackRgb(right, 255);
  return Math.abs(lr - rr) + Math.abs(lg - rg) + Math.abs(lb - rb);
}

function estimateCornerBackground(image: RGBAImage): BackgroundSample {
  const sampleSize = Math.max(1, Math.min(8, Math.floor(Math.min(image.width, image.height) / 4)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const topLeft = (y * image.width + x) * 4;
      const topRight = (y * image.width + image.width - sampleSize + x) * 4;
      const bottomLeft = ((image.height - sampleSize + y) * image.width + x) * 4;
      const bottomRight = ((image.height - sampleSize + y) * image.width + image.width - sampleSize + x) * 4;

      r += image.data[topLeft]! + image.data[topRight]! + image.data[bottomLeft]! + image.data[bottomRight]!;
      g += image.data[topLeft + 1]! + image.data[topRight + 1]! + image.data[bottomLeft + 1]! + image.data[bottomRight + 1]!;
      b += image.data[topLeft + 2]! + image.data[topRight + 2]! + image.data[bottomLeft + 2]! + image.data[bottomRight + 2]!;
      a += image.data[topLeft + 3]! + image.data[topRight + 3]! + image.data[bottomLeft + 3]! + image.data[bottomRight + 3]!;
      count += 4;
    }
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
    a: a / count
  };
}

function luminance(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
