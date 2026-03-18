# Local Monitoring Runner (Playwright)

Use this runner to execute internal monitoring prompts against ChatGPT Web and capture response visibility and citation quality signals per run.

This is an operator tool for recurring checks, not a generic browser automation script. Every run should answer:

- Did ChatGPT return a usable response for this monitoring prompt?
- Which sources were cited, and where did they appear?
- Did citation quality or visibility degrade versus expected behavior?

## Commands

- `pnpm runner:install-browsers`
- `pnpm runner:capture-session`
- `pnpm runner:monitor -- --config runner/example.monitor.json`
- `pnpm runner:monitor -- --config runner/example.monitor.json --output runner/last-run.json --ingest`
- `pnpm runner:prompt:example`
- `pnpm runner:queue`
- `pnpm runner:queue:once`

## Operator Workflow

1. Install browsers once with `pnpm runner:install-browsers`.
2. Capture a real ChatGPT session with `pnpm runner:capture-session`. This opens a headed Edge session and saves storage state to `runner/chatgpt.storage-state.json`.
3. Keep `runner/example.auth-profile.json` pointed at that file, or replace it with your own local path.
4. Run a monitoring check with `pnpm runner:prompt:example`, or queue prompts from the dashboard and process them with `pnpm runner:queue` or `pnpm runner:queue:once`.
5. Review `runner/last-run.json` and the evidence bundle in `runner/artifacts/<run-label>-<timestamp>/`.
6. Inspect:
   `status`, `warnings`, `responseText`, `citations`, `visibilityScore`, `citationQualityScore`, `network.json`, `console.json`, `page.html`, `response.html`, `trace.zip`, and the recorded video.
7. If you need ingestion, run with `--ingest` and set `VITE_CONVEX_URL`.

`pnpm dev` now starts the queue worker automatically (`dev:runner`) so queued
prompt jobs are picked up without manual worker startup.
Queue runs use headless Playwright by default and still capture screenshots,
video, trace, DOM, and source artifacts.

## Prompt-Oriented Config Contract

`runner/example.monitor.json`:

```json
{
  "monitorId": "optional-monitor-id-for-legacy-ingest",
  "promptId": "optional-prompt-id-for-analytics-ingest",
  "runLabel": "chatgpt-citation-visibility-smoke",
  "client": "chatgpt",
  "platform": "web",
  "model": "chatgpt-web",
  "browser": {
    "channel": "msedge",
    "headless": false
  },
  "navigation": {
    "url": "https://chatgpt.com/",
    "promptQueryParam": "q",
    "waitUntil": "domcontentloaded",
    "timeoutMs": 30000
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
  "authProfile": {
    "authType": "file|env|manual",
    "localRef": "runner/example.auth-profile.json"
  },
  "assertions": {
    "urlIncludes": "chatgpt.com",
    "titleIncludes": "optional title substring",
    "waitForSelector": "optional selector"
  },
  "timing": {
    "responseTimeoutMs": 45000,
    "settleDelayMs": 1500
  },
  "ingest": {
    "target": "auto|analytics|monitoring"
  }
}
```

`authProfile.localRef` is a local-only metadata pointer. Secrets stay local.
The default example profile expects `runner/chatgpt.storage-state.json`, which you create with `pnpm runner:capture-session`.
The live ChatGPT page uses a visible `#prompt-textarea` contenteditable and a hidden fallback `textarea`; keep the contenteditable first in your selector order.
The runner supports ChatGPT's optional `?q=` deep link through `navigation.promptQueryParam`. In local queue processing this is the preferred path because it creates the user turn directly in a new thread. If the assistant never resolves past the `request-placeholder` node, the run should be treated as failed because there is no completed answer or citation set to analyze.
The live ChatGPT response stream also renders temporary `request-placeholder` assistant nodes; exclude those from extraction or you will scrape an empty streaming shell instead of the completed answer.
If selectors fail, session is missing, or ChatGPT markup shifts, the run still returns structured output with warnings.

## Result Contract

The runner emits JSON:

```json
{
  "schemaVersion": 2,
  "monitorId": "string-or-null",
  "promptId": "string-or-null",
  "runLabel": "string",
  "client": "chatgpt",
  "platform": "web|desktop|ios|android",
  "model": "string",
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

1. The dashboard creates `promptRuns` with `status: "queued"`.
2. `pnpm runner:queue` claims the next queued run, launches Playwright locally, and patches that same record to `running`, then `success` or `failed`.
3. Citations, warnings, screenshot/video/trace paths, and the final deep link are written back onto the original queued run so the dashboard can inspect the evidence.

Queue execution is strictly sequential. Only one run can be in `running` state
at a time; the next queued run starts after the previous run is completed.
If a run waits 5 minutes for a usable assistant response and times out/stalls,
the worker marks it failed and auto-queues one retry.

Optional hardening:

- set `PEEC_RUN_INGEST_KEY` in Convex env and local shell to require signed ingestion.
- when `--ingest` is requested, the runner exits non-zero if ingestion fails or is skipped.

## Monitoring Interpretation Notes

- A high `citationQualityScore` with low `sourceCount` often means narrow sourcing.
- A drop in `visibilityScore` with stable `responseText` length usually indicates weaker citation density.
- Treat `warnings` as operator action items, not noise.
