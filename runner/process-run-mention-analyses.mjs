import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { ConvexHttpClient } from "convex/browser";

import { api } from "../convex/_generated/api.js";

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

function parseJsonContent(content) {
  const trimmed = String(content ?? "").trim();
  if (!trimmed) {
    throw new Error("Codex bridge returned an empty response.");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }
    throw new Error("Codex bridge returned invalid JSON.");
  }
}

function analysisSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["mentions", "warnings"],
    properties: {
      mentions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "trackedEntityId",
            "name",
            "slug",
            "kind",
            "mentionCount",
            "sentiment",
            "confidence",
            "evidence",
            "matchedTerms",
          ],
          properties: {
            trackedEntityId: { type: ["string", "null"] },
            name: { type: "string" },
            slug: { type: ["string", "null"] },
            kind: {
              type: ["string", "null"],
              enum: [
                "brand",
                "competitor",
                "product",
                "feature",
                "other",
                null,
              ],
            },
            mentionCount: { type: "number" },
            sentiment: {
              type: "string",
              enum: ["positive", "neutral", "negative", "mixed"],
            },
            confidence: { type: "number" },
            evidence: { type: "string" },
            matchedTerms: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
      },
    },
  };
}

function buildAnalysisPrompt(claimed) {
  const knownEntities = claimed.trackedEntities.map((entity) => ({
    trackedEntityId: entity.id,
    name: entity.name,
    slug: entity.slug,
    kind: entity.kind,
    aliases: entity.aliases ?? [],
    ownedDomains: entity.ownedDomains ?? [],
  }));

  return [
    "Analyze the AI assistant answer for brand, product, feature, and competitor mentions.",
    "Use deterministic mentions as the starting point, but add entities that are clearly mentioned even if they are not already tracked.",
    "If a mention matches one of the provided tracked entities by name, alias, slug, or owned domain, return that exact trackedEntityId.",
    "If a mention is a new candidate entity, set trackedEntityId to null and include a stable slug.",
    "Do not count citation URLs or page titles as mentions unless the answer text itself refers to the entity.",
    "Keep evidence to one short excerpt from the answer. Do not invent sentiment or entities.",
    "",
    JSON.stringify(
      {
        prompt: claimed.prompt,
        run: claimed.run,
        knownEntities,
        deterministicMentions: claimed.deterministicMentions,
        citations: claimed.citations,
        answer: claimed.run.responseText ?? claimed.run.responseSummary ?? "",
      },
      null,
      2
    ),
  ].join("\n");
}

async function callBridge(bridge, claimed) {
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
            "You are a precise GEO/AEO mention analyst. Return only valid JSON that matches the requested schema.",
        },
        {
          role: "user",
          content: buildAnalysisPrompt(claimed),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "run_mention_analysis",
          schema: analysisSchema(),
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
  return parseJsonContent(content);
}

async function processClaimedAnalysis(client, bridge, claimed) {
  try {
    const result = await callBridge(bridge, claimed);
    await client.mutation(api.analytics.completeRunMentionAnalysis, {
      analysisId: claimed.analysisId,
      status: "success",
      model: bridge.model,
      mentions: Array.isArray(result.mentions) ? result.mentions : [],
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    });
  } catch (error) {
    await client.mutation(api.analytics.completeRunMentionAnalysis, {
      analysisId: claimed.analysisId,
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
  const runner = "local-codex-mention-analysis-worker";

  while (true) {
    const claimed = await client.mutation(
      api.analytics.claimNextRunMentionAnalysis,
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
      await processClaimedAnalysis(client, bridge, claimed);
      console.log(
        `[mention-analysis] analyzed ${String(claimed.analysisId)} for ${claimed.run.providerName}`
      );
    } catch (error) {
      console.error(
        `[mention-analysis] failed ${String(claimed.analysisId)}: ${errorMessage(error)}`
      );
    }

    if (args.once) {
      return;
    }
  }
}

await main();
