<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Iris — Architecture & Conventions

## System Overview

There are **three separate systems**. Do not confuse them.

| System | What it is | Where it lives | Language |
|--------|-----------|----------------|----------|
| **Iris** | Frontend UI (this repo) | `this repository (clone root)` | TypeScript, React, Next.js |
| **Hermes** | AI agent backend | `Hermes install dir (e.g. ~/.hermes/hermes-agent)` | Python |
| **Bridge** | WebSocket server connecting them | `bridge/server.py` (in this repo) | Python (FastAPI) |

### Iris (this repo)
The desktop/mobile frontend. Electron app for macOS, Capacitor for iOS. Renders the chat UI, sidebar, agent panels, settings. **Has no AI logic.** All intelligence comes from Hermes via the bridge.

### Hermes (NOT in this repo)
The AI agent that actually thinks, uses tools, manages memory, and runs tasks. Lives at `Hermes install dir (e.g. ~/.hermes/hermes-agent)`. Has its own config at `~/.hermes/config.yaml`. Iris never imports from Hermes directly — all communication goes through the bridge WebSocket.

### Bridge (`bridge/server.py`)
FastAPI + WebSocket server that Iris connects to on `ws://127.0.0.1:8643/ws`. The bridge:
- Translates WebSocket JSON actions into Hermes API calls
- Manages sessions in SQLite (`hermes_state.SessionDB`)
- Streams tool calls, deltas, and events back to Iris
- Runs agent conversations in background threads
- Handles push notifications, media serving, job scheduling

## How Messages Flow

```
User types → Composer → sendMessage() → WebSocket → Bridge → Hermes Agent
                                                                    ↓
User sees  ← MessageList ← setMessages() ← handleEvent() ← Bridge streams events
```

1. User types in Composer, hits Enter
2. `sendMessage()` in `use-hermes-bridge.ts` sends `{action: "send_message", session_id, text}` over WebSocket
3. Bridge receives it, persists to DB, starts a background thread running `adapter.run_conversation()`
4. Hermes thinks, uses tools, streams text — bridge emits events: `response.started`, `message.delta`, `tool.started`, `tool.preparing`, `response.completed`
5. Frontend's `handleEvent()` switch statement processes each event type, updating React state

## WebSocket Protocol

