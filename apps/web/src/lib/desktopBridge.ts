const imageFilters = [
  {
    name: "Images and PixelAid documents",
    extensions: ["png", "jpg", "jpeg", "webp", "gif", "pixelaid"]
  }
];

const zipFilters = [
  {
    name: "PixelAid bundle",
    extensions: ["zip"]
  }
];

export type DesktopSaveResult =
  | { status: "unavailable" }
  | { status: "cancelled" }
  | { status: "saved"; path: string };

export type DesktopSaveRequest = {
  suggestedName: string;
  bytes: Uint8Array;
};

export function isDesktopRuntime(): boolean {
  const globalObject = globalThis as { __TAURI_INTERNALS__?: unknown; window?: { __TAURI_INTERNALS__?: unknown } };
  return Boolean(globalObject.__TAURI_INTERNALS__ ?? globalObject.window?.__TAURI_INTERNALS__);
}

export function fileNameFromDesktopPath(path: string): string {
  const maybeUrl = path.startsWith("file://") ? decodeURIComponent(new URL(path).pathname) : path;
  const normalized = maybeUrl.replace(/\\/g, "/");
  const name = normalized.split("/").filter(Boolean).at(-1);
  return name || "pixelaid-import.png";
}

export function imageMimeTypeForPath(path: string): string {
  const extension = path.split(/[?#]/, 1)[0]?.split(".").at(-1)?.toLowerCase();
  switch (extension) {
    case "pixelaid":
      return "application/octet-stream";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "png":
    default:
      return "image/png";
  }
}

export async function openDesktopImageFiles(): Promise<File[]> {
  if (!isDesktopRuntime()) {
    return [];
  }

  const [{ open }, { readFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
  const selected = await open({
    title: "Import images",
    multiple: true,
    directory: false,
    filters: imageFilters
  });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];

  return Promise.all(
    paths.map(async (path) => {
      const bytes = await readFile(path);
      const name = fileNameFromDesktopPath(path);
      return new File([bytes], name, {
        type: imageMimeTypeForPath(name),
        lastModified: Date.now()
      });
    })
  );
}

export async function saveDesktopBundleFile(request: DesktopSaveRequest): Promise<DesktopSaveResult> {
  if (!isDesktopRuntime()) {
    return { status: "unavailable" };
  }

  const [{ save }, { writeFile }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/plugin-fs")]);
  const path = await save({
    title: "Export PixelAid bundle",
    defaultPath: request.suggestedName,
    filters: zipFilters
  });

  if (!path) {
    return { status: "cancelled" };
  }

  await writeFile(path, request.bytes);
  return { status: "saved", path };
}
