import type { WorkerProgress, WorkerProgressStage } from "@pixelaid/shared";

const stageLabels: Record<WorkerProgressStage, string> = {
  "decode-prep": "Preparing",
  "grid-detection": "Detecting grid",
  "frame-slicing": "Preparing frames",
  downsampling: "Downsampling",
  "alpha-cleanup": "Cleaning alpha",
  "palette-remap": "Applying palette",
  "export-prep": "Preparing export",
  complete: "Complete",
  cancelled: "Cancelled"
};

export function formatFixProgress(progress: WorkerProgress): string {
  return `${progress.message ?? stageLabels[progress.stage]} ${Math.round(progress.percent)}%`;
}

export function shouldLogProgressStage(previous: WorkerProgressStage | undefined, next: WorkerProgressStage): boolean {
  return previous !== next && next !== "complete";
}
