import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { LocalCodexBridgeConfig } from "./codex-bridge";

interface ChatCompletionRequestBody {
  messages?: Array<{
    role?: string;
    content?:
      | string
      | Array<
          | { type?: "text"; text?: string }
          | { type?: "image_url"; image_url?: { url?: string } }
          | { type?: "local_image"; path?: string }
        >;
  }>;
  model?: string;
  response_format?: {
    type?: string;
    json_schema?: {
      schema?: unknown;
    };
  };
  stream?: boolean;
}

interface NormalizedMessage {
  role: string;
  text: string;
  imagePaths: string[];
}

const JSON_BODY_LIMIT_BYTES = 20 * 1024 * 1024;
const CODEX_ERROR_MAX_LENGTH = 1400;

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendSseError(res: ServerResponse, model: string, message: string) {
  const created = Math.floor(Date.now() / 1000);
  const id = `chatcmpl-${randomUUID()}`;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(
    `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta: {}, finish_reason: "error" }],
      error: {
        message,
        type: "codex_exec_error",
      },
    })}\n\n`
  );
  res.write("data: [DONE]\n\n");
  res.end();
}

function clipText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

const ansiColorEscape = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function stripAnsi(value: string) {
  return value.replace(ansiColorEscape, "");
}

function schemaAllowsNull(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return false;
  }

  const record = schema as Record<string, unknown>;
  if (record.type === "null") {
    return true;
  }

  if (Array.isArray(record.type) && record.type.includes("null")) {
    return true;
  }

  if (Array.isArray(record.enum) && record.enum.includes(null)) {
    return true;
  }

  if (Array.isArray(record.anyOf)) {
    return record.anyOf.some((entry) => schemaAllowsNull(entry));
  }

  if (Array.isArray(record.oneOf)) {
    return record.oneOf.some((entry) => schemaAllowsNull(entry));
  }

  return false;
}

function allowNullInSchema(schema: unknown): unknown {
  if (
    !schema ||
    typeof schema !== "object" ||
    Array.isArray(schema) ||
    schemaAllowsNull(schema)
  ) {
    return schema;
  }

  const record = schema as Record<string, unknown>;

  if (Array.isArray(record.enum)) {
    return {
      ...record,
      enum: [...record.enum, null],
    };
  }

  if (typeof record.type === "string") {
    return {
      ...record,
      type: [record.type, "null"],
    };
  }

  if (Array.isArray(record.type)) {
    return {
      ...record,
      type: [...record.type, "null"],
    };
  }

  if (Array.isArray(record.anyOf)) {
    return {
      ...record,
      anyOf: [...record.anyOf, { type: "null" }],
    };
  }

  return {
    anyOf: [schema, { type: "null" }],
  };
}

function makeCodexOutputSchemaCompatible(schema: unknown): unknown {
  if (Array.isArray(schema)) {
    return schema.map((entry) => makeCodexOutputSchemaCompatible(entry));
  }

  if (!schema || typeof schema !== "object") {
    return schema;
  }

  const record = schema as Record<string, unknown>;
  const normalizedRecord: Record<string, unknown> = { ...record };

  if (record.items) {
    normalizedRecord.items = makeCodexOutputSchemaCompatible(record.items);
  }

  if (Array.isArray(record.anyOf)) {
    normalizedRecord.anyOf = record.anyOf.map((entry) =>
      makeCodexOutputSchemaCompatible(entry)
    );
  }

  if (Array.isArray(record.oneOf)) {
    normalizedRecord.oneOf = record.oneOf.map((entry) =>
      makeCodexOutputSchemaCompatible(entry)
    );
  }

  if (Array.isArray(record.allOf)) {
    normalizedRecord.allOf = record.allOf.map((entry) =>
      makeCodexOutputSchemaCompatible(entry)
    );
  }

  if (
    record.properties &&
    typeof record.properties === "object" &&
    !Array.isArray(record.properties)
  ) {
    const propertiesRecord = record.properties as Record<string, unknown>;
    const existingRequired = new Set(
      Array.isArray(record.required)
        ? record.required.filter(
            (value): value is string => typeof value === "string"
          )
        : []
    );

    const normalizedProperties = Object.fromEntries(
      Object.entries(propertiesRecord).map(([key, value]) => {
        const normalizedValue = makeCodexOutputSchemaCompatible(value);
        return [
          key,
          existingRequired.has(key)
            ? normalizedValue
            : allowNullInSchema(normalizedValue),
        ];
      })
    );

    normalizedRecord.properties = normalizedProperties;
    normalizedRecord.required = Object.keys(normalizedProperties);
  }

  for (const [key, value] of Object.entries(record)) {
    if (
      key === "properties" ||
      key === "items" ||
      key === "anyOf" ||
      key === "oneOf" ||
      key === "allOf" ||
      key === "required"
    ) {
      continue;
    }

    if (value && typeof value === "object") {
      normalizedRecord[key] = makeCodexOutputSchemaCompatible(value);
    }
  }

  return normalizedRecord;
}

