# Testing Strategy

## Objective

OpenPeec has four failure-prone layers that must be validated together:

1. Convex data semantics
2. Queue and runner orchestration
3. Dashboard state and operator UX
4. End-to-end shell behavior in the browser

The testing strategy is designed to keep local-first development fast while still catching the product failures that matter most:

- bad runs polluting analytics
- queue stalls and stale `running` jobs
- blocked ChatGPT sessions being treated as valid responses
- UI drill-down state being lost on refresh/back navigation
- evidence and retry/cancel flows breaking at the operator surface

## Test Pyramid

### 1. Static and structural gates

These run on every meaningful change:

- `pnpm format:check`
- `pnpm typecheck`
- `pnpm lint`

Purpose:

- catch schema/query mismatches early
- catch frontend prop drift as Convex payloads evolve
- keep worker scripts and dashboard code mechanically consistent

### 2. Focused unit tests

These validate deterministic behavior without a live browser or live Convex backend.

Current priority coverage:

- queue retry policy
- blocked-run classification
- dashboard state transitions
- response detail rendering for successful and blocked runs

Required additions over time:

- `runner/process-queued-runs.mjs`
  - retries only on recoverable failures
  - respects max attempts
  - does not retry blocked/session failures
  - preserves retry labels/attempt sequencing
- `runner/run-monitor.mjs`
  - preflight blocks when session material is missing
  - citation extraction only uses explicit assistant containers
  - blocker pages produce zero citations
- `src/components/dashboard/MonitoringDashboard.tsx`
  - URL state is restored from query params
  - popstate restores page, prompt, run, and filters
  - queue toasts distinguish success, failure, and blocked runs
- `src/components/dashboard/ResponseDetailPage.tsx`
  - blocked/failed runs show operational summaries, not response summaries
  - retry/cancel actions render only in valid states

### 3. Convex function tests

These should use `convex-test` against the analytics layer, not ad hoc mocks.

Core scenarios:

- `completePromptRun`
  - success persists citations and mention snapshots
  - failed/blocked clears citations and mentions
  - failed/blocked leaves `sourceCount` undefined
- `listPromptRuns`
  - filters by model, prompt, and status using indexed paths
  - success rows expose source metrics
  - blocked/failed rows do not expose source metrics
- `getPromptAnalysis`
  - only success runs contribute to sources and citation breakdowns
  - response drift still reflects completed runs
  - snapshot mentions survive tracked-entity edits
- `listSources`
  - ignores failed/blocked runs
  - uses citation snapshots, not current mutable entity state
- `claimNextQueuedPromptRun`
  - honors `maxConcurrent`
  - marks prompt-deleted runs failed
- `recoverStaleRunningPromptRuns`
  - only recovers old running runs
  - leaves queued/success/failed/blocked untouched
- `retryPromptRun`
  - increments attempts
  - preserves retry lineage
- `cancelPromptRun`
  - only affects queued/running runs

### 4. Browser-level e2e tests

Playwright e2e should cover the app shell and critical operator paths, but remain independent of live ChatGPT.

Required e2e coverage:

- dashboard shell loads
- sidebar navigation works
- prompts -> prompt detail -> response detail drilldown works
- URL state survives reload for:
  - prompts detail
  - run detail
  - filters
- blocked run detail renders correct message and retry action
- runs page shows queued/running/success/blocked/failed status labels

These tests should use stable seeded/mocked frontend data, not real queue execution.

### 5. Runner smoke tests

These are not CI-fast tests. They are operator-run validation checks for local environments.

Manual smoke paths:

1. Capture a real ChatGPT session with `pnpm runner:capture-session`
2. Run a single prompt with `pnpm runner:queue:once`
3. Confirm:
   - run transitions `queued -> running -> success`
   - citations are recorded only on success
   - artifact links open
4. Remove or break the storage-state file
5. Run the worker again and confirm:
   - worker preflight warns and does not consume queued jobs
   - no bogus citations are created

These manual checks validate the parts that automated tests cannot reliably simulate without a real authenticated browser environment.

## Fixtures and Test Data

Use a small, explicit dataset in tests:

- 2 prompt groups
- 3 prompts
- 5 runs:
  - 2 success
  - 1 failed
  - 1 blocked
  - 1 running
- citations only attached to success runs
- at least 2 tracked entities with aliases and owned domains
- 1 mention snapshot with no `trackedEntityId` to prove historical resilience

This fixture shape catches most of the regressions introduced by the analytics model.

## Release Gate

Before shipping a stabilization batch, all of the following must pass:

1. `pnpm format:check`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test:once`
5. `pnpm test:e2e`

Additionally, for runner-affecting changes:

6. `pnpm exec convex codegen`
7. One manual `pnpm runner:queue:once` smoke run with a valid session
8. One manual blocked-session smoke run with the session removed or invalidated

## Failure Triage Order

When the suite fails, debug in this order:

1. formatting/type errors
2. Convex function tests
3. dashboard unit tests
4. e2e shell tests
5. manual runner smoke tests

This order minimizes wasted time because each later layer depends on the earlier layer being trustworthy.

## Stability Principles

- Never let failed or blocked runs contaminate citation analytics.
- Never treat missing session material as a valid run attempt.
- Never ship UI states that imply a run produced analyzable output when it did not.
- Prefer snapshot-based historical analytics over recomputing from mutable entity config.
- Keep browser e2e deterministic; keep live-ChatGPT validation manual and explicit.
