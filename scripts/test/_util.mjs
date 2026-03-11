// scripts/test/_util.mjs
import { spawn } from "node:child_process";

export function run(cmd, args = [], opts = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    timeoutMs = 5000,
    expectExit = null, // null = don't check
  } = opts;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32", // better cmd resolution on Windows
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d) => (stderr += d.toString("utf8")));

    const t = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `TIMEOUT after ${timeoutMs}ms: ${cmd} ${args.join(" ")}\n` +
            `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`
        )
      );
    }, timeoutMs);

    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(t);
      if (expectExit !== null && code !== expectExit) {
        reject(
          new Error(
            `EXIT ${code} (expected ${expectExit}): ${cmd} ${args.join(" ")}\n` +
              `--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`
          )
        );
      }
      resolve({ code, stdout, stderr });
    });
  });
}

export function assertIncludes(haystack, needle, ctx = "") {
  if (!haystack.includes(needle)) {
    throw new Error(
      `ASSERT FAILED: expected output to include: ${JSON.stringify(needle)}\n` +
        (ctx ? `Context: ${ctx}\n` : "") +
        `--- output ---\n${haystack}`
    );
  }
}

export function assertNotIncludes(haystack, needle, ctx = "") {
  if (haystack.includes(needle)) {
    throw new Error(
      `ASSERT FAILED: expected output NOT to include: ${JSON.stringify(needle)}\n` +
        (ctx ? `Context: ${ctx}\n` : "") +
        `--- output ---\n${haystack}`
    );
  }
}
