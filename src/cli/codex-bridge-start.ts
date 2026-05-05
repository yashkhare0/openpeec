import {
  getLocalCodexBridgeConfig,
  startLocalCodexBridge,
} from "../lib/codex-bridge";

async function main() {
  const config = getLocalCodexBridgeConfig();
  await startLocalCodexBridge(config);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
