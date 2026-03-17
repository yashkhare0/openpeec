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

## Decisions
- Use Playwright-style deterministic automation over `browser-use`.
- Use the reference UI as a structural and visual direction, not a literal product clone.
- Treat auth profiles and deep-link/runtime settings as implementation details, not the main product story.
- Make `response visibility / citation quality` the top-level north star instead of generic runner uptime.

## Errors Encountered
- `npm install` failed because this repo is actually `pnpm`-managed and contains `link:` dependencies that npm 11 would not reify.
- Initial runner implementation hard-pinned `npx playwright@1.53.1` internally and failed against the installed browser payload; fixed by switching to the direct Playwright API.
