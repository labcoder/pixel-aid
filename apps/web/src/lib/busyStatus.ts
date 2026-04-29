export type BusyOperationKind = "import" | "analysis" | "fix";

export type BusyOperation = {
  id: number;
  kind: BusyOperationKind;
  label: string;
  detail?: string;
};

export type VisibleBusyOperationInput = {
  importOperation?: BusyOperation | null;
  analysisOperation?: BusyOperation | null;
  fixOperation?: BusyOperation | null;
};

export function createBusyOperation(id: number, kind: BusyOperationKind, label: string, detail?: string): BusyOperation {
  return {
    id,
    kind,
    label,
    ...(detail ? { detail } : {})
  };
}

export function updateBusyOperation(operation: BusyOperation, label: string, detail?: string): BusyOperation {
  const rest: BusyOperation = { ...operation };
  delete rest.detail;
  return {
    ...rest,
    label,
    ...(detail ? { detail } : {})
  };
}

export function clearBusyOperation(operation: BusyOperation | null, id: number): BusyOperation | null {
  if (!operation || operation.id !== id) {
    return operation;
  }
  return null;
}

export function selectVisibleBusyOperation({
  importOperation = null,
  analysisOperation = null,
  fixOperation = null
}: VisibleBusyOperationInput): BusyOperation | null {
  return importOperation ?? analysisOperation ?? fixOperation;
}

export function formatBusyOperationLabel(operation: BusyOperation | null): string | null {
  if (!operation) {
    return null;
  }

  return operation.detail ? `${operation.label} ${operation.detail}` : operation.label;
}
