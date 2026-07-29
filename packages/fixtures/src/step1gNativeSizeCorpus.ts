import type { RGBAImage } from "@pixelaid/shared";
import {
  applyBicubicLikeRinging,
  applyBoundaryWarp,
  applyBoxBlur,
  applyCellArtifact,
  applyChromaNoise,
  applyLowFrequencyColorField,
  upscaleNativeImage,
  type NativeSizeResample
} from "./nativeSizeDegradations";
import {
  nativeSizeSourceFamilies,
  type NativeSizeSourceFamilyId
} from "./nativeSizeSourceFamilies";

export type Step1GFailureClass =
  | "color-field"
  | "webp"
  | "chroma-noise"
  | "bicubic"
  | "native-aa"
  | "mush-warp"
  | "blur"
  | "grid-soften"
  | "clean-nn"
  | "cell-texture"
  | "cell-gradient"
  | "cell-noise";

export type Step1GFixtureRole = "challenge" | "control";

export type Step1GAcceptance = {
  requireExactTopCandidate: true;
  minPaletteLabelAccuracy: number;
  minAlphaMaskIou?: number;
  minExactPixelMatch?: number;
};

export type Step1GCodec = {
  format: "webp";
  quality: number;
  method: number;
};

export type Step1GNativeSizeFixture = {
  id: string;
  failureClass: Step1GFailureClass;
  role: Step1GFixtureRole;
  sourceFamilyId: NativeSizeSourceFamilyId;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  expectedScaleX: number;
  expectedScaleY: number;
  provenance: "first-party-synthetic";
  acceptance: Step1GAcceptance;
  protects: readonly string[];
  codec?: Step1GCodec;
  createNativeImage: () => RGBAImage;
  createPreCodecImage: () => RGBAImage;
};

type Step1GFixtureDefinition = {
  id: string;
  failureClass: Step1GFailureClass;
  role: Step1GFixtureRole;
  sourceFamilyId: NativeSizeSourceFamilyId;
  description: string;
  scaleX: number;
  scaleY: number;
  resample: NativeSizeResample;
  acceptance: Step1GAcceptance;
  protects: readonly string[];
  codec?: Step1GCodec;
};

const definitions: readonly Step1GFixtureDefinition[] = [
  {
    id: "step1g-color-field-tall-character",
    failureClass: "color-field",
    role: "challenge",
    sourceFamilyId: "tall-character",
    description: "Tall sparse character under a low-frequency channel-specific lighting field.",
    scaleX: 5.25,
    scaleY: 5.18,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.96,
      minAlphaMaskIou: 0.98
    },
    protects: ["non-square native dimensions", "sparse character silhouettes", "color drift tolerance"]
  },
  {
    id: "step1g-webp-terrain-tile",
    failureClass: "webp",
    role: "challenge",
    sourceFamilyId: "terrain-tile",
    description: "Dense terrain tile prepared for a real lossy WebP round trip.",
    scaleX: 4,
    scaleY: 4,
    resample: "nearest",
    codec: { format: "webp", quality: 32, method: 4 },
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.96
    },
    protects: ["codec chroma subsampling", "dense tile detail", "short repeated runs"]
  },
  {
    id: "step1g-chroma-noise-ui-glyph",
    failureClass: "chroma-noise",
    role: "challenge",
    sourceFamilyId: "ui-glyph",
    description: "Thin circular UI geometry with deterministic channel-opposed color noise.",
    scaleX: 5,
    scaleY: 5,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.98
    },
    protects: ["thin UI rings", "isolated diagonal marks", "chroma noise tolerance"]
  },
  {
    id: "step1g-bicubic-micro-tile",
    failureClass: "bicubic",
    role: "challenge",
    sourceFamilyId: "micro-tile",
    description: "Tiny high-contrast tile with fractional smoothing and sharpened ringing.",
    scaleX: 14.5,
    scaleY: 13.75,
    resample: "bilinear",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.9
    },
    protects: ["very small native sizes", "ringing around high-contrast boundaries"]
  },
  {
    id: "step1g-native-aa-small-prop",
    failureClass: "native-aa",
    role: "challenge",
    sourceFamilyId: "small-prop",
    description: "Transparent outlined prop whose native edges are represented by bilinear alpha ramps.",
    scaleX: 6,
    scaleY: 6,
    resample: "bilinear",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.92,
      minAlphaMaskIou: 0.96
    },
    protects: ["soft alpha boundaries", "outlined prop geometry", "single-pixel highlights"]
  },
  {
    id: "step1g-mush-warp-tall-character",
    failureClass: "mush-warp",
    role: "challenge",
    sourceFamilyId: "tall-character",
    description: "Tall character with locally displaced and mildly softened block boundaries.",
    scaleX: 4.75,
    scaleY: 4.9,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.88,
      minAlphaMaskIou: 0.94
    },
    protects: ["local grid drift", "mushy character outlines", "independent axis scales"]
  },
  {
    id: "step1g-blur-small-prop",
    failureClass: "blur",
    role: "challenge",
    sourceFamilyId: "small-prop",
    description: "Compact prop under two passes of deterministic spatial blur.",
    scaleX: 6.2,
    scaleY: 6.2,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.92,
      minAlphaMaskIou: 0.95
    },
    protects: ["broad transition evidence", "small isolated details", "transparent boundaries"]
  },
  {
    id: "step1g-grid-soften-flat-panel",
    failureClass: "grid-soften",
    role: "challenge",
    sourceFamilyId: "flat-panel",
    description: "Wide flat panel with fractional resampling and softened grid boundaries.",
    scaleX: 3.75,
    scaleY: 4.25,
    resample: "bilinear",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.94
    },
    protects: ["flat color fields", "harmonic ambiguity", "non-square scaling"]
  },
  {
    id: "step1g-clean-nearest-tall-character",
    failureClass: "clean-nn",
    role: "control",
    sourceFamilyId: "tall-character",
    description: "Clean nearest-neighbor character control at an integer scale.",
    scaleX: 5,
    scaleY: 5,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 1,
      minAlphaMaskIou: 1,
      minExactPixelMatch: 1
    },
    protects: ["clean nearest-neighbor exactness", "character native size"]
  },
  {
    id: "step1g-cell-texture-micro-tile",
    failureClass: "cell-texture",
    role: "control",
    sourceFamilyId: "micro-tile",
    description: "Micro tile with balanced checker texture inside every apparent source cell.",
    scaleX: 16,
    scaleY: 16,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.95
    },
    protects: ["cell-texture strength", "micro-tile sizing"]
  },
  {
    id: "step1g-cell-gradient-terrain-tile",
    failureClass: "cell-gradient",
    role: "control",
    sourceFamilyId: "terrain-tile",
    description: "Terrain tile with a repeated low-amplitude gradient inside every apparent source cell.",
    scaleX: 4,
    scaleY: 4,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.98
    },
    protects: ["cell-gradient tolerance", "terrain structure"]
  },
  {
    id: "step1g-cell-noise-ui-glyph",
    failureClass: "cell-noise",
    role: "control",
    sourceFamilyId: "ui-glyph",
    description: "UI glyph with low-amplitude luminance noise contained inside each apparent source cell.",
    scaleX: 5,
    scaleY: 5,
    resample: "nearest",
    acceptance: {
      requireExactTopCandidate: true,
      minPaletteLabelAccuracy: 0.98
    },
    protects: ["cell-noise tolerance", "thin UI geometry"]
  }
];

