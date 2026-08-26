import type {
  GridAutoStrategy,
  GridRobustSafety,
  GridSelectionDiagnostics,
  PixelReconstructionMetadata
} from "@pixelaid/shared";
import type { RobustInferenceEligibility } from "@pixelaid/core";

export type ReconstructionStrategyStatus = {
  tone: "classic" | "preview" | "success" | "warning" | "fallback";
  title: string;
  detail: string;
  reasonCodes: readonly string[];
};

export function describeReconstructionStrategyStatus(input: {
  requestedStrategy: GridAutoStrategy;
  robustSafety: GridRobustSafety;
  eligibility: RobustInferenceEligibility;
  selection?: GridSelectionDiagnostics;
  reconstruction?: PixelReconstructionMetadata;
}): ReconstructionStrategyStatus {
  if (input.requestedStrategy === "classic") {
    return {
      tone: "classic",
      title: "Classic selected",
      detail: "Compatibility reconstruction selected. Saved Classic preferences remain unchanged.",
      reasonCodes: []
    };
  }

  if (!input.eligibility.eligible) {
    return {
      tone: "fallback",
      title: "Classic required for this asset",
      detail: input.eligibility.message,
      reasonCodes: input.eligibility.reasonCode
        ? [input.eligibility.reasonCode]
        : []
    };
  }

  const resultMatchesRequest =
    input.reconstruction?.requestedStrategy === input.requestedStrategy;
  if (!resultMatchesRequest) {
    return {
      tone: "preview",
      title: "Robust Preview selected",
      detail: `${robustSafetyLabel(input.robustSafety)}. Run Fix to apply it.`,
      reasonCodes: []
    };
  }

  if (input.selection?.decision === "fallback") {
    return {
      tone: "fallback",
      title: "Robust requested \u2192 Classic used",
      detail: input.selection.message,
      reasonCodes: input.selection.reasonCodes
    };
  }

  if (input.selection?.decision === "warning") {
    return {
      tone: "warning",
      title: "Robust used with warning",
      detail: input.selection.message,
      reasonCodes: input.selection.reasonCodes
    };
  }

  if (input.reconstruction?.usedStrategy === "classic") {
    return {
      tone: "fallback",
      title: "Robust requested \u2192 Classic used",
      detail: "The last reconstruction used Classic. Review the grid diagnostics for the fallback reason.",
      reasonCodes: []
    };
  }

  return {
    tone: "success",
    title: "Robust Preview used",
    detail: "The last reconstruction used the guarded Robust proposal.",
    reasonCodes: input.selection?.reasonCodes ?? []
  };
}

export function robustSafetyLabel(safety: GridRobustSafety): string {
  switch (safety) {
    case "guarded":
      return "Guarded fallback is on";
    case "warn":
      return "Warnings are on; Robust geometry is retained";
    case "off":
      return "Raw proposal mode is on";
  }
}
