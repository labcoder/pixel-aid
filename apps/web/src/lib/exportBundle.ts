import { strToU8, zipSync } from "fflate";

export type AssetBundleFile = {
  path: string;
  bytes: Uint8Array;
};

type AssetBundleFilesOptions = {
  files: readonly AssetBundleFile[];
};

type LegacyAssetBundleZipOptions = {
  pngFilename: string;
  pngBytes: Uint8Array;
  manifestFilename: string;
  manifest: unknown;
};

export type AssetBundleZipOptions = AssetBundleFilesOptions | LegacyAssetBundleZipOptions;

export function jsonBundleFile(path: string, value: unknown): AssetBundleFile {
  return {
    path,
    bytes: strToU8(`${JSON.stringify(value, null, 2)}\n`)
  };
}

export function textBundleFile(path: string, value: string): AssetBundleFile {
  return {
    path,
    bytes: strToU8(value)
  };
}

export function createAssetBundleZip(options: AssetBundleZipOptions): Uint8Array {
  const files = "files" in options ? options.files : legacyFiles(options);
  const entries = Object.fromEntries(
    [...files].sort((a, b) => a.path.localeCompare(b.path)).map((file) => [file.path, file.bytes])
  );

  return zipSync(entries, { level: 6 });
}

function legacyFiles(options: LegacyAssetBundleZipOptions): AssetBundleFile[] {
  return [
    {
      path: options.pngFilename,
      bytes: options.pngBytes
    },
    jsonBundleFile(options.manifestFilename, options.manifest)
  ];
}
