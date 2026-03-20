# Task Plan: OpenPeec Stabilization Program

## Goal

Turn `openpeec` into a trustworthy local-first internal monitoring product for ChatGPT-first prompt monitoring, with a correct `prompt -> runs -> responses -> sources` model, reliable local execution, accurate analytics, stable frontend drill-downs, and reproducible verification.

## Success Criteria

- ChatGPT runs fail fast when the environment is not operator-ready and do not consume queue capacity on predictable auth/Cloudflare failures.
- ChatGPT connection can be established from inside the product, without asking the operator to manually run a side command.
- A run can be clearly classified as `queued`, `running`, `success`, `failed`, or `blocked`, and each state is reflected correctly in Convex and the UI.
- Source and citation analytics only derive from completed assistant answers and never from shell pages, blocker pages, or failed runs.
- Convex queries remain semantically correct under larger datasets and do not silently truncate or drift from requested filters/ranges.
- Frontend drill-downs are URL-addressable, refresh-safe, and show dedicated failure/blocker states rather than pretending failures are valid responses.
- Local dev startup is deterministic across backend, frontend, and runner, with one documented bootstrap flow.
- Verification covers queue lifecycle, analytics correctness, failed-run rendering, and artifact/evidence handling.

## Current Phase

Phase 1

## Scope

### In Scope

- Runner posture and ChatGPT-specific execution stability
- Queue lifecycle, concurrency, retry, and recovery behavior
- Convex data model/query correctness and performance
- Frontend routing, error states, and operational controls
- Tooling, docs, local dev workflow, artifact portability
- Test coverage and verification strategy

### Out of Scope

- New monitored clients beyond ChatGPT
- Hosted/remote execution infrastructure
- Multi-tenant auth/user system
- Final metric design for "visibility"
- Production secret management beyond local-first operator workflows

## Phases

### Phase 1: Lock Product Truth Model

- [ ] Define canonical entities and state model:
  - prompts
  - prompt groups
  - prompt runs
  - blocked/failed run distinctions
  - citations
  - sources
  - tracked entities
- [ ] Define which run states contribute to which analytics surfaces.
- [ ] Define what counts as a "response," "citation," and "source" for the product.
- [ ] Freeze v1 product promises so docs/UI stop overstating current capability.
- [ ] Record acceptance criteria for source extraction and run classification.
- **Status:** in_progress

### Phase 2: Stabilize ChatGPT Runner Preconditions

- [ ] Add explicit operator-readiness preflight before queue execution:
  - storage state exists
  - ChatGPT app is reachable
  - Cloudflare challenge path is reachable
  - authenticated shell is usable
- [ ] Redesign local auth/session flow around a persistent real browser context.
- [ ] Replace command-line-only session capture with an in-product guided setup flow.
- [ ] Decide the supported operating mode:
  - persistent user data dir
  - imported storage state
  - attached existing browser session
- [ ] Make missing/invalid session state a first-class blocked/preflight failure.
- [ ] Align the shipped example config with the documented deep-link strategy.
- [ ] Define artifact retention/redaction policy for local evidence.
- [ ] Define how session health is checked:
  - before queue claim
  - on manual "Test connection"
  - after blocked runs
- [ ] Model session states in-product:
  - not connected
  - connected
  - needs attention
  - expired/blocked
- **Status:** pending

### Phase 3: Harden Queue Lifecycle and Execution Semantics

- [ ] Replace global single-run blocking with explicit concurrency control:
  - configurable worker concurrency
  - per-run leasing/claim semantics
  - safe re-claim after lease expiry
- [ ] Add first-class run states and transitions:
  - queued
  - claimed/running
  - blocked
  - failed
  - success
- [ ] Make stale-run recovery periodic and lease-based, not startup-only.
- [ ] Replace ad hoc retry labels with attempt counters and bounded retry policy.
- [ ] Preserve useful latency/error metadata for all failure paths.
- [ ] Make run completion idempotent and crash-tolerant.
- **Status:** pending

