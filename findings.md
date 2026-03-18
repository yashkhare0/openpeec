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