function formatCodexExecError(
  stderr: string,
  stdout: string,
  exitCode: number
) {
  const combined = stripAnsi(`${stderr}\n${stdout}`);
  const embeddedMessageMatch = combined.match(/"message"\s*:\s*"([^"]+)"/);
  const invalidModelMatch = combined.match(
    /"message":"([^"]+supported when using Codex with a ChatGPT account\.)"/
  );

  if (invalidModelMatch?.[1]) {
    return invalidModelMatch[1];
  }

  if (embeddedMessageMatch?.[1]) {
    return clipText(embeddedMessageMatch[1], CODEX_ERROR_MAX_LENGTH);
  }

  const errorLine = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("ERROR:"));

  if (errorLine) {
    const embeddedMessageMatch = errorLine.match(/"message":"([^"]+)"/);
    const errorText =
      embeddedMessageMatch?.[1] ?? errorLine.replace(/^ERROR:\s*/, "");
    return clipText(errorText, CODEX_ERROR_MAX_LENGTH);
  }

  const hadBackground403s =
    combined.includes("remote plugin sync request") ||
    combined.includes("analytics-events/events") ||
    combined.includes("failed to warm featured plugin ids cache");

  const meaningfulLines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line))
    .filter((line) => !line.startsWith("<"))
    .filter((line) => !line.includes("__cf_chl"))
    .filter((line) => !line.includes("window._cf_chl_opt"))
    .filter((line) => !line.startsWith("(function()"))
    .filter((line) => !line.startsWith("OpenAI Codex"))
    .filter((line) => line !== "--------")
    .filter((line) => line !== "user")
    .filter((line) => line !== "codex")
    .filter((line) => line !== "tokens used")
    .filter((line) => !line.startsWith("workdir:"))
    .filter((line) => !line.startsWith("model:"))
    .filter((line) => !line.startsWith("provider:"))
    .filter((line) => !line.startsWith("approval:"))
    .filter((line) => !line.startsWith("sandbox:"))
    .filter((line) => !line.startsWith("reasoning effort:"))
    .filter((line) => !line.startsWith("reasoning summaries:"))
    .filter((line) => !line.startsWith("session id:"))
    .filter((line) => !line.includes("remote plugin sync request"))
    .filter(
      (line) => !line.includes("failed to warm featured plugin ids cache")
    )
    .filter((line) => !line.includes("events failed with status 403 Forbidden"))
    .filter(
      (line) => !line.includes("Enable JavaScript and cookies to continue")
    )
    .filter((line, index, items) => items.indexOf(line) === index)
    .slice(0, 6);

  const summaryParts = [
    ...(hadBackground403s
      ? [
          "Codex emitted background plugin or analytics 403 warnings from chatgpt.com.",
        ]
      : []),
    ...meaningfulLines,
  ];
  const summary = summaryParts.join("\n").trim();

  return summary
    ? clipText(summary, CODEX_ERROR_MAX_LENGTH)
    : `Codex exited with code ${exitCode}.`;
}

