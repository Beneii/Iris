# Iris

Desktop and mobile UI for a personal multi-agent workspace. Iris is the chat shell, session sidebar, agent pantheon, and settings surface. Model intelligence runs in an external Hermes agent process; a Python bridge in this repo connects them over WebSockets.

## What it is

| Piece | Role | In this repo? |
|-------|------|---------------|
| Iris | Next.js UI (Electron desktop, Capacitor iOS) | Yes |
| Bridge | FastAPI + WebSocket server (`bridge/server.py`) | Yes |
| Hermes | Agent runtime (tools, memory, jobs) | No (install separately) |

Iris does not implement the LLM loop itself. It streams messages, tool calls, reasoning deltas, and session state from the bridge.

## Stack

- **UI:** Next.js, React, TypeScript, Tailwind, Radix/shadcn-style components
- **Desktop:** Electron (`electron/`)
- **Mobile:** Capacitor iOS plugins (haptics, push, camera, filesystem, biometrics)
- **Bridge:** Python FastAPI, WebSocket protocol, optional `IRIS_API_KEY` auth
- **Package managers:** npm / pnpm (lockfiles present)

## Capabilities present in the code

Honest list from the UI, hooks, and bridge protocol (not a marketing feature sheet):

- Streaming chat with tool-call lifecycle (`preparing` / `running` / success / error)
- Sessions: create, resume, delete, fork, dividers
- Channels: list/create/archive, pin messages
- Agent pantheon UI (Hermes, Charon, Nyx, Icarus, Talos assets under `public/agents/`)
- Projects list/create via bridge
- Cron-style jobs: list, create, pause, resume, trigger, remove
- Config, permissions, skills, toolsets, memory read paths
- Activity panel, calendar panel, settings tabs (memory, permissions, tools, tasks)
- Command palette, mention picker, markdown rendering, offline banner
- Bridge health/connection hooks; optional localStorage API key for non-localhost auth
- Electron tray/window + optional computer-use overlay scaffolding
- Hermes install helper script (`hermes-install.sh`) wrapping the upstream installer

## What you need outside this repo

1. A running Hermes agent install (see `hermes-install.sh` or [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)).
2. Bridge process: `python` / uvicorn on port **8643** by default (`IRIS_BRIDGE_PORT`).
3. Optional: set `IRIS_API_KEY` for non-localhost clients.

## How to run (UI)

```bash
git clone https://github.com/Beneii/Iris.git
cd Iris
npm install   # or pnpm install
npm run dev   # http://localhost:3000
```

Electron (dev):

```bash
npm run electron:dev
```

Bridge (from repo root, with Python deps for FastAPI available):

```bash
# example
uvicorn bridge.server:app --host 127.0.0.1 --port 8643
```

Capacitor live-reload URL defaults to `http://127.0.0.1:8643`. Override with `IRIS_CAPACITOR_SERVER_URL` when testing on a device.

## Screenshots

Add UI captures under `docs/screenshots/` when available.

```
docs/screenshots/chat.png          # streaming chat + tool calls
docs/screenshots/pantheon.png      # agent roster
docs/screenshots/sessions.png      # sidebar sessions
```

*(Placeholders until screenshots are added.)*

```
docs/screenshots/
```

## Repository notes

- Root README previously was create-next-app boilerplate; this file replaces it for hiring review.
- Secrets belong in environment variables (`.env*` is gitignored). Never commit API keys.
- Companion systems (Hermes config under `~/.hermes/`) stay on the operator machine.

## Suggested topics

`typescript`, `nextjs`, `electron`, `capacitor`, `fastapi`, `websockets`, `agents`, `react`

## License

Personal portfolio project.
