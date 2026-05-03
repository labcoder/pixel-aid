/* global console, process */

import { spawnSync } from "node:child_process";

const checks = [
  { command: "node", args: ["--version"], label: "Node.js" },
  { command: "npm", args: ["--version"], label: "npm" },
  { command: "rustc", args: ["--version"], label: "Rust compiler" },
  { command: "cargo", args: ["--version"], label: "Cargo" }
];

const missing = [];

for (const check of checks) {
  const result = spawnSync(check.command, check.args, { encoding: "utf8" });
  if (result.status === 0) {
    const version = result.stdout.trim() || result.stderr.trim();
    console.log(`ok ${check.label}: ${version}`);
  } else {
    missing.push(check.label);
    console.error(`missing ${check.label}`);
  }
}

if (missing.length > 0) {
  console.error("");
  console.error("Desktop packaging requires the Rust toolchain and Cargo.");
  console.error("Install Rust with rustup before running `npm run desktop:build`:");
  console.error("https://rustup.rs/");
  process.exit(1);
}

console.log("release signing: run `npm run release:check -w @pixelaid/desktop` before producing public desktop artifacts.");
