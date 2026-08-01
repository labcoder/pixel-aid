import { describe, expect, test } from "vitest";
import {
  createPixelAidDocumentArchive,
  defaultPixelAidDocumentFilename,
  hydratePixelFixResultFromDocument,
  pixelaidDocumentFormat,
  pixelaidDocumentVersion,
  readPixelAidDocumentArchive,
  serializePixelFixResultForDocument,
  validatePixelAidDocumentManifest,
  type PixelAidDocumentManifest
} from "./pixelaidDocument";
import type { FixOptions, PixelFixResult } from "@pixelaid/shared";

const sourcePngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const fixedPngBytes = new Uint8Array([1, 2, 3, 4]);

const fixOptions: FixOptions = {
  mode: "single",
  assetType: "sprite",
  targetWidth: 2,
  targetHeight: 2,
  maxColors: 4,
  grid: { detect: "manual", scale: 1 },
  downscale: "dominant",
  alpha: "preserve",
  cleanup: {
    removeOrphans: false,
    jaggyCleanup: false,
    preserveSinglePixelDetails: true
  }
};

function asset() {
  return {
    id: "asset-1",
    name: "hero.png",
    importedAt: "2026-05-04T00:00:00.000Z",
    width: 2,
    height: 2,
    assetType: "sprite" as const,
    assetTypeSource: "manual" as const,
    assetTypeWarnings: [],
    categoryReason: "User selected sprite.",
    categoryConfidence: 1
  };
}

function fixResult(): PixelFixResult {
  return {
    image: {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray(16)
    },
    palette: ["#000000"],
    grid: {
      outputWidth: 2,
      outputHeight: 2,
      scaleX: 1,
      scaleY: 1,
      phaseX: 0,
      phaseY: 0,
      confidence: 1,
      reason: "manual"
    },
    metrics: {
      durationMs: 1,
      sourceWidth: 2,
      sourceHeight: 2,
      outputWidth: 2,
      outputHeight: 2,
      paletteCount: 1,
      gridConfidence: 1
    },
    settings: fixOptions
  };
}

function robustFallbackResult(): PixelFixResult {
  const base = fixResult();
  return {
    ...base,
    settings: {
      ...base.settings,
      grid: {
        detect: "auto",
        autoStrategy: "robust",
        robustSafety: "guarded"
      }
    },
    grid: {
      ...base.grid,
      diagnostics: {
        edgeScore: 0.52,
        runScore: 0.41,
        sizeScore: 0.8,
        scaleScore: 0.76,
        divisibilityScore: 1,
        cropUsed: false,
        sourceCoverage: 1,
        confidenceLabel: "medium",
        notes: [],
        selection: {
          requestedStrategy: "robust",
          selectedStrategy: "classic",
          robustSafety: "guarded",
          decision: "fallback",
          reasonCodes: ["moderate-anisotropy", "weak-axis-evidence"],
          message: "Guarded Robust inference fell back to Classic.",
          robustCandidate: {
            outputWidth: 3,
            outputHeight: 2,
            scaleX: 0.75,
            scaleY: 1,
            confidence: 0.54
          },
          classicCandidate: {
            outputWidth: 2,
            outputHeight: 2,
            scaleX: 1,
            scaleY: 1,
            confidence: 0.83
          }
        }
      }
    }
  };
}

describe("PixelAid asset document archives", () => {
  test("creates and reads a versioned .pixelaid archive", () => {
    const archive = createPixelAidDocumentArchive({
      appVersion: "1.0.0",
      asset: asset(),
      sourcePngBytes,
      fixedPngBytes,
      session: { assetId: "asset-1", settings: { maxColors: 4 } },
      gridCandidates: [],
      createdAt: "2026-05-04T00:00:00.000Z"
    });

    const parsed = readPixelAidDocumentArchive(archive.bytes);

    expect(parsed.manifest).toMatchObject({
      format: pixelaidDocumentFormat,
      version: pixelaidDocumentVersion,
      app: { name: "PixelAid", version: "1.0.0" },
      asset: { name: "hero.png" },
      files: {
        source: "source.png",
        fixed: "fixed.png",
        session: "metadata/session.json",
        gridCandidates: "metadata/grid-candidates.json"
      }
    });
    expect(parsed.sourcePngBytes).toEqual(sourcePngBytes);
    expect(parsed.fixedPngBytes).toEqual(fixedPngBytes);
    expect(parsed.session).toEqual({ assetId: "asset-1", settings: { maxColors: 4 } });
  });

  test("rejects unsupported future document versions", () => {
    const manifest: PixelAidDocumentManifest = {
      format: pixelaidDocumentFormat,
      version: pixelaidDocumentVersion,
      app: { name: "PixelAid", version: "1.0.0" },
      createdAt: "2026-05-04T00:00:00.000Z",
      asset: asset(),
      files: {
        source: "source.png",
        session: "metadata/session.json"
      }
    };

    expect(() => validatePixelAidDocumentManifest({ ...manifest, version: 999 as 1 })).toThrow(/newer/);
  });

  test("strips image buffers from fixed results and hydrates them from the document image", () => {
    const payload = serializePixelFixResultForDocument(fixResult());

    expect(payload).not.toHaveProperty("image");

    const image = { width: 2, height: 2, data: new Uint8ClampedArray(16) };
    expect(hydratePixelFixResultFromDocument(payload, image)).toMatchObject({
      image: { width: 2, height: 2 },
      palette: ["#000000"]
    });
  });

  test("round-trips Robust Preview settings and fallback diagnostics", () => {
    const serializedResult = serializePixelFixResultForDocument(robustFallbackResult());
    const archive = createPixelAidDocumentArchive({
      appVersion: "0.2.0",
      asset: asset(),
      sourcePngBytes,
      fixedPngBytes,
      session: {
        assetId: "asset-1",
        settings: {
          gridAutoStrategy: "robust",
          robustSafety: "guarded"
        },
        fixResult: serializedResult
      },
      createdAt: "2026-08-01T00:00:00.000Z"
    });

    const parsed = readPixelAidDocumentArchive(archive.bytes);
    const session = parsed.session as {
      settings: { gridAutoStrategy: string; robustSafety: string };
      fixResult: ReturnType<typeof serializePixelFixResultForDocument>;
    };

    expect(session.settings).toEqual({
      gridAutoStrategy: "robust",
      robustSafety: "guarded"
    });
    expect(session.fixResult?.settings.grid).toMatchObject({
      detect: "auto",
      autoStrategy: "robust",
      robustSafety: "guarded"
    });
    expect(session.fixResult?.grid.diagnostics?.selection).toMatchObject({
      requestedStrategy: "robust",
      selectedStrategy: "classic",
      robustSafety: "guarded",
      decision: "fallback",
      reasonCodes: ["moderate-anisotropy", "weak-axis-evidence"]
    });

    const hydrated = hydratePixelFixResultFromDocument(
      session.fixResult,
      { width: 2, height: 2, data: new Uint8ClampedArray(16) }
    );
    expect(hydrated?.grid.diagnostics?.selection?.decision).toBe("fallback");
  });

  test("uses a distinct .pixelaid filename", () => {
    expect(defaultPixelAidDocumentFilename("My Hero!.png")).toBe("My_Hero.pixelaid");
  });
});
