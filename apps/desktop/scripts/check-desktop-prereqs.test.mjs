import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDesktopPrereqs } from "./check-desktop-prereqs.mjs";

const okVersionCheck = ({ label }) => ({ ok: true, version: `${label} test-version` });

test("passes Windows desktop checks when the MSVC toolchain is available", () => {
  const result = evaluateDesktopPrereqs({
    platform: "win32",
    runCommand: okVersionCheck,
    resolveToolchain: () => ({
      ok: true,
      missing: [],
      warnings: [],
      msvcLinkPath: "C:\\VS\\VC\\Tools\\MSVC\\14.42.34433\\bin\\Hostx64\\x64\\link.exe",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("keeps Git Bash link.exe collision as a warning when the wrapper can fix PATH", () => {
  const result = evaluateDesktopPrereqs({
    platform: "win32",
    runCommand: okVersionCheck,
    resolveToolchain: () => ({
      ok: true,
      missing: [],
      warnings: ["Git Bash resolves link.exe to C:\\Program Files\\Git\\usr\\bin\\link.exe."],
      msvcLinkPath: "C:\\VS\\VC\\Tools\\MSVC\\14.42.34433\\bin\\Hostx64\\x64\\link.exe",
    }),
  });

  assert.equal(result.ok, true);
  assert.match(result.warnings.join("\n"), /Git Bash resolves link\.exe/u);
});

test("fails Windows desktop checks when Visual Studio C++ tools are missing", () => {
  const result = evaluateDesktopPrereqs({
    platform: "win32",
    runCommand: okVersionCheck,
    resolveToolchain: () => ({
      ok: false,
      missing: ["Visual Studio C++ x64 build tools"],
      warnings: [],
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["Visual Studio C++ x64 build tools"]);
});
