# Findings

## Product Direction

- The target is not a generic monitor console. It is an internal analytics product for response visibility and citation quality.
- The reference UI should drive shell, hierarchy, density, and interaction patterns.
- ChatGPT web is the only real execution surface needed for the initial vertical slice.

## Current Repo Constraints

- Frontend is React + Vite + Tailwind + shadcn-style UI primitives.
- Backend is Convex with auth and cron support.
- Existing backend tables are `jobs` and `weblogs`.
- Existing UI was reframed toward monitoring language, but not redesigned around the new product semantics.

## Technical Direction

- Playwright is the better default runner for monitoring because it is deterministic.
- The frontend should reflect:
  - prompt groups
  - prompts
  - prompt runs
  - citations
  - sources
  - tracked entities
- Local-only means credentials should stay on disk or in local environment, with Convex storing references and metadata only.
- A hybrid product shape is best:
  - top half analytics: visibility, citation quality, source coverage, comparison tables
  - lower-level operational confidence: run freshness, failures, parsing confidence

## Cross-Device Findings (2026-03-18)

- Code state is portable through git; browser auth state is not reliably portable and must be captured per machine.
- `pnpm` must remain the only package manager to avoid lockfile/toolchain drift.
- The minimum reproducibility gate across devices is `pnpm check`.
- Runner evidence under `runner/artifacts/` is useful for local diagnosis but should not be used as the source of truth for analytics.
- The source of truth for analytics continuity is Convex data (`promptRuns`, `citations`, prompt metadata), not local screenshots/videos.

## UI Refactor Findings (2026-03-18)

- Current dashboard page model is still keyed by `overview`, `prompts`, `sources`, `models`; requested IA needs `runs`, `groups`, `responses` and no `models`.
- Prompt list currently uses inline action buttons and includes right-side cards (`Prompt Groups`, `Execution Plans`) that conflict with the new simplified list workflow.
- Convex already exposes core read queries needed for new pages (`listPromptRuns`, `getPromptRun`, `listPromptGroups`, `listPrompts`), so this pass is mostly frontend composition and routing.
- Implemented IA now uses `overview`, `prompts`, `runs`, `groups`, `responses`, `sources` with shared run-detail drill-down and no `models` tab.
- Prompt actions now use a single three-dot control with `Run` and `Add To Group`; group assignment supports top-5 quick picks, `View all`, and inline `Create new group`.
