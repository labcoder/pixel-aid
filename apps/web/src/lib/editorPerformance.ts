import type { RGBAImage } from "@pixelaid/shared";

export type EditorPerformanceOperationName =
  | "import"
  | "source-analysis"
  | "quality-analysis"
  | "auto-suggest"
  | "fix"
  | "export"
  | "canvas";

export type EditorPerformanceMark = {
  name: string;
  at: number;
  offsetMs: number;
  detail?: string;
};

export type EditorPerformanceOperation = {
  id: string;
  name: EditorPerformanceOperationName;
  label: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  marks: EditorPerformanceMark[];
};

export type EditorLongTaskRecord = {
  durationMs: number;
  operationId: string | null;
  operationLabel: string;
  offsetMs: number | null;
  startedAt: number;
};

export type EditorLongTaskSummary = {
  supported: boolean;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  recent: EditorLongTaskRecord[];
};

export type EditorMemoryCheckpoint = {
  name: string;
  bytes: number;
  at: number;
  operationId: string | null;
  width?: number;
  height?: number;
};

export type EditorMemorySummary = {
  thresholdBytes: number;
  activeEstimatedBytes: number;
  checkpoints: EditorMemoryCheckpoint[];
  warnings: string[];
};

export type EditorPerformanceSnapshot = {
  operations: EditorPerformanceOperation[];
  longTasks: EditorLongTaskSummary;
  memory: EditorMemorySummary;
};

export type EditorPerformanceMonitorOptions = {
  now?: () => number;
  memoryWarningThresholdBytes?: number;
  maxOperations?: number;
  maxMarksPerOperation?: number;
  maxLongTasks?: number;
  observeLongTasks?: boolean;
};

type LongTaskPerformanceObserver = typeof PerformanceObserver;

const defaultMemoryWarningThresholdBytes = 128 * 1024 * 1024;
const defaultMaxOperations = 8;
const defaultMaxMarksPerOperation = 32;
const defaultMaxLongTasks = 12;

export class EditorPerformanceMonitor {
  private readonly now: () => number;
  private readonly memoryWarningThresholdBytes: number;
  private readonly maxOperations: number;
  private readonly maxMarksPerOperation: number;
  private readonly maxLongTasks: number;
  private operationCounter = 0;
  private activeOperationId: string | null = null;
  private operations: EditorPerformanceOperation[] = [];
  private longTaskObserver: PerformanceObserver | null = null;
  private longTasksSupported = false;
  private longTasks: EditorLongTaskRecord[] = [];
  private memoryCheckpoints = new Map<string, EditorMemoryCheckpoint>();

  constructor(options: EditorPerformanceMonitorOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    this.memoryWarningThresholdBytes = options.memoryWarningThresholdBytes ?? defaultMemoryWarningThresholdBytes;
    this.maxOperations = Math.max(1, options.maxOperations ?? defaultMaxOperations);
    this.maxMarksPerOperation = Math.max(1, options.maxMarksPerOperation ?? defaultMaxMarksPerOperation);
    this.maxLongTasks = Math.max(1, options.maxLongTasks ?? defaultMaxLongTasks);

    if (options.observeLongTasks !== false) {
      this.startLongTaskObserver();
    }
  }

  beginOperation(name: EditorPerformanceOperationName, label: string = name): string {
    const id = `${name}-${++this.operationCounter}`;
    const operation: EditorPerformanceOperation = {
      id,
      name,
      label,
      startedAt: this.now(),
      marks: []
    };
    this.operations = [operation, ...this.operations].slice(0, this.maxOperations);
    this.activeOperationId = id;
    this.mark("operation start", undefined, id);
    return id;
  }

  endOperation(id: string, detail?: string): void {
    const operation = this.findOperation(id);
    if (!operation || operation.endedAt !== undefined) {
      return;
    }

    this.mark("operation end", detail, id);
    operation.endedAt = this.now();
    operation.durationMs = Math.max(0, operation.endedAt - operation.startedAt);
    if (this.activeOperationId === id) {
      this.activeOperationId = null;
    }
  }

  mark(name: string, detail?: string, operationId = this.activeOperationId): void {
    const operation = operationId ? this.findOperation(operationId) : null;
    if (!operation) {
      return;
    }

    const at = this.now();
    operation.marks = [
      ...operation.marks,
      {
        name,
        at,
        offsetMs: Math.max(0, at - operation.startedAt),
        ...(detail ? { detail } : {})
      }
    ].slice(-this.maxMarksPerOperation);
  }

