# Codex Refactor Brief

You are refactoring the Iris codebase. Read AGENTS.md first — it explains the full architecture. This document tells you what's wrong and what to do about it.

## Do NOT merge Hermes into this repo

Hermes lives at `/tmp/hermes-agent` (cloned from `github.com/nousresearch/hermes-agent`). It's an upstream open source project that gets updated independently. The bridge (`bridge/server.py` + `bridge/hermes_adapter.py`) is the boundary layer. Keep it that way. If you need to change how Iris talks to Hermes, change the bridge — never import from Hermes directly in frontend code.

## What's wrong

### 1. `use-hermes-bridge.ts` is a 1226-line god hook
It manages WebSocket connection, message streaming, session state, tool tracking, activities, config, permissions, agents, jobs, push notifications, and app lifecycle — all in one `useCallback` with a 24-case switch statement and 39 return values.

**What to do:** Split into composable hooks following the pattern already established in `use-bridge-jobs.ts`:

| New hook | Owns | Lines (~) |
|----------|------|-----------|
| `use-bridge-connection.ts` | wsRef, connectionState, reconnect, sendAction, focus/blur, push notifications | 150 |
| `use-bridge-messages.ts` | messages, isProcessing, streamingMsgRef, send/cancel, all message.*/response.*/tool.*/reasoning.* events | 300 |
| `use-bridge-sessions.ts` | sessionsList, activeSessionId, activities, unreadSessions, resume/delete/new, session.*/hermes.message events | 200 |
| `use-bridge-config.ts` | model, provider, agentName, memoryData, configData, toolsetsData, skillsData, permissionsData, agentsData, all get_*/set_* actions | 150 |
| `use-bridge-jobs.ts` | Already done. Jobs CRUD + events. | 57 |

The orchestrator (`use-hermes-bridge.ts`) composes them all and chains event dispatch:
```ts
const handleEvent = (e) => {
  if (messages.handleEvent(e)) return
  if (sessions.handleEvent(e)) return
  if (config.handleEvent(e)) return
  if (jobs.handleEvent(e)) return
}
```

**Critical constraint:** Each sub-hook's `handleEvent` must be a stable ref (useCallback with [] deps, using refs internally) to avoid WebSocket reconnection loops. The return interface of `useHermesBridge` must not change — no breaking changes for page.tsx.

### 2. `settings-panel.tsx` is 1566 lines
Five tab components crammed into one file with inconsistent styling (mix of hardcoded rgba and CSS variables).

**What to do:** Extract each tab to its own file:
- `components/panels/settings/settings-tab.tsx`
- `components/panels/settings/memory-tab.tsx`
- `components/panels/settings/tools-tab.tsx`
- `components/panels/settings/permissions-tab.tsx`
- `components/panels/settings/tasks-tab.tsx`
- `components/panels/settings-panel.tsx` (shell: modal + tab bar + imports)

### 3. `message-entry.tsx` is 1112 lines
Actually well-structured internally (good sub-components). But the `markdownComponents` object (171 lines) and image detection utilities should be extracted:
- `lib/markdown-components.tsx` — the ReactMarkdown component overrides
- `lib/image-utils.ts` — `IMAGE_EXT_RE`, `looksLikeImagePath`, `findImageInArgs`

### 4. `page.tsx` still has 532 lines
The JSX layout is doing too much. Extract:
- `components/chat/empty-state.tsx` — the no-messages placeholder (lines 310-350)
- The mobile agent panel drawer (lines 455-485) could be a `components/panels/mobile-drawer.tsx`

### 5. Remaining inline rgba values
We converted ~105 of ~109 hardcoded `rgba(255,255,255,...)` values to CSS variables. A few remain in:
- `pantheon-panel.tsx` — 1 in the popout composer background
- `composer.tsx` — 1 in the remove-attachment button
- Box shadows (intentionally kept as `rgba(0,0,0,...)`)

Also sweep `settings-panel.tsx` — it was the last file and still has hardcoded values in the tab components we didn't touch.

### 6. `bridge/server.py` is 1279 lines
The WebSocket handler is one massive function. Extract:
- `bridge/handlers/messages.py` — send_message, cancel_response
- `bridge/handlers/sessions.py` — session CRUD, resume, divider
- `bridge/handlers/config.py` — config, memory, skills, toolsets, permissions
- `bridge/handlers/jobs.py` — job CRUD
- `bridge/handlers/agents.py` — get_agents
- `bridge/server.py` — FastAPI app, WebSocket endpoint, emit function, startup

