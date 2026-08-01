import type { AssetType, RGBAImage } from "@pixelaid/shared";
import { createImage, fillRect } from "./imagePrimitives";
import { step1oNativeSizeCorpus } from "./step1oNativeSizeCorpus";
import { step1pAdjacentNativeSizeCorpus } from "./step1pAdjacentNativeSizeCorpus";
import { transparentMatteHaloSprites } from "./transparentMatteHaloSprites";

export type RobustProductReviewFailureClass =
  | "false-anisotropy"
  | "legitimate-anisotropy"
  | "outline-cleanup"
  | "native-input-preservation"
  | "full-canvas-background";

export type RobustProductReviewFixture = {
  id: string;
  failureClass: RobustProductReviewFailureClass;
  assetType: AssetType;
  description: string;
  provenance: "first-party-synthetic";
  derivedFromBenchmarkIdentity: false;
  expectedNativeSize?: { width: number; height: number };
  expectsFullCanvas: boolean;
  protects: readonly string[];
  createInputImage: () => RGBAImage;
};

const squareAxisFixture = requiredStep1OFixture(
  "step1o-aspect-square-lattice-16x16"
);
const legitimateAnisotropyFixture = requiredStep1PFixture(
  "step1p-control-anisotropic-wide-32x20"
);
const nativeInputFixture = requiredStep1OFixture(
  "step1o-control-rectangular-grid-21x17"
);
const outlineFixture = requiredCleanupFixture("outline-repair-dual-tone");

export const robustProductReviewFixtures:
  readonly RobustProductReviewFixture[] = [
    {
      id: "robust-review-square-axis-evidence",
      failureClass: "false-anisotropy",
      assetType: "sprite",
      description:
        "Square authored grid with unequal source periods and noisy axis evidence; guards against treating weak-axis disagreement as permission to distort the native aspect.",
      provenance: "first-party-synthetic",
      derivedFromBenchmarkIdentity: false,
      expectedNativeSize: {
        width: squareAxisFixture.nativeWidth,
        height: squareAxisFixture.nativeHeight
      },
      expectsFullCanvas: false,
      protects: [
        "square native aspect",
        "evidence-aware anisotropy handling",
        "manual candidate recovery"
      ],
      createInputImage: squareAxisFixture.createInputImage
    },
    {
      id: "robust-review-legitimate-anisotropy",
      failureClass: "legitimate-anisotropy",
      assetType: "sprite",
      description:
        "Wide authored output with genuinely different horizontal and vertical source periods; prevents a product guard from forcing square source pixels.",
      provenance: "first-party-synthetic",
      derivedFromBenchmarkIdentity: false,
      expectedNativeSize: {
        width: legitimateAnisotropyFixture.nativeWidth,
        height: legitimateAnisotropyFixture.nativeHeight
      },
      expectsFullCanvas: false,
      protects: legitimateAnisotropyFixture.protects,
      createInputImage: legitimateAnisotropyFixture.createInputImage
    },
    {
      id: "robust-review-outline-robot",
      failureClass: "outline-cleanup",
      assetType: "sprite",
      description:
        "Compact transparent sprite with a dual-tone outline and deliberate missing edge pixels; isolates outline repair from grid inference.",
      provenance: "first-party-synthetic",
      derivedFromBenchmarkIdentity: false,
      expectedNativeSize: {
        width: 16,
        height: 16
      },
      expectsFullCanvas: false,
      protects: [
        "outline repair",
        "transparent background",
        "missing edge segments",
        "dual-tone outline preservation"
      ],
      createInputImage: outlineFixture.createImage
    },
    {
      id: "robust-review-native-input",
      failureClass: "native-input-preservation",
      assetType: "sprite",
      description:
        "Already-native rectangular pixel art; protects a deliberate source-size policy from unnecessary grid reconstruction.",
      provenance: "first-party-synthetic",
      derivedFromBenchmarkIdentity: false,
      expectedNativeSize: {
        width: nativeInputFixture.nativeWidth,
        height: nativeInputFixture.nativeHeight
      },
      expectsFullCanvas: true,
      protects: [
        "source-size preservation",
        "native color preservation",
        "no automatic crop"
      ],
      createInputImage: nativeInputFixture.createNativeImage
    },
    {
      id: "robust-review-full-canvas-background",
      failureClass: "full-canvas-background",
      assetType: "background",
      description:
        "Opaque 16:9 layered landscape that must remain full-canvas when explicit Robust background inference is introduced.",
      provenance: "first-party-synthetic",
      derivedFromBenchmarkIdentity: false,
      expectedNativeSize: { width: 64, height: 36 },
      expectsFullCanvas: true,
      protects: [
        "background classification",
        "full-canvas bounds",
        "crop isolation",
        "palette diagnostics"
      ],
      createInputImage: createProductReviewBackground
    }
  ];

function requiredStep1OFixture(id: string) {
  const fixture = step1oNativeSizeCorpus.find((item) => item.id === id);
  if (!fixture) {
    throw new Error(`Missing Step 1O product-review source "${id}".`);
  }
  return fixture;
}

function requiredStep1PFixture(id: string) {
  const fixture = step1pAdjacentNativeSizeCorpus.find((item) => item.id === id);
  if (!fixture) {
    throw new Error(`Missing Step 1P product-review source "${id}".`);
  }
  return fixture;
}

function requiredCleanupFixture(id: string) {
  const fixture = transparentMatteHaloSprites.find((item) => item.id === id);
  if (!fixture) {
    throw new Error(`Missing cleanup product-review source "${id}".`);
  }
  return fixture;
}

function createProductReviewBackground(): RGBAImage {
  const image = createImage(192, 108, [80, 142, 192, 255]);
  fillRect(image.data, image.width, image.height, 0, 39, 192, 27, [112, 153, 132, 255]);
  fillRect(image.data, image.width, image.height, 0, 66, 192, 42, [39, 88, 65, 255]);
  fillRect(image.data, image.width, image.height, 21, 30, 51, 9, [139, 178, 190, 255]);
  fillRect(image.data, image.width, image.height, 117, 24, 48, 12, [139, 178, 190, 255]);
  for (let index = 0; index < 12; index += 1) {
    const x = (index * 17 * 3) % 192;
    const y = 72 + (index % 4) * 6;
    fillRect(image.data, image.width, image.height, x, y, 6, 18, [25, 61, 44, 255]);
  }
  return image;
}
