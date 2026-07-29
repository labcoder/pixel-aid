import type { RGBAImage } from "@pixelaid/shared";
import {
  applyChromaNoise,
  upscaleNativeImage,
  type NativeSizeResample
} from "./nativeSizeDegradations";
import {
  step1oNativeSizeCorpus,
  type Step1ONativeSizeFixture
} from "./step1oNativeSizeCorpus";

export type Step1PAdjacentFixtureRole =
  | "adjacent-recovery"
  | "anisotropic-control"
  | "stable-control";

export type Step1PAdjacentNativeSizeFixture = {
  id: string;
  role: Step1PAdjacentFixtureRole;
  description: string;
  nativeWidth: number;
  nativeHeight: number;
  provenance: "first-party-synthetic";
  derivedFromBenchmarkIdentity: false;
  protects: readonly string[];
  createNativeImage: () => RGBAImage;
  createInputImage: () => RGBAImage;
};

type RecoveryDefinition = {
  id: string;
  sourceFixtureId: string;
  role: "adjacent-recovery";
  description: string;
  scaleX: number;
  scaleY: number;
  resample: NativeSizeResample;
  chromaNoise?: number;
  protects: readonly string[];
};

type ControlDefinition = {
  id: string;
  sourceFixtureId: string;
  role: "anisotropic-control" | "stable-control";
  description: string;
  protects: readonly string[];
};

const definitions: readonly (
  | RecoveryDefinition
  | ControlDefinition
)[] = [
  {
    id: "step1p-adjacent-soft-frame-17x18",
    sourceFixtureId:
      "step1o-boundary-soft-frame-17x18",
    role: "adjacent-recovery",
    description:
      "Fractional bilinear frame whose selected width is one cell too large despite a more coherent authored period pair.",
    scaleX: 4.28,
    scaleY: 4.35,
    resample: "bilinear",
    protects: [
      "one-cell width correction",
      "near-isotropic period coherence",
      "fractional bilinear boundaries"
    ]
  },
  {
    id: "step1p-adjacent-noisy-panel-height-31x20",
    sourceFixtureId:
      "step1o-boundary-warped-panel-31x20",
    role: "adjacent-recovery",
    description:
      "Wide chroma-noisy panel whose selected height is one cell too large.",
    scaleX: 4.12,
    scaleY: 4.19,
    resample: "bilinear",
    chromaNoise: 3,
    protects: [
      "one-cell height correction",
      "wide native aspect",
      "chroma-noisy period coherence"
    ]
  },
  {
    id: "step1p-adjacent-noisy-panel-width-31x20",
    sourceFixtureId:
      "step1o-boundary-warped-panel-31x20",
    role: "adjacent-recovery",
    description:
      "Nearest-scaled panel whose selected width is one cell too small.",
    scaleX: 4.83,
    scaleY: 4.9,
    resample: "nearest",
    chromaNoise: 3,
    protects: [
      "one-cell width correction",
      "nearest-scale chroma noise",
      "non-common native width"
    ]
  },
  {
    id: "step1p-control-anisotropic-wide-32x20",
    sourceFixtureId:
      "step1o-aspect-wide-console-32x20",
    role: "anisotropic-control",
    description:
      "Correct wide output under intentionally different horizontal and vertical source periods.",
    protects: [
      "legitimate anisotropic scaling",
      "wide native aspect",
      "existing exact selection"
    ]
  },
  {
    id: "step1p-control-anisotropic-tall-20x32",
    sourceFixtureId:
      "step1o-aspect-tall-console-20x32",
    role: "anisotropic-control",
    description:
      "Correct tall output under transposed anisotropic source periods.",
    protects: [
      "legitimate anisotropic scaling",
      "tall native aspect",
      "existing exact selection"
    ]
  },
  {
    id: "step1p-control-fractional-pin-13x9",
    sourceFixtureId: "step1o-boundary-pin-13x9",
    role: "stable-control",
    description:
      "Existing exact small icon guarding against unnecessary adjacent correction.",
    protects: [
      "existing exact selection",
      "small unequal dimensions",
      "fractional chroma-noisy scaling"
    ]
  }
];

export const step1pAdjacentNativeSizeCorpus:
  readonly Step1PAdjacentNativeSizeFixture[] =
    definitions.map(createFixture);

function createFixture(
  definition: RecoveryDefinition | ControlDefinition
): Step1PAdjacentNativeSizeFixture {
  const source = requiredStep1OSource(
    definition.sourceFixtureId
  );
  return {
    id: definition.id,
    role: definition.role,
    description: definition.description,
    nativeWidth: source.nativeWidth,
    nativeHeight: source.nativeHeight,
    provenance: "first-party-synthetic",
    derivedFromBenchmarkIdentity: false,
    protects: definition.protects,
    createNativeImage: source.createNativeImage,
    createInputImage:
      definition.role === "adjacent-recovery"
        ? () => createRecoveryInput(source, definition)
        : source.createInputImage
  };
}

function createRecoveryInput(
  source: Step1ONativeSizeFixture,
  definition: RecoveryDefinition
): RGBAImage {
  let image = upscaleNativeImage(
    source.createNativeImage(),
    definition.scaleX,
    definition.scaleY,
    definition.resample
  );
  if (definition.chromaNoise) {
    image = applyChromaNoise(
      image,
      definition.chromaNoise,
      4_019
    );
  }
  return image;
}

function requiredStep1OSource(
  id: string
): Step1ONativeSizeFixture {
  const fixture = step1oNativeSizeCorpus.find(
    (item) => item.id === id
  );
  if (!fixture) {
    throw new Error(
      `Missing Step 1O fixture source "${id}".`
    );
  }
  return fixture;
}
