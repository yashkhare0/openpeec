# AGENTS.md — OpenPeec

This file provides persistent context for AI agents working on this project. It captures design decisions, conventions, and principles that should guide all future work.

---

## Design Context

### Users

**Primary user**: SEO and Content Marketers who track how their brand, products, and content appear in AI-generated search results (ChatGPT, Perplexity, Gemini, etc.).

**Context of use**: They open OpenPeec throughout their workday to check brand visibility scores, review citation quality, monitor prompt performance across AI models, and identify emerging issues. They need to quickly scan dashboards, drill into specific data points, and export findings for stakeholders. They are not deeply technical but are data-literate and comfortable with analytics tools.

**Job to be done**: "Help me understand and improve how my brand appears when people ask AI assistants about topics in my space."

### Brand Personality

**Three words**: Professional, Precise, Trustworthy

**Voice & tone**: Confident but not arrogant. Data speaks for itself — the UI should present information clearly without editorializing. Error states and empty states should be helpful and constructive, never alarming. Labels and copy should be concise and specific.

**Emotional goals** (all four apply, in priority order):

1. **Confidence & Control** — "I know exactly what's happening with my brand visibility"
2. **Calm & Clarity** — "Complex data made simple and easy to understand"
3. **Urgency & Action** — "I can spot issues fast and act on them immediately"
4. **Delight & Discovery** — "I enjoy exploring insights and finding new patterns"

### Aesthetic Direction

**Visual tone**: Clean, modern, data-forward. Inspired by Linear.app (speed, polish, keyboard-first feel) and Notion (spacious, content-first, calm). The interface should feel like a precision instrument — every element earns its place.

**Anti-references** — OpenPeec should NOT look like:

- Cluttered enterprise software (no dense menus, tiny text, overwhelming grids)
- Playful/consumer apps (no rounded bubbles, bright gradients, emoji-heavy UI)
- Bare/brutalist designs (should not feel unpolished or raw)
- Marketing/landing page style (functional tool, not a sales pitch)

**Theme**: Both light and dark mode supported. Dark mode is class-based (`.dark` on `<html>`), toggled via a dropdown in the sidebar. System preference is the default.

**Color palette**: Neutral gray foundation using oklch color space. Semantic colors for status: emerald (success), red/rose (error), amber (warning), blue (info/running). Chart colors use a blue gradient palette (chart-1 through chart-5). No brand accent color beyond the neutral primary — the data and status colors provide all the visual interest.

### Design Principles

1. **Data first, chrome second** — Every pixel of UI chrome must justify itself. Tables, charts, and KPI cards are the primary content. Navigation, toolbars, and controls should recede until needed.

2. **Scannable at a glance, deep on demand** — Dashboard views should communicate status in under 3 seconds. Detail views (drawers, drill-downs) provide depth without leaving context. Use progressive disclosure.

3. **Consistent density, comfortable spacing** — Medium density throughout. `gap-4` (16px) as the standard spacing unit. `px-4 lg:px-6` for page margins. Compact controls (`h-8` selects, `h-7` small buttons) but never cramped. Tables are the densest element — everything else breathes.

4. **Predictable patterns** — Every page follows the same shell: sidebar + header + content area. Cards group related content. Tables display collections. Badges indicate status. Users should never wonder "how does this page work?"

5. **Accessible by default** — WCAG 2.1 AA compliance. Sufficient color contrast in both themes. Keyboard navigable. Screen reader friendly. Never rely on color alone to convey meaning — always pair with text or icons.

---

## Technical Conventions

### Stack

| Layer           | Technology                                                       |
| --------------- | ---------------------------------------------------------------- |
| Runtime         | React 18 (SPA, no SSR)                                           |
| Bundler         | Vite 6 + `@tailwindcss/vite`                                     |
| Styling         | Tailwind CSS v4 (CSS-based config, oklch tokens)                 |
| Components      | shadcn/ui (radix-nova style, Radix primitives)                   |
| Icons           | Lucide React                                                     |
| Charts          | Recharts                                                         |
| Data tables     | TanStack React Table                                             |
| Drag-and-drop   | dnd-kit                                                          |
| Backend         | Convex (real-time DB, serverless functions)                      |
| Auth            | `@convex-dev/auth` (GitHub, Google OAuth + email OTP via Resend) |
| Font            | Geist Variable (`@fontsource-variable/geist`)                    |
| Validation      | Zod                                                              |
| Utility         | `cn()` helper via clsx + tailwind-merge                          |
| Package manager | pnpm                                                             |
| Dev server port | 5999                                                             |