### Phase 4: Correct Analytics and Data Model Semantics

- [ ] Ensure failed/blocked runs never generate or contribute citations/sources.
- [ ] Remove truncation-driven inaccuracies from range/filter queries.
- [ ] Rework prompt, source, and overview queries to use indexes and aggregation-friendly shapes.
- [ ] Make prompt analytics consistent with historical run reality:
  - historical model used
  - response preview fallback logic
  - N/A vs zero semantics
- [ ] Decide how tracked-entity attribution is historized:
  - snapshot at ingest
  - immutable attribution records
  - domain ownership conflict rules
- [ ] Add migration/cleanup plan for historical bad citations from failed runs.
- **Status:** pending

### Phase 5: Rebuild Frontend Product State and Recovery UX

- [ ] Move from local state navigation to URL routing for overview/prompts/runs/responses/groups/sources/detail pages.
- [ ] Add dedicated blocker/failed-run presentation instead of reusing response-detail UI.
- [ ] Add in-product recovery controls where supported:
  - retry
  - requeue
  - cancel/mark failed
- [ ] Replace full-page reload refresh with query invalidation/reactive refresh.
- [ ] Remove hard-coded model options and derive filters from actual data.
- [ ] Distinguish loading, empty, error, missing, and blocked states.
- [ ] Fix table accessibility and destructive-action confirmation.
- [ ] Stop exposing raw local paths/warnings directly as primary UI content.
- **Status:** pending

### Phase 6: Unify Tooling, Bootstrap, and Documentation

- [ ] Make backend, frontend, and worker agree on one Convex bootstrap contract.
- [ ] Introduce a local companion/service contract for OS-level actions the SPA cannot perform:
  - launch browser profile
  - save local ChatGPT session state
  - verify session health
  - disconnect/reset local session
- [ ] Make dev startup deterministic:
  - strict port handling
  - one source of truth for local URLs
  - predictable worker startup ordering
- [ ] Make kill/shutdown safe and cross-platform, or scope it explicitly to Windows.
- [ ] Fix artifact serving strategy for both dev and preview or mark preview unsupported.
- [ ] Rewrite root README and runner docs to match the actual product and current operating constraints.
- [ ] Document exact operator bootstrap for a new machine.
- **Status:** pending

### Phase 7: Build a Real Verification Matrix

- [ ] Add Convex tests for:
  - queue claim/recovery
  - completion semantics
  - failed/blocked run handling
  - prompt/source/overview query correctness
- [ ] Add runner tests for:
  - blocker classification
  - extraction on valid/invalid HTML
  - retry policy
  - preflight failure handling
- [ ] Add frontend tests for:
  - routed drill-downs
  - blocker/failed/success states
  - queue toasts and live status updates
  - prompt/run/response tables
- [ ] Replace smoke-only e2e with seeded/harnessed end-to-end scenarios.
- [ ] Define pre-merge verification gates and required fixtures.
- **Status:** pending

### Phase 8: Migration, Rollout, and Cleanup

- [ ] Clean historical bad data:
  - citations from failed runs
  - misleading source counts
  - stale running runs
- [ ] Define rollout order to avoid compounding regressions.
- [ ] Decide which existing uncommitted implementation work is kept, revised, or discarded before stabilization begins.
- [ ] Run full verification after each phase, not only at the end.
- [ ] Produce an operator checklist for stable daily use.
- **Status:** pending

## Recommended Execution Order

1. Phase 1 first, because the current product promises and backend semantics are not aligned.
2. Phase 2 and Phase 3 next, because runner posture and queue lifecycle are the highest operational risk.
3. Phase 4 immediately after, because frontend correctness depends on query truth.
4. Phase 5 after backend semantics are stable enough to surface honestly.
5. Phase 6 in parallel where low-risk, but finish docs/bootstrap before broader handoff.
6. Phase 7 before claiming the system is stable.
7. Phase 8 only after the new semantics are implemented and verified.

## Workstreams and Ownership

