import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildVsDevCommand,
  findLatestMsvcBinPath,
  isGitBashLinkPath,
  resolveWindowsMsvcToolchain,
} from "./windows-msvc-toolchain.mjs";

test("detects Git Bash GNU link.exe as an MSVC linker collision", () => {
  assert.equal(isGitBashLinkPath("C:\\Program Files\\Git\\usr\\bin\\link.exe"), true);
  assert.equal(isGitBashLinkPath("C:\\Program Files\\Microsoft Visual Studio\\VC\\Tools\\MSVC\\bin\\link.exe"), false);
});

test("finds the newest MSVC x64 linker bin directory", () => {
  const installationPath = "C:\\VS";
  const toolsRoot = path.win32.join(installationPath, "VC", "Tools", "MSVC");
  const latestBin = path.win32.join(toolsRoot, "14.42.34433", "bin", "Hostx64", "x64");
  const directories = new Map([
    [
      toolsRoot,
      [
        { name: "14.40.33807", isDirectory: () => true },
        { name: "14.42.34433", isDirectory: () => true },
        { name: "readme.txt", isDirectory: () => false },
      ],
    ],
  ]);
  const files = new Set([path.win32.join(latestBin, "link.exe")]);

  const result = findLatestMsvcBinPath(installationPath, {
    existsSyncImpl: (candidate) => directories.has(candidate) || files.has(candidate),
    readdirSyncImpl: (candidate) => directories.get(candidate) ?? [],
  });

  assert.equal(result, latestBin);
});

test("builds a cmd command that prepends the MSVC linker path before Tauri", () => {
  const command = buildVsDevCommand({
    vsDevCmdPath: "C:\\VS\\Common7\\Tools\\VsDevCmd.bat",
    msvcBinPath: "C:\\VS\\VC\\Tools\\MSVC\\14.42.34433\\bin\\Hostx64\\x64",
    tauriCommand: "C:\\repo\\node_modules\\.bin\\tauri.cmd",
    tauriArgs: ["build"],
  });

  assert.match(command, /^call "C:\\VS\\Common7\\Tools\\VsDevCmd\.bat"/u);
  assert.match(command, /set "PATH=C:\\VS\\VC\\Tools\\MSVC\\14\.42\.34433\\bin\\Hostx64\\x64;%PATH%"/u);
  assert.match(command, /call "C:\\repo\\node_modules\\\.bin\\tauri\.cmd" build$/u);
});

test("resolves a usable Windows toolchain while warning about Git Bash link.exe", () => {
  const vsWherePath = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
  const installationPath = "C:\\VS";
  const vsDevCmdPath = path.win32.join(installationPath, "Common7", "Tools", "VsDevCmd.bat");
  const toolsRoot = path.win32.join(installationPath, "VC", "Tools", "MSVC");
  const msvcBinPath = path.win32.join(toolsRoot, "14.42.34433", "bin", "Hostx64", "x64");
  const gitLinkPath = "C:\\Program Files\\Git\\usr\\bin\\link.exe";
  const directories = new Map([[toolsRoot, [{ name: "14.42.34433", isDirectory: () => true }]]]);
  const files = new Set([vsWherePath, vsDevCmdPath, path.win32.join(msvcBinPath, "link.exe"), gitLinkPath]);

  const result = resolveWindowsMsvcToolchain({
    env: {
      "ProgramFiles(x86)": "C:\\Program Files (x86)",
      Path: "C:\\Program Files\\Git\\usr\\bin",
    },
    existsSyncImpl: (candidate) => directories.has(candidate) || files.has(candidate),
    readdirSyncImpl: (candidate) => directories.get(candidate) ?? [],
    spawnSyncImpl: () => ({ status: 0, stdout: `${installationPath}\n`, stderr: "" }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.linkCollision, true);
  assert.equal(result.msvcBinPath, msvcBinPath);
  assert.match(result.warnings.join("\n"), /Git Bash resolves link\.exe/u);
});