### File Structure

```
src/
  App.tsx                    # Root component (ThemeProvider > TooltipProvider > Dashboard)
  main.tsx                   # Entry point (ConvexAuthProvider wrapping App)
  index.css                  # Global CSS: Tailwind v4 config, oklch tokens, base styles
  lib/utils.ts               # cn() utility
  hooks/                     # Custom hooks (use-mobile, use-toast)
  auth/                      # Auth flow components (OAuth, email OTP)
  components/
    ui/                      # shadcn/ui primitives (button, card, table, sidebar, etc.)
    layout/                  # App shell (AppSidebar, SiteHeader)
    dashboard/               # Page-level components (OverviewPage, ModelsPage, etc.)
      components/            # Shared dashboard sub-components (KpiCards, TrendChart, etc.)
convex/                      # Backend: schema, functions, auth config
public/                      # Static assets (cronvex.svg logo, thumbnail.png)
```

### Import Aliases

The `@` alias resolves to `./src`. Configured in both `tsconfig.json` (`paths`) and `vite.config.ts` (`resolve.alias`).

| Alias               | Path              | Usage                                                         |
| ------------------- | ----------------- | ------------------------------------------------------------- |
| `@/components/ui/*` | shadcn primitives | `import { Button } from "@/components/ui/button"`             |
| `@/components/*`    | App components    | `import { SiteHeader } from "@/components/layout/SiteHeader"` |
| `@/lib/utils`       | cn() utility      | `import { cn } from "@/lib/utils"`                            |
| `@/hooks/*`         | Custom hooks      | `import { useIsMobile } from "@/hooks/use-mobile"`            |

**Known CLI issue**: The shadcn CLI (with `radix-nova` style) generates imports using `@/components/lib/utils` and `@/components/hooks/use-mobile` instead of `@/lib/utils` and `@/hooks/use-mobile`. After running `npx shadcn add`, always check and fix these import paths.

### Spacing Scale (Tailwind defaults, commonly used)

| Token   | Value | Usage                               |
| ------- | ----- | ----------------------------------- |
| `gap-1` | 4px   | Inline button groups                |
| `gap-2` | 8px   | Small element spacing, icon + text  |
| `gap-4` | 16px  | Standard grid/card gap, form fields |
| `gap-6` | 24px  | Page section spacing (md+)          |
| `px-4`  | 16px  | Page horizontal padding (mobile)    |
| `px-6`  | 24px  | Page horizontal padding (lg+)       |
| `py-4`  | 16px  | Page vertical padding (mobile)      |
| `py-6`  | 24px  | Page vertical padding (md+)         |
| `p-4`   | 16px  | Card content padding                |
| `h-7`   | 28px  | Small buttons                       |
| `h-8`   | 32px  | Compact select/input controls       |
| `h-14`  | 56px  | Site header height                  |

### Component Patterns

- **Page layout**: `<div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">` with `px-4 lg:px-6` on content sections
- **Card grids**: CSS Grid with responsive columns (`xl:grid-cols-[1.4fr_1fr]`, etc.) and `gap-4`
- **KPI cards**: 4-column grid, uppercase `text-xs tracking-wider` label, `text-2xl font-semibold tabular-nums` value, delta badge
- **Status badges**: `rounded-full px-2 py-0.5 text-xs` with semantic bg/text colors
- **Empty states**: Centered card with icon circle (`size-12 rounded-full bg-muted`), heading, description, CTA button
- **Tables**: TanStack Table wrapper with filter input, column visibility dropdown, pagination
- **Charts**: Recharts in shadcn `ChartContainer`, `aspect-auto h-[250px]`, blue palette
- **Drawers**: Right-side on desktop, bottom sheet on mobile (via `useIsMobile` hook)

### Color Tokens (key values)

Light mode primary colors are achromatic (pure black/white/gray). Dark mode inverts. Status semantics:

- **Success**: `emerald-500/10` bg, `emerald-700` text (light), `emerald-300` text (dark)
- **Error**: `rose-500/10` bg, `rose-700` text (light), `rose-300` text (dark)
- **Warning**: `amber-50` bg, `amber-700` text (light), `amber-950` bg, `amber-300` text (dark)
- **Info**: `blue-500/10` bg, `blue-700` text (light), `blue-300` text (dark)
- **Destructive actions**: `text-destructive` or `variant="destructive"` on buttons
