#!/usr/bin/env node
import { stderr } from "node:process";
import { runPixelAidMcpStdioServer } from "./server";

runPixelAidMcpStdioServer().catch((error: unknown) => {
  stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