### Actions (Frontend → Bridge)
| Action | Purpose |
|--------|---------|
| `send_message` | Send user message (with optional `images`, `attachments`) |
| `cancel_response` | Interrupt current agent response |
| `new_session` | Create a new conversation session |
| `resume_session` | Switch to/load a session (auto-creates if ID doesn't exist) |
| `delete_session` | Delete a session (can't delete "home") |
| `list_sessions` | Get all sessions |
| `insert_divider` | Add a visual divider in a session |
| `get_memory` / `get_config` / `get_skills` / `get_toolsets` / `get_permissions` | Read Hermes state |
| `set_config` / `set_permissions` | Write Hermes config |
| `list_jobs` / `create_job` / `pause_job` / `resume_job` / `trigger_job` / `remove_job` | Cron job management |
| `app_state` | Tell bridge if app is in foreground/background (for push notifications) |

### Events (Bridge → Frontend)
| Event | Purpose |
|-------|---------|
| `connection.ready` | Initial handshake with model/provider info + running_sessions |
| `response.started` | Agent began responding |
| `message.delta` | Streaming text chunk |
| `reasoning.delta` | Streaming reasoning/thinking chunk |
| `tool.preparing` / `tool.started` | Tool call lifecycle |
| `step` | Agent completed one iteration (marks tools as done) |
| `response.completed` | Agent finished (includes `final_response`) |
| `response.error` / `response.cancelled` | Error or user-cancelled |
| `session.created` / `session.resumed` / `session.deleted` | Session lifecycle |
| `sessions.list` | Full session list |
| `memory.updated` | Hermes wrote to memory |
| `message.image` | Image to inline in chat |
| `hermes.message` | Proactive message from Hermes |
| `config.state` / `permissions.state` / `skills.list` / `toolsets.list` | State responses |

## Session Model

- **Session IDs** can be any string. Auto-generated ones use format `YYYYMMDD_HHMMSS_<hex>`.
- **"home"** is the persistent default session (like #general in Slack). Cannot be deleted.
- **Agent IDs** ("hermes", "talos", etc.) are used as session IDs for agent channels — the bridge auto-creates sessions for them on first use.
- **`resume_session` on a non-existent ID** silently creates an empty in-memory session (no error). It gets persisted to DB on first message.

## The Pantheon (Agent Panel)

The right panel shows 5 agents: **Hermes, Talos, Icarus, Charon, Nyx**. These are defined in `components/panels/pantheon-panel.tsx` as `DEFAULT_AGENTS`.

**Currently these are UI-only / aspirational.** The descriptions and models shown are the intended design:

| Agent | Role | Intended Model | Description |
|-------|------|---------------|-------------|
| Hermes | Orchestrator | claude-opus-4 | Primary agent. Routes tasks, manages memory, coordinates. |
| Talos | Builder | claude-code | Pure code execution. Writes, refactors, debugs. |
| Icarus | Experimental | local llama | Fast and risky. Prototyping, creative drafts. |
| Charon | Research | deepseek-r1 | Web research, API calls, document processing. |
| Nyx | Daemon | local qwen | Background ops, memory decay, monitoring, cron. |

**Hermes's actual multi-agent support** is a `delegate_task()` tool that spawns temporary subagents. These are anonymous — not yet wired to the named Pantheon agents. The delegation config in `~/.hermes/config.yaml` under `delegation:` controls the child agent's model/provider.

The sidebar shows agent channels (#talos, #icarus, etc.) that create sessions using the agent ID. Messages sent there currently go through the same Hermes agent — there is no per-agent routing yet.

## Key Frontend Files

| File | What it does |
|------|-------------|
| `app/page.tsx` | Main page — layout, header, chat area, panels, all wired together |
| `hooks/use-hermes-bridge.ts` | **The brain** — WebSocket connection, all state, event handling, actions |
| `components/chat/composer.tsx` | Message input with attachments, command palette trigger |
| `components/chat/message-entry.tsx` | Message rendering — markdown, tool calls, images, approval UI |
| `components/sidebar/session-list.tsx` | Left sidebar — channels, sessions, connection status |
| `components/panels/pantheon-panel.tsx` | Right panel — agent list, agent popout modal |
| `components/panels/settings-panel.tsx` | Settings modal — config, memory, tools, skills, jobs |
| `components/command-palette.tsx` | `/` command palette |
| `bridge/server.py` | The WebSocket bridge server |
| `electron/main.js` | Electron main process |

## Critical Implementation Details

### isProcessing guard
`sendMessage()` returns early if `isProcessing` is true. This prevents double-sends during streaming. `isProcessing` is set true on `response.started` and false on `response.completed/error/cancelled`. **It is also reset on WebSocket disconnect** to prevent stuck states.

### streamingMsgRef
Tracks the ID of the currently-streaming assistant message. Used by all delta/tool events to know which message to update. Cleared on response completion and disconnect.

### Message deduplication
When the user sends a message, it's added to `messages` state immediately (optimistic). The bridge echoes it back as `message.user`. The hook deduplicates using `localMessageIds` (timestamp-keyed) and `recentMessageIds` (time-windowed).

### Tool call rendering
Tool calls are tracked both in `message.toolCalls[]` and `message.segments[]` (interleaved with text). The `upsertToolInMessage` helper replaces preparing→started transitions. `finishAllTools` marks remaining running tools as success on step/completion.

## Stack
- **Framework:** Next.js (App Router) + React
- **Styling:** Tailwind CSS + globals.css
- **UI Components:** shadcn/ui (in `components/ui/`)
- **Desktop:** Electron (`electron/main.js`)
- **Mobile:** Capacitor iOS (`ios/`, `capacitor.config.ts`)
- **State/Bridge:** Custom hook (`hooks/use-hermes-bridge.ts`)

## File Structure
```
app/           → Next.js app router (layout, page, globals)
components/    → React components
  ui/          → shadcn/ui primitives (don't edit directly unless restyling)
  chat/        → Chat UI (composer, message-entry)
  panels/      → Side panels (pantheon, settings)
  sidebar/     → Session list, navigation
hooks/         → Custom React hooks
lib/           → Utilities, mock data, haptics
types/         → TypeScript type definitions
electron/      → Electron main process
bridge/        → Bridge server (Python FastAPI)
ios/           → Capacitor iOS project
public/        → Static assets
```

## Design Principles
- Dark, minimal aesthetic. Subtle and functional.
- Desktop-first — mobile is secondary.
- No vibe-coded sloppiness. Alignment matters. Spacing matters.
- Fix visual bugs immediately, don't defer.

## Code Conventions
- TypeScript strict. No `any` unless truly unavoidable.
- Components: PascalCase files, named exports.
- Hooks: `use-*.ts` naming, camelCase function names.
- Tailwind classes in JSX, no CSS modules. Global styles in `globals.css` only when needed.
- Prefer `cn()` from `lib/utils.ts` for conditional classes.

## Git Workflow
- `main` — production, always deployable
- `dev` — working branch, default for all new work
- Feature branches off `dev` for risky changes
- Hermes pushes to `dev` freely, confirms before merge to `main`
- Never force-push to `main`

## Agent Rules
- Speed > quality > UX > security > scalability
- Ship the fastest clean version, not the most complete one
- Fix small visual/code issues silently
- Confirm before: deleting files, pushing to main, major refactors
- When debugging: find root cause, don't guess
- Read Next.js docs in `node_modules/next/dist/docs/` before using any API you're unsure about
- **Read this file before making changes to understand what Iris is and isn't**
