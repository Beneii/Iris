<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Iris — Project Conventions

## What This Is
Iris is the frontend for Hermes (AI assistant). Desktop-first Electron app + iOS via Capacitor. Built with Next.js, React, Tailwind CSS, shadcn/ui.

## Stack
- **Framework:** Next.js (App Router) + React
- **Styling:** Tailwind CSS + globals.css
- **UI Components:** shadcn/ui (in `components/ui/`)
- **Desktop:** Electron (`electron/main.js`)
- **Mobile:** Capacitor iOS (`ios/`, `capacitor.config.ts`)
- **State/Bridge:** Custom hooks (`hooks/use-hermes-bridge.ts`)
- **Types:** `types/hermes.ts`

## File Structure
```
app/           → Next.js app router (layout, page, globals)
components/    → React components
  ui/          → shadcn/ui primitives (don't edit directly unless restyling)
  chat/        → Chat UI (composer, message-entry)
  panels/      → Side panels (activity, settings)
  sidebar/     → Session list, navigation
hooks/         → Custom React hooks
lib/           → Utilities, mock data, haptics
types/         → TypeScript type definitions
electron/      → Electron main process
bridge/        → Native bridge code
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
