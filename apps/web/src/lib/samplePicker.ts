export function getSamplePickerButtonLabel(sampleCount: number): string {
  const count = Math.max(0, Math.floor(sampleCount));
  return count > 0 ? `Samples (${count})` : "Samples";
}