| Workstream             | Primary Focus                                      | Key Files                                                                                                                     |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Runner hardening       | auth/session, preflight, extraction, artifacts     | `runner/run-monitor.mjs`, `runner/process-queued-runs.mjs`, `runner/example.monitor.json`, `runner/example.auth-profile.json` |
| Queue/backend          | claim/recovery/retry semantics, run lifecycle      | `convex/analytics.ts`, `convex/schema.ts`                                                                                     |
| Frontend product state | routing, detail states, recovery UX                | `src/components/dashboard/*`, `src/components/layout/*`                                                                       |
| Tooling/docs           | bootstrap, dev scripts, README, preview/dev parity | `package.json`, `scripts/*`, `README.md`, `runner/README.md`, `vite.config.ts`                                                |
| Verification           | unit/integration/e2e/harness                       | `src/**/*.test.*`, `convex/**/*.test.ts`, `e2e/*`, `playwright.config.ts`, `vitest.config.mts`                                |

## Acceptance Gates Per Phase

### Gate A: Product Truth Locked

- Written contract exists for run states and analytics contribution rules.
- Docs and UI copy no longer promise behavior the system does not implement.

### Gate B: Runner Ready

- Missing session is classified before queue claim or immediately as blocked.
- A Cloudflare-blocked environment does not generate fake citations/sources.
- Supported local auth/bootstrap flow is documented and repeatable.

### Gate C: Queue Ready

- No single wedged run can stall the entire system indefinitely.
- Retries are bounded and inspectable.
- Completion is idempotent and safe under worker restart/crash.

### Gate D: Analytics Ready

- Filtered/ranged queries are semantically correct.
- Historical runs preserve correct model/entity/source meaning.
- Failed/blocked runs are excluded from source/citation analytics everywhere.

### Gate E: Frontend Ready

- Every major drill-down is URL-addressable.
- Failed/blocked runs have honest dedicated presentation.
- Recovery actions and statuses are clear to operators.

### Gate F: Verification Ready

- Backend, runner, and frontend all have meaningful automated coverage.
- E2E can reproduce the important non-happy-path states.

## Key Questions

1. Do we want to support true parallel run execution in v1, or start with small bounded concurrency while preserving deterministic artifacts?
2. What is the canonical persisted state for a ChatGPT-specific blocker: separate `blocked` status, or `failed` plus subtype?
3. Should entity/source attribution be snapshotted at ingest time or recomputed from mutable tracked-entity rules?
4. Which artifacts must remain local-only, and which should be portable in product surfaces across machines?
5. Which local bridge form should own in-product session setup:

- bundled desktop helper
- localhost daemon
- browser extension/native messaging bridge

6. How much of the dedicated browser profile should be exposed in the product:

- simple "Connect ChatGPT"
- advanced diagnostics for session/cookies/profile state

## Decisions Made

| Decision                                    | Rationale                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Plan stabilization before more feature work | The current issues are structural; adding more UI/features will compound incorrect behavior.  |
| Sequence runner/queue before UI polish      | The biggest product failures are operational truth failures, not presentation gaps.           |
| Keep this plan in project files             | The user explicitly wants continuity across sessions/devices; this plan must persist on disk. |
| Treat session onboarding as product scope   | A manual CLI capture step is acceptable for dev diagnosis, but not for the real operator UX.  |

## Errors Encountered

| Error                                                     | Attempt | Resolution                                                                           |
| --------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| Seventh review scope returned after initial consolidation | 1       | Incorporated the additional findings into the stabilization plan and findings files. |

## Notes

- Do not treat "visibility" as a stable metric until the data pipeline itself is corrected.
- Do not merge more product-facing features until Phases 1-4 are materially complete.
- Re-read this plan before implementation decisions; the main failure mode in this repo has been acting before semantics were stable.
- The browser app cannot write `chatgpt.storage-state.json` by itself; in-product setup requires a local companion process or equivalent bridge.
- Session validity should be treated as health-checked, not time-based. Do not build product logic around a fixed ChatGPT session TTL.
