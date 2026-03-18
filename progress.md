# Progress

## 2026-03-17

- Reviewed current repo state and prior exploratory/UI work.
- Locked MVP direction around local-first monitoring with ChatGPT-first support.
- Preparing parallel implementation across backend/runner and frontend integration.
- Added Convex monitoring domain entities and CRUD/list functions.
- Added a local Playwright runner and verified the example monitor can execute successfully.
- Rewired the dashboard to real monitoring entities and real create/delete flows.
- Verified `npm run build`, `npx convex codegen`, and `npx tsc -p convex/tsconfig.json`.
- Verified `npm run lint` still fails on pre-existing repo issues outside the new monitoring slice.
- Reset product direction toward visibility/citation analytics and a full dashboard redesign based on the reference UI.

## 2026-03-18

- Added a dedicated cross-device continuation plan into `task_plan.md`.
- Documented cross-device constraints and portability findings in `findings.md`.
- Defined a single reproducibility gate (`pnpm check`) for handoff between devices.
- Started scoped UI/IA refactor requested on 2026-03-18:
  - planned `/prompts`, `/runs`, `/groups`, `/responses`, and `/models` removal work
  - synced planning files with active request
- Implemented dashboard navigation + page routing updates:
  - added `Runs`, `Groups`, `Responses`
  - removed `Models` from active navigation/rendering
- Reworked prompts table interactions:
  - three-dot row action menu
  - `Run` + `Add To Group` flow
  - top-5 group picks plus view-all/create-group in secondary panel
  - removed Prompt Groups and Execution Plans side cards
- Added/updated pages for requested IA:
  - runs list + run details drill-down
  - groups grid with prompt listings and add-more affordance
  - responses table with drill-down
- Verified end-to-end gates pass:
  - `pnpm.cmd format:check`
  - `pnpm.cmd typecheck`
  - `pnpm.cmd lint`
  - `pnpm.cmd test:once`
  - `pnpm.cmd test:e2e`
  - `pnpm.cmd check`
