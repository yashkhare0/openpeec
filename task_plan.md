# Task Plan

## Goal

Turn `openpeec` into a local-first internal monitoring product focused on:

- response visibility trends
- citation quality
- source/domain coverage
- prompt and model comparisons
- deterministic local execution against ChatGPT-first web flows

## MVP Scope

1. Keep the existing React + Convex app.
2. Recenter the domain around:
   - prompt groups
   - prompts
   - tracked entities
   - prompt runs
   - citations
   - sources
3. Keep Convex as the control plane and persistence layer for this pass.
4. Keep ChatGPT web as the only real monitored client in v0.
5. Keep auth material local in files or env-driven local config references.
6. Replace the current dashboard with a reference-driven analytics shell.

## Out Of Scope

- Multi-client execution parity beyond placeholders
- Hosted execution infrastructure
- Agentic browser navigation by default
- Production-grade encrypted secret vault
- Full competitive SEO product semantics

## Phases

- [in_progress] Rewrite plan and information architecture around visibility/citation analytics
- [pending] Rewrite backend/domain model for prompts, runs, citations, sources, and metrics
- [pending] Enhance local runner to capture responses and source/citation data
- [pending] Redesign the dashboard shell and analytics pages based on the reference UI
- [pending] Verify build/test/lint and summarize remaining gaps

## Cross-Device Continuation Plan (2026-03-18)

- [in_progress] Standardize machine bootstrap and verification
- [pending] Standardize browser/session state capture per machine
- [pending] Standardize evidence artifact and run handoff workflow
- [pending] Standardize daily sync workflow (branch/commit/test gates)
- [pending] Add CI parity so device drift is caught automatically

### Phase Details

1. Machine bootstrap

- Use the same Node and pnpm versions on every device.
- Run `pnpm install --frozen-lockfile`.
- Run `pnpm exec convex codegen` before first local run.
- Verify baseline with `pnpm check`.

2. Browser/session capture

- Do not share committed auth state files between devices.
- On each machine, run `pnpm runner:capture-session`.
- Save resulting state in local-only files (ignored by git).
- Validate with one real prompt execution via `pnpm runner:prompt:example`.

3. Evidence/run handoff

- Treat `runner/artifacts/*` as local evidence, not shared source code.
- Persist canonical analytics data through Convex tables (`promptRuns`, `citations`).
- For cross-device debugging, share only run IDs and exported JSON summaries.

4. Daily sync workflow

- Start from latest mainline branch state.
- Run `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test:once`, `pnpm test:e2e`.
- Commit only after all checks pass on the active device.

5. CI parity

- Mirror local `pnpm check` in CI.
- Block merges on lint/type/test failures to avoid machine-specific regressions.

## Decisions

- Use Playwright-style deterministic automation over `browser-use`.
- Use the reference UI as a structural and visual direction, not a literal product clone.
- Treat auth profiles and deep-link/runtime settings as implementation details, not the main product story.
- Make `response visibility / citation quality` the top-level north star instead of generic runner uptime.

## Errors Encountered

- `npm install` failed because this repo is actually `pnpm`-managed and contains `link:` dependencies that npm 11 would not reify.
- Initial runner implementation hard-pinned `npx playwright@1.53.1` internally and failed against the installed browser payload; fixed by switching to the direct Playwright API.
