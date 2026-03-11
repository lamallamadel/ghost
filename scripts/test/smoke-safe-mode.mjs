// scripts/test/smoke-safe-mode.mjs
import { run, assertIncludes } from "./_util.mjs";

const timeoutMs = Number(process.env.GHOST_TEST_TIMEOUT_MS ?? "6000");
const strict = process.env.STRICT === "1";

// Try common env var names. Keep whichever you implement.
const safeEnvs = [
  { key: "GHOST_DISABLE_EXTENSIONS", val: "1" },
  { key: "GHOST_SAFE_MODE", val: "1" },
];

const baseEnv = { ...process.env };
const cmd = "node";
const args = ["ghost.js", "--help"];

let anySucceeded = false;
let behaviorChanged = false;

for (const { key, val } of safeEnvs) {
  const env = { ...baseEnv, [key]: val };
  const { stdout, stderr } = await run(cmd, args, { timeoutMs, expectExit: 0, env });
  anySucceeded = true;

  // Heuristic: if safe-mode is implemented, you should print something like:
  // "SAFE MODE" or "Extensions disabled" or "0 extensions loaded"
  const out = stdout + stderr;
  assertIncludes(out, "USAGE:", `${key} should not break help`);
  if (
    out.toLowerCase().includes("safe mode") ||
    out.toLowerCase().includes("extensions disabled") ||
    out.toLowerCase().includes("0 extensions")
  ) {
    behaviorChanged = true;
  }
}

if (!anySucceeded) {
  throw new Error("Safe-mode smoke test failed to execute any variant.");
}

if (strict && !behaviorChanged) {
  throw new Error(
    "STRICT=1: safe-mode env vars did not produce any detectable safe-mode behavior.\n" +
      "Implement a clear banner (e.g., 'SAFE MODE: extensions disabled') when safe-mode is active."
  );
}

console.log(`OK smoke-safe-mode (strict=${strict ? "on" : "off"})`);
