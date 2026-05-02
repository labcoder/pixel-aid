import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const distDir = join(process.cwd(), "apps", "web", "dist", "assets");
const maxChunkBytes = Number(process.env.PIXELAID_WEB_MAX_JS_CHUNK_BYTES ?? 700_000);
const maxTotalGzipBytes = Number(process.env.PIXELAID_WEB_MAX_TOTAL_JS_GZIP_BYTES ?? 260_000);

if (!existsSync(distDir)) {
  console.error(`Web bundle budget check failed: ${distDir} does not exist. Run npm run build first.`);
  process.exit(1);
}

const jsFiles = readdirSync(distDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => {
    const path = join(distDir, file);
    const size = statSync(path).size;
    const gzipSize = gzipSync(readFileSync(path)).length;
    return { file, size, gzipSize };
  })
  .sort((a, b) => b.size - a.size);

if (jsFiles.length === 0) {
  console.error("Web bundle budget check failed: no JavaScript assets were found.");
  process.exit(1);
}

const totalGzipBytes = jsFiles.reduce((sum, file) => sum + file.gzipSize, 0);
const largest = jsFiles[0];
const failures = [];

if (largest.size > maxChunkBytes) {
  failures.push(`largest JS chunk ${largest.file} is ${formatBytes(largest.size)}, budget is ${formatBytes(maxChunkBytes)}`);
}

if (totalGzipBytes > maxTotalGzipBytes) {
  failures.push(`total gzipped JS is ${formatBytes(totalGzipBytes)}, budget is ${formatBytes(maxTotalGzipBytes)}`);
}

console.log("PixelAid web bundle budget");
console.log(`Largest JS chunk: ${largest.file} ${formatBytes(largest.size)} (${formatBytes(largest.gzipSize)} gzip)`);
console.log(`Total gzipped JS: ${formatBytes(totalGzipBytes)}`);

for (const file of jsFiles.slice(0, 8)) {
  console.log(`- ${file.file}: ${formatBytes(file.size)} (${formatBytes(file.gzipSize)} gzip)`);
}

if (failures.length > 0) {
  console.error("Bundle budget failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} kB`;
}
