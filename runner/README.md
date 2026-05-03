# Local Monitoring Runner

Use this runner to execute internal monitoring prompts against provider web clients and capture response visibility and citation quality signals per run.

OpenPeec executes runnable provider web clients through provider-specific
adapters. OpenAI/ChatGPT and Google AI Mode are active by default; other seeded
providers stay inactive until their browser flows and extraction contracts are
implemented.

This is an operator tool for recurring checks, not a generic browser automation script. Every run should answer:

- Did the provider return a usable response for this monitoring prompt?
- Which sources were cited, and where did they appear?
- Did citation quality or visibility degrade versus expected behavior?

## Commands

- `pnpm runner:install-browsers`
- `pnpm runner:install-camoufox`
- `pnpm runner:install-nodriver`
- `pnpm runner:capture-session`
- `pnpm runner:open-session`
- `pnpm runner:stealth-smoke`
- `pnpm runner:nodriver:fixture`
- `pnpm docker:nodriver:fixture`
- `pnpm runner:monitor -- --config runner/example.monitor.json`
- `pnpm runner:monitor -- --config runner/example.monitor.json --output runner/last-run.json --ingest`
- `pnpm runner:prompt:example`
- `pnpm runner:queue`
- `pnpm runner:queue:once`
- `pnpm runner:queue:docker`
- `pnpm runner:queue:docker:once`
- `pnpm runner:queue:nodriver`
- `pnpm runner:queue:nodriver:once`
- `pnpm docker:dev`

## Operator Workflow

1. Install Camoufox once with `pnpm runner:install-camoufox`. Keep `pnpm runner:install-browsers` for the app e2e suite and the fallback Playwright engine.
2. **Prime the Camoufox session once** with `pnpm runner:capture-session -- --engine camoufox`: log in or complete whatever ChatGPT needs in the opened browser. This saves a Playwright storage-state file at `runner/camoufox.storage-state.json`.
3. If a run is blocked, repeat the capture step and retry. For debugging only, set `"sessionMode": "guest"` in the monitor config to force a fresh browser context with no stored cookies.
4. Run a monitoring check with `pnpm runner:prompt:example`, or queue prompts from the dashboard and process them with `pnpm runner:queue` or `pnpm runner:queue:once`. The dashboard can queue an explicit browser engine per run; use `pnpm runner:queue` for Camoufox/default runs and `pnpm runner:queue:nodriver` for nodriver-tagged runs.
5. The queue worker claims one prompt run group at a time. Inside that group it starts one independent browser session per enabled provider and waits for all provider children to settle. Standalone `runner:monitor` commands are one-shot and close after the run.
6. Review `runner/last-run.json` and the evidence bundle in `runner/artifacts/<run-label>-<timestamp>/`.
7. Inspect:
   `status`, `warnings`, `responseText`, `citations`, `visibilityScore`, `citationQualityScore`, `network.json`, `console.json`, `page.html`, `response.html`, `trace.zip`, and the recorded video.
8. If you need ingestion, run with `--ingest` and set `VITE_CONVEX_URL`.

`pnpm dev` starts the queue worker automatically (`dev:runner`) so queued
prompt jobs are picked up without manual worker startup.
Queue runs use the configured browser engine and still capture screenshots,
trace, DOM, network, console, and source artifacts. Camoufox does not support
Playwright video recording through the remote Firefox server.
The dashboard Providers page exposes the same Camoufox local session opener through the Vite-only `/local-provider-session/open` endpoint. That endpoint exists for local open-source development; it launches an interactive Camoufox window, saves `runner/camoufox.storage-state.json`, and does not automate account login or verification.

`pnpm docker:dev` runs the same local stack through Compose: frontend, local
Convex, and the Camoufox queue worker. The Docker image installs Camoufox,
nodriver, Chromium, and the browser runtime dependencies during build, so the
runner does not fail later with a missing Camoufox package. The Docker
Camoufox worker uses `runner/example.monitor.docker.json`, which is the same
runner contract as `runner/example.monitor.json` but headless for containers.
The one-shot nodriver fixture service is kept behind the `verify` Compose
profile and still runs through `pnpm docker:nodriver:fixture`.

## Browser Engines

`browser.engine` controls the runner browser:

- `"camoufox"`: official Python Camoufox launched through its Playwright remote server. This is the default in `runner/example.monitor.json`. Stored sessions use `browser.storageStatePath`, not `browser.userDataDir`; grouped queue runs start independent provider sessions in parallel.
- `"playwright"`: regular Playwright Chromium. Stored sessions use `browser.userDataDir`, defaulting to `runner/profiles/chatgpt-chrome` for OpenAI.
- `"nodriver"`: experimental Python nodriver adapter for local-only runner learning. It delegates from `runMonitor()` to `runner/nodriver-worker.py` and preserves the runner result/artifact contract for controlled fixtures. It is not used for Playwright e2e or as the default provider runner.

