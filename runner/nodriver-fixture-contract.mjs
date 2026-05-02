import fs from "node:fs/promises";
import path from "node:path";

export const NODRIVER_FIXTURE_PROMPT = "Explain OpenPeec in one sentence.";

export const NODRIVER_FIXTURE_RESPONSE_TEXT =
  "OpenPeec tracks how a brand appears in AI answer surfaces. The nodriver fixture received: Explain OpenPeec in one sentence. Useful references: OpenPeec guide and AI visibility docs.";

export const NODRIVER_FIXTURE_CITATIONS = [
  {
    domain: "example.com",
    title: "OpenPeec guide",
    url: "https://example.com/openpeec-guide",
  },
  {
    domain: "docs.example.com",
    title: "AI visibility docs",
    url: "https://docs.example.com/ai-visibility",
  },
];

function fail(message) {
  throw new Error(message);
}

function resolveOutputPath(filePath, cwd = process.cwd()) {
  if (!filePath || typeof filePath !== "string") {
    return null;
  }
  if (filePath.startsWith("/app/")) {
    return path.join(cwd, filePath.slice("/app/".length));
  }
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

async function assertExistingFile(filePath, label, cwd) {
  const resolved = resolveOutputPath(filePath, cwd);
  if (!resolved) {
    fail(`Missing nodriver fixture artifact path for ${label}.`);
  }

  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isFile()) {
    fail(`Nodriver fixture artifact was not written: ${label} (${resolved}).`);
  }
  if (stat.size === 0) {
    fail(`Nodriver fixture artifact is empty: ${label} (${resolved}).`);
  }
  return resolved;
}

export async function assertNodriverFixtureResult(result, options = {}) {
  const checkArtifacts = options.checkArtifacts ?? true;
  const cwd = options.cwd ?? process.cwd();

  if (!result || typeof result !== "object") {
    fail("Nodriver fixture result is not an object.");
  }
  if (result.status !== "success") {
    fail(
      `Expected nodriver fixture status success, received ${result.status}.`
    );
  }
  if (result.responseText !== NODRIVER_FIXTURE_RESPONSE_TEXT) {
    fail(
      [
        "Expected nodriver fixture responseText to match the recorded fixture response.",
        `Expected: ${NODRIVER_FIXTURE_RESPONSE_TEXT}`,
        `Actual: ${result.responseText ?? ""}`,
      ].join("\n")
    );
  }

  const citations = Array.isArray(result.citations) ? result.citations : [];
  if (citations.length !== NODRIVER_FIXTURE_CITATIONS.length) {
    fail(
      `Expected ${NODRIVER_FIXTURE_CITATIONS.length} fixture citations, received ${citations.length}.`
    );
  }

  for (const expected of NODRIVER_FIXTURE_CITATIONS) {
    const actual = citations.find((citation) => citation.url === expected.url);
    if (!actual) {
      fail(`Missing expected nodriver fixture citation: ${expected.url}.`);
    }
    if (actual.title !== expected.title) {
      fail(
        `Expected citation title ${expected.title} for ${expected.url}, received ${actual.title}.`
      );
    }
    if (actual.domain !== expected.domain) {
      fail(
        `Expected citation domain ${expected.domain} for ${expected.url}, received ${actual.domain}.`
      );
    }
  }

  if (result.sourceCount !== NODRIVER_FIXTURE_CITATIONS.length) {
    fail(
      `Expected fixture sourceCount ${NODRIVER_FIXTURE_CITATIONS.length}, received ${result.sourceCount}.`
    );
  }

  const output = result.output ?? {};
  if (output.citationsExtracted !== NODRIVER_FIXTURE_CITATIONS.length) {
    fail(
      `Expected citationsExtracted ${NODRIVER_FIXTURE_CITATIONS.length}, received ${output.citationsExtracted}.`
    );
  }
  if (output.sourcesRecorded !== NODRIVER_FIXTURE_CITATIONS.length) {
    fail(
      `Expected sourcesRecorded ${NODRIVER_FIXTURE_CITATIONS.length}, received ${output.sourcesRecorded}.`
    );
  }

  const artifactPaths = {};
  if (checkArtifacts) {
    const artifacts = output.artifacts ?? {};
    for (const key of [
      "pageHtml",
      "responseHtml",
      "screenshot",
      "sources",
      "network",
      "console",
      "result",
    ]) {
      artifactPaths[key] = await assertExistingFile(artifacts[key], key, cwd);
    }

    const persistedResult = JSON.parse(
      await fs.readFile(artifactPaths.result, "utf8")
    );
    if (persistedResult.responseText !== NODRIVER_FIXTURE_RESPONSE_TEXT) {
      fail(
        "Persisted nodriver fixture result did not record the expected responseText."
      );
    }
  }

  return {
    responseText: result.responseText,
    citations: citations.map((citation) => citation.url),
    artifacts: artifactPaths,
  };
}

export async function assertNodriverFixtureResultFromFile(
  filePath,
  options = {}
) {
  const resolved = resolveOutputPath(filePath, options.cwd ?? process.cwd());
  const result = JSON.parse(await fs.readFile(resolved, "utf8"));
  return await assertNodriverFixtureResult(result, options);
}
