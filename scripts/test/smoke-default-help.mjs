// scripts/test/smoke-default-help.mjs
import { run, assertIncludes, assertNotIncludes } from "./_util.mjs";

const timeoutMs = Number(process.env.GHOST_TEST_TIMEOUT_MS ?? "6000");

// Run local entrypoint with no args
const { stdout, stderr } = await run("node", ["ghost.js"], { timeoutMs, expectExit: 0 });
const out = stdout + stderr;

// Must show help
assertIncludes(out, "USAGE:", "default should print help");

// Must NOT start extensions (no JIT debug lines)
assertNotIncludes(out, "_ensureExtensionRunning(", "default should not JIT-load extensions");

console.log("OK smoke-default-help");