function extractBearerToken(req: IncomingMessage) {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const apiKey = req.headers["x-api-key"];
  return Array.isArray(apiKey) ? apiKey[0] : (apiKey ?? null);
}

async function readRequestJson(
  req: IncomingMessage
): Promise<ChatCompletionRequestBody> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > JSON_BODY_LIMIT_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? (JSON.parse(body) as ChatCompletionRequestBody) : {};
}

function sanitizeExtension(value: string | null) {
  if (!value) {
    return "bin";
  }

  const normalized = value.toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "bin";
}

async function materializeImageInput(
  candidate: string,
  tempDir: string
): Promise<{ path: string; cleanupPath: string | null }> {
  if (candidate.startsWith("data:")) {
    const [header, data] = candidate.split(",", 2);
    const mimeMatch = header.match(/^data:([^;]+);base64$/i);
    const extension = sanitizeExtension(mimeMatch?.[1] ?? null);
    const filePath = path.join(tempDir, `image-${randomUUID()}.${extension}`);
    await fsp.writeFile(filePath, Buffer.from(data ?? "", "base64"));
    return { path: filePath, cleanupPath: filePath };
  }

  if (candidate.startsWith("file://")) {
    return { path: fileURLToPath(candidate), cleanupPath: null };
  }

  if (/^https?:\/\//i.test(candidate)) {
    const response = await fetch(candidate);
    if (!response.ok) {
      throw new Error(
        `Failed to download image attachment: ${response.status} ${response.statusText}`
      );
    }

    const extension = sanitizeExtension(response.headers.get("content-type"));
    const filePath = path.join(tempDir, `image-${randomUUID()}.${extension}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(filePath, bytes);
    return { path: filePath, cleanupPath: filePath };
  }

  return { path: candidate, cleanupPath: null };
}

async function normalizeMessages(
  messages: ChatCompletionRequestBody["messages"],
  tempDir: string
): Promise<{
  normalizedMessages: NormalizedMessage[];
  cleanupPaths: string[];
}> {
  const normalizedMessages: NormalizedMessage[] = [];
  const cleanupPaths: string[] = [];

  for (const message of messages ?? []) {
    const role = message?.role ?? "user";
    const imagePaths: string[] = [];
    const textParts: string[] = [];

    if (typeof message?.content === "string") {
      textParts.push(message.content);
    } else if (Array.isArray(message?.content)) {
      for (const part of message.content) {
        const text = part?.type === "text" ? part.text : undefined;
        if (part?.type === "text" && typeof text === "string" && text.trim()) {
          textParts.push(text);
          continue;
        }

        const imageUrl =
          part?.type === "image_url" ? part.image_url?.url : undefined;
        if (
          part?.type === "image_url" &&
          typeof imageUrl === "string" &&
          imageUrl.trim()
        ) {
          const image = await materializeImageInput(imageUrl, tempDir);
          imagePaths.push(image.path);
          if (image.cleanupPath) {
            cleanupPaths.push(image.cleanupPath);
          }
          continue;
        }

        const localImagePath =
          part?.type === "local_image" ? part.path : undefined;
        if (
          part?.type === "local_image" &&
          typeof localImagePath === "string" &&
          localImagePath.trim()
        ) {
          const image = await materializeImageInput(localImagePath, tempDir);
          imagePaths.push(image.path);
          if (image.cleanupPath) {
            cleanupPaths.push(image.cleanupPath);
          }
        }
      }
    }

    normalizedMessages.push({
      role,
      text: textParts.join("\n\n").trim(),
      imagePaths,
    });
  }

  return { normalizedMessages, cleanupPaths };
}

function buildPrompt(messages: NormalizedMessage[], jsonObjectMode: boolean) {
  const blocks = messages
    .map((message) => {
      if (!message.text) {
        return null;
      }

      return `[${message.role.toUpperCase()}]\n${message.text}`;
    })
    .filter((value): value is string => Boolean(value));

  if (!blocks.some((block) => block.startsWith("[USER]"))) {
    throw new Error("Messages must include at least one user entry.");
  }

  const preamble = [
    "You are receiving a chat transcript from another application.",
    "Treat the transcript below as the complete conversation to answer.",
    "Follow the transcript exactly and produce only the requested final answer.",
    "Do not ask follow-up questions unless the transcript explicitly requires it.",
    "Do not add commentary about the workspace unless the transcript asks for it.",
  ];

  if (jsonObjectMode) {
    preamble.push("Return only valid JSON in your final answer.");
  }

  return `${preamble.join("\n")}\n\n${blocks.join("\n\n")}`;
}

function resolveRequestedModel(
  config: LocalCodexBridgeConfig,
  requestedModel: string | undefined
) {
  const raw = (
    requestedModel ?? `${config.bridgeModel}:${config.bridgeReasoning}`
  ).trim();
  const [rawModelName, rawReasoning] = raw.split(":", 2);
  const modelName = rawModelName?.trim() || config.bridgeModel;
  const reasoning = rawReasoning?.trim() || config.bridgeReasoning;

  return {
    modelName,
    reasoning,
    responseModel: raw,
  };
}

function buildCodexSpawnConfig(config: LocalCodexBridgeConfig, args: string[]) {
  const stdio: ["pipe", "pipe", "pipe"] = ["pipe", "pipe", "pipe"];

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "codex", ...args],
      options: {
        cwd: config.appRoot,
        stdio,
        shell: false,
        env: {
          ...process.env,
        },
      },
    };
  }

  return {
    command: "codex",
    args,
    options: {
      cwd: config.appRoot,
      stdio,
      shell: false,
      env: {
        ...process.env,
      },
    },
  };
}

async function runCodexExec(
  config: LocalCodexBridgeConfig,
  prompt: string,
  imagePaths: string[],
  outputSchema: unknown,
  requestedModel: string | undefined
) {
  const tempDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), "openpeec-codex-bridge-")
  );
  const outputPath = path.join(tempDir, "assistant-output.txt");
  const schemaPath = outputSchema
    ? path.join(tempDir, "output-schema.json")
    : null;
  const { modelName, reasoning, responseModel } = resolveRequestedModel(
    config,
    requestedModel
  );

  if (schemaPath) {
    await fsp.writeFile(
      schemaPath,
      JSON.stringify(makeCodexOutputSchemaCompatible(outputSchema)),
      "utf8"
    );
  }

  const args = [
    "exec",
    "-m",
    modelName,
    "-c",
    `model_reasoning_effort="${reasoning}"`,
    "-s",
    "read-only",
    "--skip-git-repo-check",
    "-C",
    config.appRoot,
    "-o",
    outputPath,
  ];

  if (schemaPath) {
    args.push("--output-schema", schemaPath);
  }

  for (const imagePath of imagePaths) {
    args.push("-i", imagePath);
  }

  args.push("-");

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const spawnConfig = buildCodexSpawnConfig(config, args);

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      spawnConfig.command,
      spawnConfig.args,
      spawnConfig.options
    );

    child.stdin.end(prompt);
    child.stdout.on("data", (chunk: Buffer | string) =>
      stdoutChunks.push(Buffer.from(chunk))
    );
    child.stderr.on("data", (chunk: Buffer | string) =>
      stderrChunks.push(Buffer.from(chunk))
    );
    child.on("error", reject);
    child.on("close", (code: number | null) => resolve(code ?? 1));
  });

  try {
    if (exitCode !== 0) {
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      throw new Error(formatCodexExecError(stderr, stdout, exitCode));
    }

    const content = await fsp.readFile(outputPath, "utf8");
    return {
      content,
      responseModel,
    };
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  config: LocalCodexBridgeConfig
) {
  if (extractBearerToken(req) !== config.bridgeApiKey) {
    sendJson(res, 401, {
      error: {
        message: "Invalid or missing API key.",
        type: "unauthorized",
      },
    });
    return;
  }

  const requestBody = await readRequestJson(req);
  const tempDir = await fsp.mkdtemp(
    path.join(os.tmpdir(), "openpeec-codex-inputs-")
  );

  try {
    if (
      !Array.isArray(requestBody.messages) ||
      requestBody.messages.length === 0
    ) {
      sendJson(res, 400, {
        error: {
          message: "Request body must include a non-empty messages array.",
          type: "invalid_request_error",
        },
      });
      return;
    }

    const { normalizedMessages, cleanupPaths } = await normalizeMessages(
      requestBody.messages,
      tempDir
    );
    const allImagePaths = normalizedMessages.flatMap(
      (message) => message.imagePaths
    );
    const responseFormatType = requestBody.response_format?.type ?? null;
    const outputSchema =
      responseFormatType === "json_schema"
        ? (requestBody.response_format?.json_schema?.schema ?? null)
        : null;
    const prompt = buildPrompt(
      normalizedMessages,
      responseFormatType === "json_object"
    );

    try {
      const result = await runCodexExec(
        config,
        prompt,
        allImagePaths,
        outputSchema,
        requestBody.model
      );

      const created = Math.floor(Date.now() / 1000);
      const id = `chatcmpl-${randomUUID()}`;

      if (requestBody.stream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model: result.responseModel,
            choices: [
              { index: 0, delta: { role: "assistant" }, finish_reason: null },
            ],
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model: result.responseModel,
            choices: [
              {
                index: 0,
                delta: { content: result.content },
                finish_reason: null,
              },
            ],
          })}\n\n`
        );
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model: result.responseModel,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`
        );
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      sendJson(res, 200, {
        id,
        object: "chat.completion",
        created,
        model: result.responseModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: result.content,
            },
            finish_reason: "stop",
          },
        ],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (requestBody.stream) {
        sendSseError(
          res,
          requestBody.model ??
            `${config.bridgeModel}:${config.bridgeReasoning}`,
          message
        );
        return;
      }

      sendJson(res, 500, {
        error: {
          message,
          type: "codex_exec_error",
        },
      });
    } finally {
      await Promise.all(
        cleanupPaths.map((cleanupPath) => fsp.rm(cleanupPath, { force: true }))
      );
    }
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

export async function serveLocalCodexBridge(config: LocalCodexBridgeConfig) {
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const url = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`
        );

        if (req.method === "GET" && url.pathname === "/health") {
          sendJson(res, 200, { status: "ok" });
          return;
        }

        if (req.method === "GET" && url.pathname === "/v1/models") {
          sendJson(res, 200, {
            object: "list",
            data: [
              {
                object: "model",
                id: `${config.bridgeModel}:${config.bridgeReasoning}`,
                label: `${config.bridgeModel} (${config.bridgeReasoning})`,
              },
            ],
            defaults: {
              model: `${config.bridgeModel}:${config.bridgeReasoning}`,
            },
          });
          return;
        }

        if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
          await handleChatCompletions(req, res, config);
          return;
        }

        sendJson(res, 404, {
          error: {
            message: "Not found.",
            type: "not_found",
          },
        });
      } catch (error) {
        sendJson(res, 500, {
          error: {
            message: error instanceof Error ? error.message : String(error),
            type: "internal_server_error",
          },
        });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(config.bridgePort), () => resolve());
  });

  console.log(
    `Local Codex bridge listening on http://localhost:${config.bridgePort}`
  );

  await new Promise<void>(() => undefined);
}
