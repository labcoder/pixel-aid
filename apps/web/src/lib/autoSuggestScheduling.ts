import type { AssetType, RGBAImage } from "@pixelaid/shared";
import { suggestFixSettings, suggestFixSettingsForAssetType, type FixSettingSuggestion } from "./fixSuggestions";

export type AutoSuggestScheduledTrigger = "import" | "sample" | "manual" | "assetTypeChange" | "engineJob";
export type AutoSuggestExecutionTrigger = AutoSuggestScheduledTrigger | "reactRender";

const triggerLabels: Record<AutoSuggestScheduledTrigger, string> = {
  import: "import",
  sample: "sample",
  manual: "manual",
  assetTypeChange: "asset type change",
  engineJob: "engine job"
};

export function assertAutoSuggestScheduled(trigger: AutoSuggestExecutionTrigger): asserts trigger is AutoSuggestScheduledTrigger {
  if (trigger === "reactRender") {
    throw new Error("Auto Suggest detector work must be scheduled from an event, import, sample, or engine job path; React render must stay pure.");
  }
}

export function describeAutoSuggestTrigger(trigger: AutoSuggestScheduledTrigger): string {
  return triggerLabels[trigger];
}

export function runScheduledAutoSuggest(input: {
  image: RGBAImage;
  trigger: AutoSuggestExecutionTrigger;
}): FixSettingSuggestion {
  assertAutoSuggestScheduled(input.trigger);
  return suggestFixSettings(input.image);
}

export function runScheduledAutoSuggestForAssetType(input: {
  image: RGBAImage;
  assetType: AssetType;
  trigger: AutoSuggestExecutionTrigger;
}): FixSettingSuggestion {
  assertAutoSuggestScheduled(input.trigger);
  return suggestFixSettingsForAssetType(input.image, input.assetType);
}
