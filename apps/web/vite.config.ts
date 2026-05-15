import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const workspacePackage = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

type TelemetryBuildEnv = Record<string, string | boolean | undefined>;

function cleanEnvValue(value: string | boolean | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function telemetryEnabled(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return value === "1" || value?.toLowerCase() === "true";
}

function createTelemetryConfig(env: TelemetryBuildEnv) {
  const provider = cleanEnvValue(env.TELEMETRY_PROVIDER).toLowerCase();
  const posthogProjectKey = cleanEnvValue(env.TELEMETRY_POSTHOG_PROJECT_KEY);
  const posthogHost = cleanEnvValue(env.TELEMETRY_POSTHOG_HOST).replace(/\/+$/u, "");
  const webPackageTarget = cleanEnvValue(env.PIXELAID_WEB_PACKAGE_TARGET);
  const enabled = telemetryEnabled(env.TELEMETRY_ENABLED);
  const posthogReady = enabled && provider === "posthog" && posthogProjectKey.length > 0 && posthogHost.length > 0;

  return {
    enabled: posthogReady,
    provider: posthogReady ? "posthog" : "none",
    posthogHost: posthogReady ? posthogHost : "",
    posthogProjectKey: posthogReady ? posthogProjectKey : "",
    buildChannel: cleanEnvValue(env.TELEMETRY_BUILD_CHANNEL) === "release" ? "release" : "dev",
    distribution: cleanEnvValue(env.TELEMETRY_DISTRIBUTION) || (webPackageTarget ? `web_${webPackageTarget}` : "web_dev")
  };
}

export default defineConfig(({ mode }) => {
  const repoEnv = loadEnv(mode, repoRoot, "");
  const telemetryConfig = createTelemetryConfig({ ...repoEnv, ...process.env });

  return {
    base: process.env.PIXELAID_WEB_BASE ?? "/",
    define: {
      __PIXELAID_TELEMETRY_CONFIG__: JSON.stringify(telemetryConfig)
    },
    plugins: [react()],
    resolve: {
      alias: [
        { find: "@pixelaid/worker/fix.worker", replacement: workspacePackage("worker/src/fix.worker.ts") },
        { find: "@pixelaid/worker", replacement: workspacePackage("worker/src/index.ts") },
        { find: "@pixelaid/core", replacement: workspacePackage("core/src/index.ts") },
        { find: "@pixelaid/exporters", replacement: workspacePackage("exporters/src/index.ts") },
        { find: "@pixelaid/fixtures", replacement: workspacePackage("fixtures/src/index.ts") },
        { find: "@pixelaid/shared", replacement: workspacePackage("shared/src/index.ts") }
      ]
    },
    build: {
      chunkSizeWarningLimit: 700,
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
              return "react-vendor";
            }
            if (id.includes("node_modules/lucide-react")) {
              return "icons-vendor";
            }
            if (id.includes("@pixelaid/core")) {
              return "pixelaid-core";
            }
            if (id.includes("@pixelaid/exporters")) {
              return "pixelaid-exporters";
            }
            return undefined;
          }
        }
      }
    },
    server: {
      host: "127.0.0.1",
      port: 5173
    }
  };
});
