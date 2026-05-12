import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";
import {
  buildPromptGenerationPrompt,
  normalizePromptGenerationOutput,
  parseJsonContent,
  promptGenerationSchema,
  stripHtmlText,
} from "./prompt-generation-core.mjs";

const DEFAULT_LOCAL_CONVEX_URL = "http://127.0.0.1:3210";
const DEFAULT_BRIDGE_BASE_URL = "http://127.0.0.1:8081/v1";
const DEFAULT_BRIDGE_API_KEY = "change-me";
const DEFAULT_BRIDGE_MODEL = "gpt-5.5:medium";

function parseArgs(argv) {
  const args = {
    once: false,
    pollIntervalMs: 10000,
    maxConcurrent: 1,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--once") {
      args.once = true;
      continue;
    }
    if (token === "--poll-interval-ms") {
      args.pollIntervalMs = Number(argv[index + 1] ?? args.pollIntervalMs);
      index += 1;
      continue;
    }
    if (token === "--max-concurrent") {
      args.maxConcurrent = Number(argv[index + 1] ?? args.maxConcurrent);
      index += 1;
    }
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readEnvFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseEnvValue(content, key) {
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const currentKey = line.slice(0, separator).trim();
    if (currentKey !== key) continue;
    let value = line.slice(separator + 1).trim();
    const inlineComment = value.indexOf(" #");
    if (inlineComment !== -1) {
      value = value.slice(0, inlineComment).trim();
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value;
  }
  return undefined;
}

async function resolveEnvValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  const cwd = process.cwd();
  const envLocal = await readEnvFile(path.join(cwd, ".env.local"));
  const localValue = parseEnvValue(envLocal, key);
  if (localValue) {
    return localValue;
  }

  const env = await readEnvFile(path.join(cwd, ".env"));
  return parseEnvValue(env, key);
}

async function resolveConvexUrl() {
  return (await resolveEnvValue("VITE_CONVEX_URL")) ?? DEFAULT_LOCAL_CONVEX_URL;
}

async function resolveBridgeConfig() {
  const baseUrl =
    (await resolveEnvValue("AI_BASE_URL")) ?? DEFAULT_BRIDGE_BASE_URL;
  const apiKey =
    (await resolveEnvValue("AI_API_KEY")) ??
    (await resolveEnvValue("CODEX_BRIDGE_API_KEY")) ??
    DEFAULT_BRIDGE_API_KEY;
  const model =
    (await resolveEnvValue("AI_MODEL")) ??
    (await resolveEnvValue("CODEX_BRIDGE_MODEL")) ??
    DEFAULT_BRIDGE_MODEL;

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    model,
  };
}

function websiteUrlForClaim(claimed) {
  if (claimed.websiteUrl) {
    return claimed.websiteUrl;
  }
  const domain = claimed.entity.ownedDomains?.[0];
  if (!domain) {
    return undefined;
  }
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

async function fetchWebsiteResearch(claimed) {
  const websiteUrl = websiteUrlForClaim(claimed);
  if (!websiteUrl) {
    return "";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(websiteUrl, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "OpenPeec prompt generation research worker (+https://openpeec.ai)",
      },
    });
    if (!response.ok) {
      return `Website fetch failed for ${websiteUrl}: ${response.status}`;
    }
    const html = await response.text();
    return stripHtmlText(html);
  } catch (error) {
    return `Website fetch failed for ${websiteUrl}: ${errorMessage(error)}`;
  } finally {
    clearTimeout(timeout);
  }
}

async function callBridge(bridge, claimed, websiteResearch) {
  const response = await fetch(`${bridge.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bridge.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: bridge.model,
      messages: [
        {
          role: "system",
          content:
            "You are a precise GEO/AEO prompt strategist. Return only valid JSON matching the schema.",
        },
        {
          role: "user",
          content: buildPromptGenerationPrompt(claimed, websiteResearch),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "entity_prompt_generation",
          schema: promptGenerationSchema(),
        },
      },
    }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Codex bridge request failed: ${response.status} ${body}`);
  }

  const payload = JSON.parse(body);
  const content = payload?.choices?.[0]?.message?.content;
  return normalizePromptGenerationOutput(parseJsonContent(content));
}

async function processClaimedGeneration(client, bridge, claimed) {
  try {
    const websiteResearch = await fetchWebsiteResearch(claimed);
    const result = await callBridge(bridge, claimed, websiteResearch);
    await client.mutation(api.analytics.completeEntityPromptGeneration, {
      generationId: claimed.generationId,
      status: "success",
      model: bridge.model,
      entitySummary: result.entitySummary,
      competitorNotes: result.competitorNotes,
      warnings: result.warnings,
      groups: result.groups,
    });
  } catch (error) {
    await client.mutation(api.analytics.completeEntityPromptGeneration, {
      generationId: claimed.generationId,
      status: "failed",
      model: bridge.model,
      error: errorMessage(error),
    });
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = new ConvexHttpClient(await resolveConvexUrl());
  const bridge = await resolveBridgeConfig();
  const runner = "local-codex-prompt-generation-worker";

  while (true) {
    const claimed = await client.mutation(
      api.analytics.claimNextEntityPromptGeneration,
      {
        runner,
        maxConcurrent: args.maxConcurrent,
      }
    );

    if (!claimed) {
      if (args.once) {
        return;
      }
      await sleep(args.pollIntervalMs);
      continue;
    }

    try {
      await processClaimedGeneration(client, bridge, claimed);
      console.log(
        `[prompt-generation] generated prompts for ${claimed.entity.name}`
      );
    } catch (error) {
      console.error(
        `[prompt-generation] failed ${String(claimed.generationId)}: ${errorMessage(error)}`
      );
    }

    if (args.once) {
      return;
    }
  }
}

await main();
