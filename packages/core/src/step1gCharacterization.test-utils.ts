import type { Step1GNativeSizeFixture } from "@pixelaid/fixtures";
import { createGoldenSignature } from "@pixelaid/fixtures";
import type { RGBAImage } from "@pixelaid/shared";
import { fixImage } from "./fix";
import { detectGridCandidates } from "./grid";
import { roundTripWebp } from "./goldenImage.test-utils";

export type Step1GCandidateSummary = {
  width: number;
  height: number;
  confidence: number;
};

export type Step1GReconstructionSummary = {
  exactPixelMatch: number;
  paletteLabelAccuracy: number;
  alphaMaskIou: number | null;
  meanAbsoluteChannelError: number;
};

export type Step1GCharacterization = {
  id: string;
  failureClass: string;
  role: string;
  nativeSize: string;
  inputSize: string;
  topCandidates: Step1GCandidateSummary[];
  authoredCandidateRank: number | null;
  selectedSize: string;
  selectedSizeExact: boolean;
  confidenceLabel: string | null;
  reconstruction: Step1GReconstructionSummary | null;
  passesAcceptance: boolean;
  failureReasons: string[];
};

export async function materializeStep1GInput(
  fixture: Step1GNativeSizeFixture
): Promise<RGBAImage> {
  const preCodec = fixture.createPreCodecImage();
  if (!fixture.codec) {
    return preCodec;
  }
  return roundTripWebp(preCodec, {
    quality: fixture.codec.quality,
    method: fixture.codec.method
  });
}

export async function characterizeStep1GFixture(
  fixture: Step1GNativeSizeFixture
): Promise<Step1GCharacterization> {
  const source = await materializeStep1GInput(fixture);
  const before = createGoldenSignature(source);
  const candidates = detectGridCandidates(source, {
    strategy: "robust",
    maxScale: 32,
    sampling: "full",
    cropToBounds: false
  });
  const selected = candidates[0]!;
  const authoredCandidateIndex = candidates.findIndex(
    (candidate) =>
      candidate.outputWidth === fixture.nativeWidth &&
      candidate.outputHeight === fixture.nativeHeight
  );
  const fixed = fixImage(source, {
    mode: "single",
    assetType: "sprite",
    maxColors: 512,
    grid: {
      detect: "auto",
      autoStrategy: "robust",
      cropToBounds: false,
      localCorrection: false
    },
    downscale: "adaptive",
    alpha: "preserve",
    cleanup: {
      removeOrphans: false,
      jaggyCleanup: false,
      preserveSinglePixelDetails: true,
      removeHalos: false,
      denoiseStrength: 0,
      outlineMode: "none"
    }
  });
  const selectedSizeExact =
    fixed.image.width === fixture.nativeWidth &&
    fixed.image.height === fixture.nativeHeight;
  const reconstruction = selectedSizeExact
    ? compareReconstruction(fixture.createNativeImage(), fixed.image)
    : null;
  const failureReasons = evaluateAcceptance(fixture, selectedSizeExact, reconstruction);

  if (JSON.stringify(createGoldenSignature(source)) !== JSON.stringify(before)) {
    throw new Error(`Step 1G characterization mutated source fixture ${fixture.id}`);
  }

  return {
    id: fixture.id,
    failureClass: fixture.failureClass,
    role: fixture.role,
    nativeSize: `${fixture.nativeWidth}x${fixture.nativeHeight}`,
    inputSize: `${source.width}x${source.height}`,
    topCandidates: candidates.map((candidate) => ({
      width: candidate.outputWidth,
      height: candidate.outputHeight,
      confidence: round(candidate.confidence)
    })),
    authoredCandidateRank: authoredCandidateIndex < 0 ? null : authoredCandidateIndex + 1,
    selectedSize: `${fixed.image.width}x${fixed.image.height}`,
    selectedSizeExact,
    confidenceLabel: selected.diagnostics?.confidenceLabel ?? null,
    reconstruction,
    passesAcceptance: failureReasons.length === 0,
    failureReasons
  };
}