Camoufox setup:

```sh
pnpm runner:install-camoufox
pnpm runner:capture-session -- --engine camoufox
pnpm runner:stealth-smoke
```

The local installer creates `runner/.venv-camoufox`, installs
`runner/requirements-camoufox.txt`, fetches the Camoufox browser, and verifies
`runner/camoufox-server.py --check`. It refuses Python 3.15 alpha builds; use a
stable Python 3.10-3.14. To force a bootstrap interpreter:

```sh
OPENPEEC_CAMOUFOX_BOOTSTRAP_PYTHON=/path/to/python3.12 pnpm runner:install-camoufox
```

At runtime, an explicit `browser.camoufox.python` or `CAMOUFOX_PYTHON` wins.
Otherwise the runner prefers `runner/.venv-camoufox/bin/python`, then known
stable local Python 3.12 paths.

`pnpm runner:stealth-smoke` records a local fingerprint probe under `runner/artifacts/`. Add `-- --detectors` to also visit public detector pages, or `-- --engine all` to compare regular Playwright and Camoufox in the same run.

Nodriver fixture setup:

```sh
pnpm runner:install-nodriver
pnpm dev:frontend
pnpm runner:nodriver:fixture
```

The fixture command is self-verifying: it fails unless the runner records the
exact fixture response text, two expected citations, and the artifact files.

`nodriver==0.48.1` needs Python 3.10+ in practice. If your system `python3`
is older, set `OPENPEEC_NODRIVER_PYTHON=/path/to/python3.12`. The fixture is
served from `public/nodriver-fixture.html` and intentionally avoids ChatGPT or
other third-party provider flows. To verify the containerized full local stack,
run:

```sh
pnpm docker:nodriver:fixture
```

## Prompt-Oriented Config Contract

`runner/example.monitor.json`:

```json
{
  "monitorId": "optional-monitor-id-for-legacy-ingest",
  "promptId": "optional-prompt-id-for-analytics-ingest",
  "runLabel": "chatgpt-citation-visibility-smoke",
  "provider": "openai",
  "platform": "web",
  "sessionMode": "stored",
  "browser": {
    "engine": "camoufox",
    "storageStatePath": "runner/camoufox.storage-state.json",
    "headless": false,
    "camoufox": {
      "humanize": 0.8,
      "geoip": false
    }
  },
  "navigation": {
    "url": "https://chatgpt.com/",
    "submitStrategy": "type",
    "waitUntil": "domcontentloaded",
    "timeoutMs": 30000,
    "hopWaitUntil": "load",
    "domainHops": [
      { "url": "https://www.google.com/", "waitAfterMs": 6000 },
      { "url": "https://en.wikipedia.org/wiki/Main_Page", "waitAfterMs": 5000 },
      { "url": "https://github.com/", "waitAfterMs": 5000 },
      { "googleSearch": "open source software", "waitAfterMs": 5000 }
    ]
  },
  "prompt": {
    "text": "Prompt text to submit",
    "inputSelector": "div#prompt-textarea[contenteditable='true'], #prompt-textarea[contenteditable='true'], [contenteditable='true']:visible, textarea:visible",
    "submitSelector": "button[data-testid='send-button'], button[aria-label*='Send']",
    "submitKey": "Enter",
    "clearExisting": true
  },
  "extraction": {
    "responseContainerSelector": "[data-message-author-role='assistant']:not([data-message-id*='request-placeholder']):last-of-type",
    "responseTextSelector": "[data-message-author-role='assistant']:not([data-message-id*='request-placeholder']):last-of-type",
    "citationLinkSelector": "a[href]",
    "maxCitations": 20
  },
  "assertions": {
    "urlIncludes": "chatgpt.com",
    "titleIncludes": "optional title substring",
    "waitForSelector": "optional selector"
  },
  "timing": {
    "responseTimeoutMs": 45000,
    "settleDelayMs": 1500,
    "warmupGotoTimeoutMs": 30000,
    "postHopSettleMinMs": 2500,
    "hopNetworkIdleMaxMs": 0
  },
  "ingest": {
    "target": "auto|analytics|monitoring"
  }
}
```

`sessionMode` defaults to `"stored"`. With Camoufox, stored mode reads `browser.storageStatePath` and defaults to `runner/camoufox.storage-state.json`. With regular Playwright, stored mode uses `browser.userDataDir` and defaults to `runner/profiles/chatgpt-chrome` for OpenAI if omitted. Provider `sessionJson` can add material using the same shape as `runner/example.auth-profile.json`, or a Playwright storage-state JSON.
The live ChatGPT page uses a visible `#prompt-textarea` contenteditable and a hidden fallback `textarea`; keep the contenteditable first in your selector order.
OpenAI runs default to `navigation.submitStrategy: "type"`: the runner opens `https://chatgpt.com/`, waits for the composer, types the prompt, and submits it. To test the ChatGPT `?q={prompt}` deep link path explicitly, set `navigation.submitStrategy: "deeplink"` and `navigation.promptQueryParam: "q"`.
The live ChatGPT response stream also renders temporary `request-placeholder` assistant nodes; exclude those from extraction or you will scrape an empty streaming shell instead of the completed answer.
If selectors fail, a stored fallback profile is invalid, or ChatGPT markup shifts, the run still returns structured output with warnings.