  recordImageMemory(name: string, image: RGBAImage | null | undefined, operationId = this.activeOperationId): void {
    if (!image) {
      this.memoryCheckpoints.delete(name);
      return;
    }

    this.recordMemoryCheckpoint(name, estimateRgbaImageBytes(image), image.width, image.height, operationId);
  }

  recordMemoryCheckpoint(name: string, bytes: number, width?: number, height?: number, operationId = this.activeOperationId): void {
    this.memoryCheckpoints.set(name, {
      name,
      bytes: Math.max(0, Math.round(bytes)),
      at: this.now(),
      operationId,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {})
    });
  }

  getSnapshot(): EditorPerformanceSnapshot {
    const checkpoints = [...this.memoryCheckpoints.values()].sort((left, right) => left.name.localeCompare(right.name));
    const activeEstimatedBytes = checkpoints.reduce((sum, checkpoint) => sum + checkpoint.bytes, 0);
    const warnings = activeEstimatedBytes > this.memoryWarningThresholdBytes
      ? [
          `Estimated active image buffers are ${formatBytes(activeEstimatedBytes)}, above the ${formatBytes(this.memoryWarningThresholdBytes)} warning threshold.`
        ]
      : [];
    const totalLongTaskDuration = this.longTasks.reduce((sum, task) => sum + task.durationMs, 0);

    return {
      operations: this.operations.map(cloneOperation),
      longTasks: {
        supported: this.longTasksSupported,
        count: this.longTasks.length,
        totalDurationMs: totalLongTaskDuration,
        maxDurationMs: this.longTasks.reduce((max, task) => Math.max(max, task.durationMs), 0),
        recent: this.longTasks.map((task) => ({ ...task }))
      },
      memory: {
        thresholdBytes: this.memoryWarningThresholdBytes,
        activeEstimatedBytes,
        checkpoints: checkpoints.map((checkpoint) => ({ ...checkpoint })),
        warnings
      }
    };
  }

  dispose(): void {
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
  }

  private startLongTaskObserver(): void {
    const Observer = globalThis.PerformanceObserver as LongTaskPerformanceObserver | undefined;
    const supportedEntryTypes = Observer?.supportedEntryTypes ?? [];
    if (!Observer || !supportedEntryTypes.includes("longtask")) {
      this.longTasksSupported = false;
      return;
    }

    this.longTasksSupported = true;
    this.longTaskObserver = new Observer((list) => {
      const activeOperation = this.activeOperationId ? this.findOperation(this.activeOperationId) : null;
      const records = list.getEntries().map((entry) => ({
        durationMs: entry.duration,
        operationId: activeOperation?.id ?? null,
        operationLabel: activeOperation?.label ?? "idle/unknown",
        offsetMs: activeOperation ? Math.max(0, entry.startTime - activeOperation.startedAt) : null,
        startedAt: entry.startTime
      }));
      this.longTasks = [...this.longTasks, ...records].slice(-this.maxLongTasks);
    });
    this.longTaskObserver.observe({ entryTypes: ["longtask"] });
  }

  private findOperation(id: string): EditorPerformanceOperation | undefined {
    return this.operations.find((operation) => operation.id === id);
  }
}

export function createEditorPerformanceMonitor(options?: EditorPerformanceMonitorOptions): EditorPerformanceMonitor {
  return new EditorPerformanceMonitor(options);
}

export function estimateRgbaImageBytes(image: Pick<RGBAImage, "width" | "height">): number {
  return Math.max(0, image.width) * Math.max(0, image.height) * 4;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} kB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDurationMs(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs.toFixed(1)}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

export function formatLatestOperation(snapshot: EditorPerformanceSnapshot): string {
  const operation = snapshot.operations[0];
  if (!operation) {
    return "--";
  }

  const duration = operation.durationMs ?? Math.max(0, operation.marks.at(-1)?.offsetMs ?? 0);
  return `${operation.label}: ${formatDurationMs(duration)}${operation.endedAt ? "" : " active"}`;
}

export function formatOperationMarks(operation: EditorPerformanceOperation | undefined): string {
  if (!operation || operation.marks.length === 0) {
    return "--";
  }

  return operation.marks
    .slice(-6)
    .map((mark) => `${mark.name} +${formatDurationMs(mark.offsetMs)}`)
    .join(" / ");
}

function cloneOperation(operation: EditorPerformanceOperation): EditorPerformanceOperation {
  return {
    ...operation,
    marks: operation.marks.map((mark) => ({ ...mark }))
  };
}
