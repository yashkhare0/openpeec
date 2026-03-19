# Findings & Decisions

## Requirements

- Produce a detailed and thorough plan to fix all issues previously reported in the seven-scope audit.
- Keep the plan persistent on disk so work can continue on another device or in another session.
- Do not jump straight back into feature work; sequence the fixes in a way that stabilizes product truth first.
- Cover all major areas:
  - ChatGPT runner posture
  - queue lifecycle
  - Convex data/query correctness
  - frontend routing and error UX
  - tooling/bootstrap/docs
  - testing and verification

## Research Findings

- The highest-risk problem is runner posture against ChatGPT. The current implementation launches fresh headless browser contexts too easily, while the environment is already known to hit Cloudflare/Turnstile before the ChatGPT app becomes usable.
- Queue behavior is currently fragile by design. A single `running` run can block the full system, and stale-run recovery is not strong enough to make that safe.
- The analytics layer is not only slow at scale; several queries are semantically wrong once run volume grows because they rely on fixed recent caps and in-memory filtering.
- The current frontend still behaves like a prototype shell in important places:
  - local state instead of routed drill-downs
  - hard refresh instead of proper reactive refresh
  - blocked runs rendered like normal response detail
  - no operator recovery actions for broken runs
- Tooling and docs are drifted:
  - root README is still for a different product
  - runner docs and shipped config disagree on deep-link/headless defaults
  - backend/frontend/worker do not share one clean bootstrap contract
- Test coverage is insufficient for the actual failure modes being seen in practice. Current verification proves the shell loads, not that the monitoring system is correct.

## Issue Inventory by Workstream

### Runner / ChatGPT

- Missing storage state is treated as a warning instead of a preflight blocker.
- Fresh headless contexts are too likely to trigger Cloudflare verification.
- Prompt submission and response detection rely on brittle selectors.
- Blocker detection is string-based and narrow.
- Citation extraction can scrape shell/blocker links instead of true sources.
- Artifact order can preserve misleading evidence even after blocked-run classification.
- Full artifacts are captured without a defined retention/redaction policy.

### Queue / Lifecycle

- Queue execution is globally serialized.
- Stale-run recovery is worker-dependent and startup-only in practice.
- Response timeout floor is too long for broken runs.
- Retry policy is ad hoc and not modeled explicitly.
- Completion is not idempotent enough under crash/restart conditions.

### Convex / Data Model / Analytics

- Queries rely on fixed recent caps that silently distort range-based analytics.
- `listPromptRuns` can return incomplete history after filtering.
- Prompt-level analytics mix incompatible semantics between latest run state and success-only aggregates.
- Failed runs are sometimes represented as zero-source rather than not-applicable.
- Historical model attribution can drift after prompt config changes.
- Tracked-entity attribution is mutable and can rewrite history.
- Overlapping domain ownership rules are ambiguous.

### Frontend / Product UX

- No real routing for analytics drill-downs.
- Refresh reloads the app rather than invalidating state.
- Blocked/failed runs are not visually or semantically separated enough from successful responses.
- Run surfaces are read-only despite known failure/recovery needs.
- Some interactive tables lack proper semantics/accessibility.
- Error, missing, and empty states are conflated.
- Local filesystem artifact paths leak into the UI.

### Tooling / Docs / Local Ops

- Backend, frontend, and worker disagree on Convex startup assumptions.
- Port handling is inconsistent across Vite, Playwright, and kill scripts.
- Kill tooling is Windows-only and can target unrelated processes.
- Artifact serving differs between `dev` and `preview`.
- Repo docs do not match the shipped product and configs.

### Testing / Verification

- Queue lifecycle lacks meaningful automated coverage.
- Convex query correctness is largely untested.
- Runner behavior around blockers/extraction/preflight is not properly tested.
- E2E is only a shell smoke test, not a monitoring-system test.
- Critical detail pages are effectively mocked out in unit tests.

