# B4U — Automated Repo Walkthrough Video Generator

A local-first tool that scans a web app's codebase, generates scripted feature walkthroughs, and produces narrated demo videos automatically.

**This is a UI/UX prototype with mock data and simulated flows.** No real file system access, LLM calls, or video generation. All processes are simulated with realistic delays and mock outputs.

## Setup

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
src/
├── app/           # Next.js App Router (single page)
├── components/
│   ├── chat/      # Chat panel, bubbles, typing, action cards
│   ├── layout/    # Top bar stepper, resizable split panel
│   └── phases/    # Right panel content for each of the 7 phases
└── lib/
    ├── mock-data.ts        # All hardcoded mock data
    ├── types.ts            # TypeScript types
    ├── store.ts            # React context + useReducer state
    ├── phase-controller.ts # Phase orchestration logic
    └── utils.ts            # Utilities
```

## Workflow

The app walks through 7 phases via a chat-driven interface:

1. **Project Selection** — Select a folder, see detected project summary and file tree
2. **Application Outline** — View/edit routes table and user flows
3. **Data & Environment Plan** — Configure mock data, auth overrides, environment settings
4. **Demo Scripts** — Review step-by-step walkthrough scripts per flow
5. **Recording** — Watch live progress as flows are recorded
6. **Voiceover** — Edit narration scripts synced to timeline, pick voice settings
7. **Final Output** — Play the finished video, download in various formats

## Tech Stack

- Next.js 16 (App Router)
- TypeScript (strict mode)
- Tailwind CSS 3
- React 19

## Design System

See `.interface-design/system.md` for the design token architecture. Key decisions:

- **Dark mode by default** — Warm purple/charcoal surfaces
- **Sans-serif typography** — Geist, friendly and readable
- **Soft borders** — Rounded corners, cozy feel
- **4px base spacing** — Dense, information-rich layout
- **Lavender accent** — Soft, warm accent color