function compareReconstruction(expected: RGBAImage, actual: RGBAImage): Step1GReconstructionSummary {
  const palette = collectOpaquePalette(expected);
  let exactPixels = 0;
  let paletteLabels = 0;
  let expectedOpaque = 0;
  let actualOpaque = 0;
  let opaqueIntersection = 0;
  let absoluteChannelError = 0;
  const pixelCount = expected.width * expected.height;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    let exact = true;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(actual.data[offset + channel]! - expected.data[offset + channel]!);
      absoluteChannelError += delta;
      if (delta !== 0) {
        exact = false;
      }
    }
    if (exact) {
      exactPixels += 1;
    }

    const expectedVisible = expected.data[offset + 3]! >= 128;
    const actualVisible = actual.data[offset + 3]! >= 128;
    if (expectedVisible) expectedOpaque += 1;
    if (actualVisible) actualOpaque += 1;
    if (expectedVisible && actualVisible) opaqueIntersection += 1;

    if (!expectedVisible && !actualVisible) {
      paletteLabels += 1;
    } else if (
      expectedVisible &&
      actualVisible &&
      nearestPaletteIndex(expected, offset, palette) ===
        nearestPaletteIndex(actual, offset, palette)
    ) {
      paletteLabels += 1;
    }
  }

  const opaqueUnion = expectedOpaque + actualOpaque - opaqueIntersection;
  return {
    exactPixelMatch: round(exactPixels / pixelCount),
    paletteLabelAccuracy: round(paletteLabels / pixelCount),
    alphaMaskIou: opaqueUnion === 0 ? null : round(opaqueIntersection / opaqueUnion),
    meanAbsoluteChannelError: round(absoluteChannelError / (pixelCount * 4))
  };
}

function collectOpaquePalette(image: RGBAImage): Uint8Array {
  const colors = new Map<number, readonly [number, number, number]>();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    if (image.data[offset + 3]! < 128) continue;
    const r = image.data[offset]!;
    const g = image.data[offset + 1]!;
    const b = image.data[offset + 2]!;
    const key = (r << 16) | (g << 8) | b;
    colors.set(key, [r, g, b]);
  }

  const palette = new Uint8Array(colors.size * 3);
  let index = 0;
  for (const color of colors.values()) {
    palette[index] = color[0];
    palette[index + 1] = color[1];
    palette[index + 2] = color[2];
    index += 3;
  }
  return palette;
}

function nearestPaletteIndex(image: RGBAImage, offset: number, palette: Uint8Array): number {
  const r = image.data[offset]!;
  const g = image.data[offset + 1]!;
  const b = image.data[offset + 2]!;
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < palette.length; index += 3) {
    const dr = r - palette[index]!;
    const dg = g - palette[index + 1]!;
    const db = b - palette[index + 2]!;
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index / 3;
    }
  }
  return bestIndex;
}

function evaluateAcceptance(
  fixture: Step1GNativeSizeFixture,
  selectedSizeExact: boolean,
  reconstruction: Step1GReconstructionSummary | null
): string[] {
  const failures: string[] = [];
  if (fixture.acceptance.requireExactTopCandidate && !selectedSizeExact) {
    failures.push("authored native size is not the top candidate");
    return failures;
  }
  if (!reconstruction) {
    failures.push("reconstruction metrics are unavailable");
    return failures;
  }
  if (reconstruction.paletteLabelAccuracy < fixture.acceptance.minPaletteLabelAccuracy) {
    failures.push(
      `palette-label accuracy ${reconstruction.paletteLabelAccuracy} is below ${fixture.acceptance.minPaletteLabelAccuracy}`
    );
  }
  if (
    fixture.acceptance.minAlphaMaskIou !== undefined &&
    (reconstruction.alphaMaskIou ?? 0) < fixture.acceptance.minAlphaMaskIou
  ) {
    failures.push(
      `alpha-mask IoU ${reconstruction.alphaMaskIou ?? 0} is below ${fixture.acceptance.minAlphaMaskIou}`
    );
  }
  if (
    fixture.acceptance.minExactPixelMatch !== undefined &&
    reconstruction.exactPixelMatch < fixture.acceptance.minExactPixelMatch
  ) {
    failures.push(
      `exact pixel match ${reconstruction.exactPixelMatch} is below ${fixture.acceptance.minExactPixelMatch}`
    );
  }
  return failures;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