## Technical Decisions

| Decision                                                                            | Rationale                                                                                                   |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Treat blocked/preflight failures as first-class product states                      | ChatGPT/Cloudflare failures are common enough that "failed" is too coarse and too misleading.               |
| Stabilize semantics before rebuilding metrics                                       | A metric layer on top of incorrect source/run truth will not be trusted.                                    |
| Prefer persistent authenticated local browser context over fresh headless bootstrap | This matches the local-first requirement and is the most realistic path to stable ChatGPT execution.        |
| Move to routed drill-downs before more dashboard expansion                          | Analytics products need durable URLs and refresh-safe navigation.                                           |
| Define analytics contribution rules explicitly                                      | The product promise depends on knowing exactly which run states feed sources, citations, and summary views. |

## Issues Encountered

| Issue                                                         | Resolution                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Existing planning files reflected an earlier build-first mode | Replaced them with a stabilization-first plan based on the seven-scope audit. |
| Seventh reviewer returned after initial audit consolidation   | Folded those additional findings into this plan and issue inventory.          |

## Resources

- Audit-critical backend files:
  - [analytics.ts](/b:/projects/opensource/openpeec/convex/analytics.ts)
  - [schema.ts](/b:/projects/opensource/openpeec/convex/schema.ts)
- Audit-critical runner files:
  - [run-monitor.mjs](/b:/projects/opensource/openpeec/runner/run-monitor.mjs)
  - [process-queued-runs.mjs](/b:/projects/opensource/openpeec/runner/process-queued-runs.mjs)
  - [example.monitor.json](/b:/projects/opensource/openpeec/runner/example.monitor.json)
  - [example.auth-profile.json](/b:/projects/opensource/openpeec/runner/example.auth-profile.json)
- Audit-critical frontend files:
  - [MonitoringDashboard.tsx](/b:/projects/opensource/openpeec/src/components/dashboard/MonitoringDashboard.tsx)
  - [ResponseDetailPage.tsx](/b:/projects/opensource/openpeec/src/components/dashboard/ResponseDetailPage.tsx)
  - [PromptsPage.tsx](/b:/projects/opensource/openpeec/src/components/dashboard/PromptsPage.tsx)
  - [RunsPage.tsx](/b:/projects/opensource/openpeec/src/components/dashboard/RunsPage.tsx)
  - [ResponsesPage.tsx](/b:/projects/opensource/openpeec/src/components/dashboard/ResponsesPage.tsx)
- Tooling/docs:
  - [package.json](/b:/projects/opensource/openpeec/package.json)
  - [dev-backend.mjs](/b:/projects/opensource/openpeec/scripts/dev-backend.mjs)
  - [kill-dev.mjs](/b:/projects/opensource/openpeec/scripts/kill-dev.mjs)
  - [vite.config.ts](/b:/projects/opensource/openpeec/vite.config.ts)
  - [README.md](/b:/projects/opensource/openpeec/README.md)
  - [runner/README.md](/b:/projects/opensource/openpeec/runner/README.md)

## Visual/Browser Findings

- Saved local artifacts already show a real Cloudflare/Turnstile blocker page, not a hypothetical risk.
- The current product UI can present blocker-page text and blocker-page links in a response-style frame, which undermines operator trust immediately.
- Evidence links are currently machine-local. They are useful for a single operator on one machine, but they are not yet a portable product primitive.
- The user’s product intent is now clear: trustworthy local monitoring with strong source analytics matters more than dashboard breadth.

## Recommended First Implementation Slice

1. Lock the run-state and analytics-contribution contract.
2. Add runner preflight and explicit blocked state.
3. Harden queue lease/recovery and idempotent completion.
4. Correct source/citation extraction and failed-run semantics.
5. Only then rebuild routed frontend failure/detail surfaces around the corrected backend truth.

---

_These findings are meant to guide implementation order, not just describe defects._
