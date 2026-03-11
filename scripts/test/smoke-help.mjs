// scripts/test/smoke-help.mjs
import { run, assertIncludes } from "./_util.mjs";

const timeoutMs = Number(process.env.GHOST_TEST_TIMEOUT_MS ?? "6000");

// Prefer local entrypoint (node ghost.js) to avoid global resolution issues.
// If you want the global binary, set GHOST_TEST_USE_GLOBAL=1.
const useGlobal = process.env.GHOST_TEST_USE_GLOBAL === "1";

const cmd = useGlobal ? "ghost" : "node";
const args = useGlobal ? ["--help"] : ["ghost.js", "--help"];

const { stdout, stderr } = await run(cmd, args, { timeoutMs, expectExit: 0 });

// Accept that Ghost prints conflict warnings; but it must still print help.
assertIncludes(stdout + stderr, "GHOST CLI", "help banner");
assertIncludes(stdout + stderr, "USAGE:", "usage section");

console.log("OK smoke-help");
