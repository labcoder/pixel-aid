import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { Download, RotateCcw } from "lucide-react";
import { PIXELAID_VERSION } from "@pixelaid/shared";
import { downloadBlob } from "../lib/exportFiles";
import { createOperationErrorReport, createWebDiagnosticReport } from "../lib/diagnosticReport";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  info: ErrorInfo | null;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    info: null
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ error, info });
  }

  render(): ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    const exportDiagnostics = () => {
      const report = createWebDiagnosticReport({
        appVersion: PIXELAID_VERSION,
        generatedAt: new Date().toISOString(),
        route: window.location.pathname,
        logs: ["React error boundary captured an unrecoverable render error."],
        lastError: createOperationErrorReport("render", this.state.error, "Reload PixelAid, then re-import the source asset."),
        metrics: {
          componentStack: this.state.info?.componentStack ?? ""
        }
      });
      const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: "application/json" });
      downloadBlob(blob, "pixelaid-crash-diagnostics.json");
    };

    return (
      <main className="error-boundary-shell" role="alert">
        <section>
          <span className="guided-kicker">Recovery</span>
          <h1>PixelAid hit a UI error</h1>
          <p>Your source files are not modified in place. Reload the editor, re-import the asset, and export diagnostics if this repeats.</p>
          <div className="error-boundary-actions">
            <button type="button" onClick={() => window.location.reload()}>
              <RotateCcw size={15} />
              Reload
            </button>
            <button type="button" onClick={exportDiagnostics}>
              <Download size={15} />
              Diagnostics
            </button>
          </div>
          <pre>{this.state.error.message}</pre>
        </section>
      </main>
    );
  }
}
