#!/usr/bin/env node
import {
  assertNodriverFixtureResultFromFile,
  NODRIVER_FIXTURE_RESPONSE_TEXT,
} from "./nodriver-fixture-contract.mjs";

const resultPath = process.argv[2] ?? "runner/last-run.nodriver.json";

try {
  const verified = await assertNodriverFixtureResultFromFile(resultPath);
  console.log(
    JSON.stringify(
      {
        ok: true,
        resultPath,
        responseText: verified.responseText,
        expectedResponseText: NODRIVER_FIXTURE_RESPONSE_TEXT,
        citations: verified.citations,
        artifacts: verified.artifacts,
      },
      null,
      2
    )
  );
} catch (error) {
  const message =
    error instanceof Error
      ? error.message
      : "Nodriver fixture result assertion failed.";
  console.error(message);
  process.exit(1);
}
