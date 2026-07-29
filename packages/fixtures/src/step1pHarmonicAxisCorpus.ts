import type { RGBAImage } from "@pixelaid/shared";
import {
  applyBoxBlur,
  upscaleNativeImage,
  type NativeSizeResample
} from "./nativeSizeDegradations";
import {
  step1oNativeSizeCorpus,
  type Step1ONativeSizeFixture
} from "./step1oNativeSizeCorpus";

export type Step1PHarmonicAxisFixtureRole =
  | "harmonic-axis-recovery"
  | "anisotropic-control"
  | "crisp-control";

export type Step1PHarmonicAxisFixture = {
  id: string;
  role: Step1PHarmonicAxisFixtureRole;
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
  role: "harmonic-axis-recovery";
  description: string;
  scaleX: number;
  scaleY: number;
  resample: NativeSizeResample;
  blurPasses?: number;
  protects: readonly string[];
};

type ControlDefinition = {
  id: string;
  sourceFixtureId: string;
  role: "anisotropic-control" | "crisp-control";
  description: string;
  protects: readonly string[];
};

const definitions: readonly (
  | RecoveryDefinition
  | ControlDefinition
)[] = [
  {
    id: "step1p-harmonic-axis-tall-console-20x32",
    sourceFixtureId:
      "step1o-aspect-tall-console-20x32",
    role: "harmonic-axis-recovery",
    description:
      "Tall console whose horizontal cell count collapses to one half while the correct pair remains scored.",
    scaleX: 4.18,
    scaleY: 4.22,
    resample: "nearest",
    protects: [
      "one-axis harmonic recovery",
      "rectangular native aspect",
      "crisp nearest boundaries"
    ]
  },
  {
    id: "step1p-harmonic-axis-soft-lattice-16x16",
    sourceFixtureId:
      "step1o-aspect-square-lattice-16x16",
    role: "harmonic-axis-recovery",
    description:
      "Square lattice whose softened vertical count collapses to one half.",
    scaleX: 6.24,
    scaleY: 6.28,
    resample: "nearest",
    blurPasses: 2,
    protects: [
      "one-axis harmonic recovery",
      "square native aspect",
      "broad softened boundaries"
    ]
  },
  {
    id: "step1p-harmonic-control-anisotropic-wide-32x20",
    sourceFixtureId:
      "step1o-aspect-wide-console-32x20",
    role: "anisotropic-control",
    description:
      "Wide exact output guarding legitimate unequal source periods.",
    protects: [
      "legitimate anisotropic scaling",
      "wide native aspect",
      "existing exact selection"
    ]
  },
  {
    id: "step1p-harmonic-control-anisotropic-tall-20x32",
    sourceFixtureId:
      "step1o-aspect-tall-console-20x32",
    role: "anisotropic-control",
    description:
      "Tall exact output guarding transposed unequal source periods.",
    protects: [
      "legitimate anisotropic scaling",
      "tall native aspect",
      "existing exact selection"
    ]
  },
  {
    id: "step1p-harmonic-control-crisp-grid-24x24",
    sourceFixtureId:
      "step1o-control-dense-grid-24x24",
    role: "crisp-control",
    description:
      "Dense exact-period control guarding against unsupported harmonic expansion.",
    protects: [
      "crisp-grid exactness",
      "dense boundary evidence",
      "harmonic switch rejection"
    ]
  }
];

export const step1pHarmonicAxisCorpus:
  readonly Step1PHarmonicAxisFixture[] =
    definitions.map(createFixture);

function createFixture(
  definition: RecoveryDefinition | ControlDefinition
): Step1PHarmonicAxisFixture {
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
      definition.role === "harmonic-axis-recovery"
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
  if (definition.blurPasses) {
    image = applyBoxBlur(
      image,
      definition.blurPasses
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
