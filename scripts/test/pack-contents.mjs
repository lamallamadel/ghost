// scripts/test/pack-contents.mjs
import { run, assertIncludes, assertNotIncludes } from "./_util.mjs";

const timeoutMs = Number(process.env.GHOST_TEST_TIMEOUT_MS ?? "15000");

// Run dry-run pack and capture output
const { stdout, stderr } = await run("npm", ["pack", "--dry-run"], {
  timeoutMs,
  expectExit: 0,
});

const out = stdout + stderr;

// Must-include (based on your package.json "files")
const mustHave = [
  "ghost.js",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "extensions/",
  "core/",
  "lib/",
  "packages/extension-sdk/",
];

for (const m of mustHave) assertIncludes(out, m, "npm pack content");

// Must-not-include (common accidents)
const mustNotHave = [
  ".env",
  "id_rsa",
  ".pem",
  "node_modules/",
  ".git/",
  ".github/",
  "~/.ghost",
];

for (const m of mustNotHave) assertNotIncludes(out, m, "npm pack content");

console.log("OK pack-contents");
