import { strToU8, zipSync } from "fflate";

export type AssetBundleZipOptions = {
  pngFilename: string;
  pngBytes: Uint8Array;
  manifestFilename: string;
  manifest: unknown;
};

export function createAssetBundleZip(options: AssetBundleZipOptions): Uint8Array {
  return zipSync(
    {
      [options.pngFilename]: options.pngBytes,
      [options.manifestFilename]: strToU8(`${JSON.stringify(options.manifest, null, 2)}\n`)
    },
    { level: 6 }
  );
}
