import type {
  AssetMode,
  AssetType,
  GridSelectionReasonCode,
  OutputSizeMode
} from "@pixelaid/shared";

export type RobustInferenceEligibilityInput = {
  mode: AssetMode;
  assetType: AssetType;
  cropToBounds?: boolean;
  /** Legacy exact output reconstructs the complete source canvas. */
  outputSizeMode?: OutputSizeMode;
};

export type RobustInferenceEligibility = {
  eligible: boolean;
  reasonCode?: Extract<
    GridSelectionReasonCode,
    "ineligible-asset" | "background-requires-full-canvas"
  >;
  message: string;
};

/**
 * Product-surface contract for the opt-in Robust Preview detector.
 *
 * Keep this separate from detector scoring so availability can be shown before
 * a processing job starts and all callers enforce the same release boundary.
 */
export function evaluateRobustInferenceEligibility(
  input: RobustInferenceEligibilityInput
): RobustInferenceEligibility {
  if (input.mode !== "single") {
    return ineligibleAsset(input.assetType);
  }

  if (input.assetType === "sprite" || input.assetType === "icon") {
    return {
      eligible: true,
      message: "Robust Preview is available for this single-image asset."
    };
  }

  if (input.assetType === "background") {
    const fullCanvas =
      input.cropToBounds === false || input.outputSizeMode === "exact";
    if (fullCanvas) {
      return {
        eligible: true,
        message: "Robust Preview is available for this full-canvas background."
      };
    }
    return {
      eligible: false,
      reasonCode: "background-requires-full-canvas",
      message:
        "Robust background inference requires full-canvas processing with cropToBounds disabled; this request uses the classic detector."
    };
  }

  return ineligibleAsset(input.assetType);
}

function ineligibleAsset(assetType: AssetType): RobustInferenceEligibility {
  return {
    eligible: false,
    reasonCode: "ineligible-asset",
    message: `Robust grid inference is limited to eligible single-image assets; ${assetType} uses the classic detector.`
  };
}