### 7. No tests
Zero. The bridge, the hooks, the components — all untested. At minimum:
- Bridge: test WebSocket message round-trip (connect → send → receive events)
- Hooks: test event handlers produce correct state transitions
- Components: snapshot tests for the panels

## CSS variable system

All themeable colors are defined in `globals.css` on `:root` (dark) and `:root[data-theme="light"]` (light). Use `var(--color-*)` everywhere. Never write `rgba(255,255,255,...)` — there's a variable for every opacity level:

| Variable | Dark value | Purpose |
|----------|-----------|---------|
| `--color-text-primary` | `rgba(255,255,255,0.88)` | Main text |
| `--color-text-secondary` | `rgba(255,255,255,0.55)` | Secondary text |
| `--color-text-tertiary` | `rgba(255,255,255,0.3)` | Muted text |
| `--color-text-quaternary` | `rgba(255,255,255,0.12)` | Ghost text |
| `--color-text-muted` | `rgba(255,255,255,0.2)` | Labels |
| `--color-text-faint` | `rgba(255,255,255,0.15)` | Hints |
| `--color-text-ghost` | `rgba(255,255,255,0.25)` | Subtle indicators |
| `--color-border-dim` | `rgba(255,255,255,0.06)` | Panel borders |
| `--color-border-subtle` | `rgba(255,255,255,0.08)` | Input borders |
| `--color-active-bg` | `rgba(255,255,255,0.05)` | Selected item bg |
| `--color-hover-bg` | `rgba(255,255,255,0.03)` | Hover state bg |
| `--color-button-bg` | `rgba(255,255,255,0.04)` | Button bg |
| `--color-overlay-backdrop` | `rgba(0,0,0,0.6)` | Modal overlays |
| `--color-surface` | `#0C0C0E` | Panel backgrounds |
| `--color-canvas` | `#111113` | Main area bg |
| `--color-elevated` | `#1A1A1F` | Popups, cards |

Frosted glass is activated via `data-glass="true"` on `<html>`. Elements with class `panel-surface` get translucent backdrop-filter.

## Agent profiles

Each Pantheon agent (Hermes, Talos, Icarus, Charon, Nyx) has a Hermes profile at `~/.hermes/profiles/<name>/` with its own `SOUL.md`, `config.yaml`, and `.env`. The bridge activates profiles by setting `HERMES_HOME` before `run_conversation()` (see `hermes_adapter.py`). Don't change this mechanism — it uses the official Hermes profiles system.

## File inventory (what exists today)

```
app/page.tsx                          532 lines  — main layout orchestrator
hooks/use-hermes-bridge.ts           1226 lines  — GOD HOOK (split this)
hooks/use-auto-scroll.ts               73 lines  — scroll management
hooks/use-bridge-jobs.ts               57 lines  — job state (PATTERN TO FOLLOW)
hooks/use-swipe-gesture.ts             34 lines  — mobile touch
hooks/use-theme.ts                     50 lines  — dark/light/glass toggle
hooks/use-haptic-feedback.ts           19 lines  — response haptics
hooks/use-media-query.ts               16 lines  — responsive breakpoints
components/chat/message-entry.tsx    1112 lines  — message rendering
components/chat/composer.tsx           209 lines  — input + attachments
components/chat/chat-header.tsx        154 lines  — header bar
components/chat/offline-banner.tsx      36 lines  — disconnect UI
components/panels/pantheon-panel.tsx   602 lines  — agents panel + popout
components/panels/settings-panel.tsx  1566 lines  — settings modal (split this)
components/sidebar/session-list.tsx    401 lines  — channel sidebar
bridge/server.py                      1279 lines  — WebSocket bridge (split this)
bridge/hermes_adapter.py               391 lines  — Hermes API wrapper
types/hermes.ts                        101 lines  — shared types
```

## Rules

- Use existing CSS variables. Never hardcode `rgba()`.
- Use existing patterns. `use-bridge-jobs.ts` is the template for hook extraction.
- Don't change the WebSocket protocol between bridge and frontend.
- Don't change the Hermes adapter's public API.
- Don't change visual design — same spacing, same colors, same layout.
- TypeScript strict. No `any`.
- Run `npx tsc --noEmit` after every change.
- Test by sending messages in #hermes, #talos, #nyx — each should respond in character.