export const step1gNativeSizeCorpus: readonly Step1GNativeSizeFixture[] =
  definitions.map(createFixture);

function createFixture(definition: Step1GFixtureDefinition): Step1GNativeSizeFixture {
  const sourceFamily = nativeSizeSourceFamilies.find(
    (family) => family.id === definition.sourceFamilyId
  );
  if (!sourceFamily) {
    throw new Error(`Missing native-size source family ${definition.sourceFamilyId}`);
  }

  const outputWidth = Math.round(sourceFamily.nativeWidth * definition.scaleX);
  const outputHeight = Math.round(sourceFamily.nativeHeight * definition.scaleY);
  return {
    id: definition.id,
    failureClass: definition.failureClass,
    role: definition.role,
    sourceFamilyId: definition.sourceFamilyId,
    description: definition.description,
    nativeWidth: sourceFamily.nativeWidth,
    nativeHeight: sourceFamily.nativeHeight,
    expectedScaleX: outputWidth / sourceFamily.nativeWidth,
    expectedScaleY: outputHeight / sourceFamily.nativeHeight,
    provenance: "first-party-synthetic",
    acceptance: definition.acceptance,
    protects: definition.protects,
    ...(definition.codec ? { codec: definition.codec } : {}),
    createNativeImage: sourceFamily.createImage,
    createPreCodecImage: () => createDegradedImage(sourceFamily.createImage(), definition)
  };
}

function createDegradedImage(
  native: RGBAImage,
  definition: Step1GFixtureDefinition
): RGBAImage {
  let image = upscaleNativeImage(
    native,
    definition.scaleX,
    definition.scaleY,
    definition.resample
  );

  switch (definition.failureClass) {
    case "color-field":
      return applyLowFrequencyColorField(image, 24);
    case "webp":
    case "clean-nn":
      return image;
    case "chroma-noise":
      return applyChromaNoise(image, 9, 41);
    case "bicubic":
      return applyBicubicLikeRinging(image, 0.9);
    case "native-aa":
      return image;
    case "mush-warp":
      image = applyBoundaryWarp(image, 2, 19);
      return applyBoxBlur(image, 1);
    case "blur":
      return applyBoxBlur(image, 2);
    case "grid-soften":
      return applyBoxBlur(image, 1);
    case "cell-texture":
      return applyCellArtifact(image, definition.scaleX, definition.scaleY, "texture", 5);
    case "cell-gradient":
      return applyCellArtifact(image, definition.scaleX, definition.scaleY, "gradient", 7);
    case "cell-noise":
      return applyCellArtifact(image, definition.scaleX, definition.scaleY, "noise", 5);
  }
}
