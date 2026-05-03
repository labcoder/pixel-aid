import { readFile, writeFile } from "node:fs/promises";

const allowedLicenses = new Set([
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 OR MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MIT OR Apache-2.0",
]);

const reviewLicenses = new Set(["BlueOak-1.0.0", "MPL-2.0"]);
const blockedLicensePatterns = [/AGPL/i, /GPL/i, /LGPL/i, /SSPL/i, /Commons Clause/i, /BUSL/i, /Non-Commercial/i];

const args = new Set(process.argv.slice(2));
const shouldCheck = args.has("--check");
const outIndex = process.argv.indexOf("--out");
const outputPath = outIndex >= 0 ? process.argv[outIndex + 1] : "docs/third-party-license-report.md";
const shouldWriteReport = !shouldCheck || outIndex >= 0;

const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
const packages = Object.entries(lock.packages ?? {})
  .filter(([packagePath, metadata]) => packagePath.startsWith("node_modules/") && metadata.version)
  .map(([packagePath, metadata]) => ({
    name: packageNameFromPath(packagePath),
    version: metadata.version,
    license: metadata.license ?? "NO_LICENSE",
    path: packagePath,
    resolved: metadata.resolved ?? "",
  }))
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const rows = packages.map((entry) => ({
  ...entry,
  status: classifyLicense(entry.license),
}));

const blocked = rows.filter((entry) => entry.status === "blocked");
const review = rows.filter((entry) => entry.status === "review");
const unknown = rows.filter((entry) => entry.license === "NO_LICENSE");

const report = renderReport(rows, { blocked, review, unknown });
if (shouldWriteReport) {
  await writeFile(outputPath, report, "utf8");
}

if (shouldCheck && (blocked.length > 0 || unknown.length > 0)) {
  console.error(`License policy check failed: ${blocked.length} blocked, ${unknown.length} unknown.`);
  process.exitCode = 1;
}

function packageNameFromPath(packagePath) {
  const withoutPrefix = packagePath.replace(/^node_modules\//, "");
  const parts = withoutPrefix.split("/");
  return withoutPrefix.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0];
}

function classifyLicense(license) {
  if (license === "NO_LICENSE") {
    return "unknown";
  }
  if (allowedLicenses.has(license)) {
    return "allowed";
  }
  if (reviewLicenses.has(license)) {
    return "review";
  }
  if (blockedLicensePatterns.some((pattern) => pattern.test(license))) {
    return "blocked";
  }
  return "review";
}

function renderReport(rows, summary) {
  const counts = rows.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const table = rows
    .map((row) => `| ${escapeCell(row.name)} | ${escapeCell(row.version)} | ${escapeCell(row.license)} | ${row.status} |`)
    .join("\n");

  return `# Third-Party License Report

Generated from \`package-lock.json\` by \`npm run license:report\`.

## Policy Summary

- Allowed packages: ${counts.allowed ?? 0}
- Review-required packages: ${counts.review ?? 0}
- Blocked packages: ${counts.blocked ?? 0}
- Unknown-license packages: ${counts.unknown ?? 0}

Review-required licenses are not automatically forbidden, but they must be documented before release. Blocked or unknown licenses fail \`npm run license:check\`.

## Review Notes

- \`MPL-2.0\` packages are file-level copyleft and require attribution/source availability for modified MPL files. Current use is through development/build tooling, not PixelAid runtime algorithm code.
- \`BlueOak-1.0.0\` is permissive but less common than MIT/Apache/BSD/ISC, so it remains review-required for launch.
- This report covers npm packages in the current lockfile. Rust/Tauri crate notices should be generated separately before signed desktop release artifacts.

## Packages Requiring Review

${summary.review.length === 0 ? "None." : summary.review.map((row) => `- ${row.name}@${row.version}: ${row.license}`).join("\n")}

## Blocked Or Unknown Packages

${summary.blocked.length === 0 && summary.unknown.length === 0 ? "None." : [...summary.blocked, ...summary.unknown].map((row) => `- ${row.name}@${row.version}: ${row.license}`).join("\n")}

## Package Table

| Package | Version | License | Status |
| --- | --- | --- | --- |
${table}
`;
}

function escapeCell(value) {
  return String(value).replaceAll("|", "\\|");
}