**Domain hops (default on):** before `navigation.url` (e.g. ChatGPT), the runner runs `navigation.domainHops` in the same tab. The queue build merges `deepLink` and `navigation` (later wins per key, but see below): if you put `domainHops` only on `deepLink` and the worker adds a minimal `navigation` (URL only), hops are still applied. Each step uses `navigation.hopWaitUntil` for `page.goto` (default **`load`**, not `domcontentloaded`). After the navigation, it waits for the **`load`** event, then optionally up to `timing.hopNetworkIdleMaxMs` for **`networkidle`** (default `0` = off, since many sites never go fully idle), then a minimum **post-load settle** `timing.postHopSettleMinMs` (default `2500` ms), then each hop’s **`waitAfterMs`** (extra time on the page). Google search steps wait for **load** on the results page the same way. Set `"domainHops": []` to skip. `timing.warmupGotoTimeoutMs` bounds each hop’s `goto` timeout (default `30000`).

## Result Contract

The runner emits JSON:

```json
{
  "schemaVersion": 2,
  "monitorId": "string-or-null",
  "promptId": "string-or-null",
  "runLabel": "string",
  "provider": "openai|claude|gemini|mistral",
  "platform": "web|desktop|ios|android",
  "status": "success|failed",
  "startedAt": 0,
  "finishedAt": 0,
  "latencyMs": 0,
  "summary": "string",
  "deeplinkUsed": "https://...",
  "evidencePath": "path-or-null",
  "fallbackUsed": false,
  "warnings": [],
  "responseText": "string",
  "responseSummary": "string",
  "sourceCount": 0,
  "citations": [
    {
      "position": 1,
      "domain": "example.com",
      "url": "https://example.com/article",
      "title": "Citation title",
      "snippet": "Nearby text snippet",
      "type": "docs|ugc|editorial|social|corporate|other",
      "qualityScore": 87
    }
  ],
  "visibilityScore": 74.5,
  "citationQualityScore": 68.2,
  "averageCitationPosition": 2.4,
  "output": {
    "title": "Page title",
    "finalUrl": "https://...",
    "screenshot": "path",
    "artifacts": {
      "runDir": "path",
      "screenshot": "path",
      "trace": "path",
      "video": "path",
      "pageHtml": "path",
      "responseHtml": "path",
      "sources": "path",
      "network": "path",
      "console": "path"
    }
  },
  "ingest": {
    "ok": true,
    "target": "analytics|monitoring"
  }
}
```

## Fallback Behavior

If auth/session is missing or selectors shift:

- the runner still emits structured output
- `fallbackUsed` is set
- `warnings` records the failure details
- screenshot, trace, and DOM/network evidence are still captured when possible
- explicit access blockers such as ChatGPT verification pages are marked as failed runs
- queued worker runs write their evidence back into the existing queued `promptRuns` record rather than creating a second run row

## Ingestion Behavior

If `--ingest` is provided and `VITE_CONVEX_URL` is set:

1. The runner first tries `api.analytics.ingestPromptRun` when `promptId` is present.
2. If analytics ingestion is unavailable or fails, it can fall back to `api.monitoring.ingestMonitorRun` when `monitorId` is present.

For queued prompt execution:

1. The dashboard creates one run group per prompt dispatch and one queued `promptRuns` child row per enabled provider.
2. `pnpm runner:queue` claims the oldest queued group, launches the configured browser engine locally for each provider child in parallel, and patches each original child row to `running`, then `success`, `blocked`, or `failed`.
3. Citations, warnings, screenshot/trace paths, and the final deep link are written back onto each original queued provider row so the dashboard can compare all provider responses together.

`--max-concurrent` and `worker.maxConcurrent` now cap concurrent run groups.
Provider children inside a claimed group always start in parallel. When
`"sessionMode": "stored"` and `browser.userDataDir` are configured for the
Playwright engine, the worker still enforces one concurrent group so the shared
local Chrome profile is never used by multiple groups at once.
If a run waits 5 minutes for a usable assistant response and times out/stalls,
the worker marks it failed and auto-queues one retry.

Optional hardening:

- set `PEEC_RUN_INGEST_KEY` in Convex env and local shell to require signed ingestion.
- when `--ingest` is requested, the runner exits non-zero if ingestion fails or is skipped.

## Monitoring Interpretation Notes

- A high `citationQualityScore` with low `sourceCount` often means narrow sourcing.
- A drop in `visibilityScore` with stable `responseText` length usually indicates weaker citation density.
- Treat `warnings` as operator action items, not noise.
