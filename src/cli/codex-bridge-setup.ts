import {
  getLocalCodexBridgeConfig,
  getRecommendedCodexAppEnv,
  setupLocalCodexBridge,
} from "../lib/codex-bridge";

async function main() {
  const config = getLocalCodexBridgeConfig();
  await setupLocalCodexBridge(config);

  const appEnv = getRecommendedCodexAppEnv(config);

  console.log("");
  console.log("Codex bridge is ready.");
  console.log("Bridge mode: local codex exec wrapper");
  console.log(`Bridge port: ${config.bridgePort}`);
  console.log("");
  console.log(
    "Use these app env values when you want this repo to call CodexBridge:"
  );
  console.log(`AI_BASE_URL=${appEnv.AI_BASE_URL}`);
  console.log(`DOCKER_AI_BASE_URL=${appEnv.DOCKER_AI_BASE_URL}`);
  console.log(`AI_API_KEY=${appEnv.AI_API_KEY}`);
  console.log(`AI_MODEL=${appEnv.AI_MODEL}`);
  console.log(`AI_TRANSPORT=${appEnv.AI_TRANSPORT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
