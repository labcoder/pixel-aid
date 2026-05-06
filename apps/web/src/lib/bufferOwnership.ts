import type { RGBAImage } from "@pixelaid/shared";

export type ImageBufferOwnershipState =
  | "source-immutable"
  | "transfer-clone"
  | "transferred-to-worker"
  | "worker-owned"
  | "worker-result"
  | "preview-cache"
  | "export-temp"
  | "released";

export type ImageBufferOwner = "web" | "worker" | "core" | "exporter" | "none";

export type ImageBufferOwnership = {
  state: ImageBufferOwnershipState;
  owner: ImageBufferOwner;
  width: number;
  height: number;
  byteLength: number;
  mutable: boolean;
  transferable: boolean;
  detached: boolean;
  label: string;
  assetId?: string;
  requestId?: string;
};

export type ImageBufferOwnershipContext = {
  label?: string;
  assetId?: string;
  requestId?: string;
};

export function createSourceBufferOwnership(image: RGBAImage, context: ImageBufferOwnershipContext = {}): ImageBufferOwnership {
  return createOwnershipRecord(image, {
    ...context,
    state: "source-immutable",
    owner: "web",
    mutable: false,
    transferable: false,
    detached: false,
    label: context.label ?? "source image buffer"
  });
}

export function createTransferCloneOwnership(image: Pick<RGBAImage, "width" | "height" | "data">, context: ImageBufferOwnershipContext = {}): ImageBufferOwnership {
  return createOwnershipRecord(image, {
    ...context,
    state: "transfer-clone",
    owner: "web",
    mutable: true,
    transferable: true,
    detached: false,
    label: context.label ?? "transferable worker clone"
  });
}

export function markTransferredToWorker(record: ImageBufferOwnership): ImageBufferOwnership {
  return {
    ...record,
    state: "transferred-to-worker",
    owner: "worker",
    mutable: false,
    transferable: false,
    detached: true
  };
}

export function createWorkerResultOwnership(image: RGBAImage, context: ImageBufferOwnershipContext = {}): ImageBufferOwnership {
  return createOwnershipRecord(image, {
    ...context,
    state: "worker-result",
    owner: "web",
    mutable: false,
    transferable: false,
    detached: false,
    label: context.label ?? "worker result buffer"
  });
}

export function createReleasedBufferOwnership(record: ImageBufferOwnership): ImageBufferOwnership {
  return {
    ...record,
    state: "released",
    owner: "none",
    mutable: false,
    transferable: false,
    detached: true
  };
}

export function formatBufferOwnership(record: ImageBufferOwnership): string {
  return `${record.label}: ${record.state} / ${record.owner} / ${formatBytes(record.byteLength)}`;
}

type CreateOwnershipRecordOptions = ImageBufferOwnershipContext & {
  state: ImageBufferOwnershipState;
  owner: ImageBufferOwner;
  mutable: boolean;
  transferable: boolean;
  detached: boolean;
  label: string;
};

function createOwnershipRecord(image: Pick<RGBAImage, "width" | "height" | "data">, options: CreateOwnershipRecordOptions): ImageBufferOwnership {
  return {
    state: options.state,
    owner: options.owner,
    width: image.width,
    height: image.height,
    byteLength: image.data.byteLength,
    mutable: options.mutable,
    transferable: options.transferable,
    detached: options.detached,
    label: options.label,
    ...(options.assetId ? { assetId: options.assetId } : {}),
    ...(options.requestId ? { requestId: options.requestId } : {})
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
