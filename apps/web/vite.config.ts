import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const workspacePackage = (path: string) => fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  base: process.env.PIXELAID_WEB_BASE ?? "/",
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
});
