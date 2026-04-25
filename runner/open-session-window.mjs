import process from "node:process";
import { pathToFileURL } from "node:url";

import { openCaptureSession, parseArgs } from "./capture-session.mjs";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function saveQuietly(session) {
  try {
    await session.save();
  } catch {
    // Persistent browser profiles remain the source of truth. Storage-state
    // export is best-effort for debugging and portability.
  }
}

export async function openSessionWindow(options = {}) {
  const session = await openCaptureSession(options);

  console.log(
    `[session-window] Opened ${options.url ?? "https://chatgpt.com/"} with ${session.engine}`
  );
  if (session.profileDir) {
    console.log(`[session-window] Profile: ${session.profileDir}`);
  }
  console.log(`[session-window] Storage state: ${session.outputPath}`);
  console.log(
    "[session-window] Complete any manual login/verification in the browser, then close the browser window."
  );

  await saveQuietly(session);
  const interval = setInterval(() => {
    void saveQuietly(session);
  }, 10_000);

  const closed = new Promise((resolve) => {
    session.context.once("close", resolve);
  });

  const stop = async () => {
    clearInterval(interval);
    await saveQuietly(session);
    await session.close().catch(() => {});
  };

  process.once("SIGINT", () => {
    void stop().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void stop().finally(() => process.exit(0));
  });

  await closed;
  clearInterval(interval);
  await saveQuietly(session);
  return {
    engine: session.engine,
    profileDir: session.profileDir,
    outputPath: session.outputPath,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await openSessionWindow(args);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[session-window] ${message}`);
    process.exit(1);
  });
}
