# Wars of the Diadochi

A playable browser-based tactical wargame prototype built in TypeScript and Vite. The project is a local hotseat strategy game inspired by the Diadochi era: players recruit armies, choose a battlefield, deploy units, and fight a full tactical battle on a generated map.

This repository is a working prototype rather than a polished commercial product, but it already contains a complete game loop and a clear separation between the rules engine and the browser UI.

---

## Start here

If you just want to understand the project quickly, this is the short version:

- the game is a 2-player local strategy prototype
- the match flow is: recruit army → choose battlefield → deploy → battle → result
- the logic is mostly in `src/engine/`
- the visuals and screens are mostly in `src/ui/`
- the project is built with TypeScript + Vite and runs in the browser

---

## What is included

This repo already has:

- army recruitment and unit budgets
- general selection
- battlefield contest logic
- deployment with terrain restrictions
- tactical combat with movement, morale, fatigue, routing, and endgame checks
- result screen and match loop
- procedural terrain and procedural art placeholders

It is a strong prototype for a bigger historical strategy game, but it is still intentionally lightweight and early-stage.

---

## Local development and sandbox setup

### Requirements

- Node.js LTS
- npm
- a terminal / VS Code terminal

### Recommended local environment

For a clean and reproducible local setup, use a version manager if possible and pin the Node version for this project.

```powershell
# Example on Windows with nvm-windows
nvm install 20.17.0
nvm use 20.17.0
node -v
npm -v
```

Then in the repo folder:

```powershell
npm install
npm run dev
```

Open the URL displayed in the terminal, usually:

```text
http://localhost:5173
```

To stop the app, press `Ctrl + C` in the terminal.

### Build and validation

```powershell
npm run build
```

This checks TypeScript and produces a production build.

### Test commands

```powershell
npm run test:smoke
npm run test:art
```

These are lightweight checks suitable for early-stage prototyping and smoke validation.

---

## Project structure

- `src/engine/` — rules, state, terrain, and battle simulation
- `src/ui/` — DOM/UI screens, controls, HUDs, input, sound, and rendering
- `src/config.ts` — dev flags and global settings
- `src/main.ts` — match orchestration and screen flow
- `docs/` — technical documentation for architecture, data models, and gameplay systems

---

## Documentation

The technical reference is separated from the quick-start overview so it stays readable for both non-technical readers and developers.

- [docs/docs-wiki-index.md](docs/docs-wiki-index.md) — technical index and project wiki entry point
- [docs/architecture.md](docs/architecture.md) — architecture, stack, and implementation choices
- [docs/data-models.md](docs/data-models.md) — data structures and core game objects
- [docs/design.md](docs/design.md) — gameplay vision and design intent
- [docs/ui-reference.md](docs/ui-reference.md) — UI flow and screen structure

---

## GitHub Pages deployment (current V1)

For the current prototype phase, the preferred public deployment target is GitHub Pages. This is a fast, free, and low-friction way to share the browser game with friends and testers without requiring a local build or a backend.

Recommended flow:

1. Make sure the app builds successfully with `npm run build`.
2. Push the repository to GitHub.
3. Open the repository settings and enable GitHub Pages.
4. Select the deployment source appropriate for the repo (GitHub Actions or the static site output folder, depending on your preferred setup).
5. Publish the generated `dist` output and use the resulting URL to share the game.

This is the correct short-term hosting choice for a static web prototype. It keeps the game easy to test while avoiding unnecessary backend complexity.

When the project later needs login, saved progress, or server-side state, the architecture can evolve toward a proper backend and database stack. For now, GitHub Pages is the right first public deployment target.

---

## Roadmap

### 1. Online deployment as a priority

The immediate goal is to make the game available online in its current state, without requiring contributors or test users to build it locally. This is the most important milestone because it allows the prototype to be shared with non-technical friends and testers through a public link.

For the current prototype phase, the preferred deployment target is GitHub Pages as a low-friction static hosting solution. Once the project needs user accounts, saved progression, or authenticated multiplayer features, a more complete backend stack can be introduced later.

Planned work:

- deploy the browser game on GitHub Pages as the first public test target
- validate the current hotseat prototype in a hosted environment and adapt any browser assumptions
- keep the static hosting model simple and free while the game is in early validation
- reserve a backend and database layer for later, only when persistence or login become necessary

### 2. User login and account identity

Once online access is working, introduce an authentication layer so users have a personal identity and can access account-based data.

Planned work:

- select an authentication provider
- define the user model and profile fields
- implement sign-up, login, logout, and session persistence
- secure access to personal data and saved progression
- prepare the foundation for future multiplayer or cloud save workflows

### 3. Better match persistence and replay

After the deployment and auth foundations are in place, improve the project from a prototype into a more testable and maintainable game platform.

Planned work:

- save match states or finished battle logs
- add replay support and review tools
- create a stronger debug interface for battle analysis
- support better QA and balance testing with deterministic seeds

### 4. AI and multiplayer foundations

The engine architecture is already designed to support future expansion beyond local hotseat play.

Planned work:

- build an AI opponent adapter on top of the same rules engine
- define clear boundaries between local hotseat, remote player, and AI-controlled turns
- prepare a network-ready game-state protocol without breaking the current game loop
- keep the rules engine deterministic and portable across future front-ends

### 5. Production polish and content pipeline

After the foundation is stable, continue with the usual production improvements for a larger game project.

Planned work:

- richer art and visual identity
- improved HUD and battle feedback
- more data-driven unit definitions, maps, and balancing
- more robust testing, quality gates, and release validation

---

## Agent guidance

For future contributors and AI-assisted development, the repository rules are documented in [AGENTS.md](AGENTS.md). That file keeps the project-wide constraints in one place and helps protect the current architecture and documentation split.

---

## Summary

This project is a browser-based tactical prototype with a real rules engine behind it. It is designed to be extensible, readable, and easy to iterate on, while still being approachable enough for a non-technical reader to understand the overall idea quickly.

A core architectural requirement is portability: the gameplay logic must remain independent from the browser, so it can later be translated to a Unity/C# implementation without rewriting the rules system from scratch.

This stores each battle map's name, flavor text, and terrain features.

---

## Screen flow

The UI is structured by gameplay phase. Relevant screens live in `src/ui/screens/`:

- `title.ts` — title screen and initial entry
- `armySelect.ts` — army recruitment screen
- `contest.ts` — battlefield contest screen
- `deploy.ts` — deployment screen
- `battle.ts` — main tactical battle view
- `result.ts` — final victory or draw results
- `handoff.ts` — hotseat handoff between players
- `walkover.ts` — auto-defeat or no-army flow

The match sequence is intentionally explicit and easy to trace in `src/main.ts`.

---

## Presentation and art direction

The game uses a historical, papyrus-and-marble aesthetic with a strong Hellenistic flavor.

Notable design features:

- black-and-red battle palette
- papyrus-styled UI panels
- bronze coin portraits for generals
- procedural SVG/canvas render patterns instead of static art assets
- synthesized audio to avoid licensing and asset churn

The art is intentionally placeholder by design, but the project clearly isolates these assets behind small render and styling seams so they can be replaced later without rewriting the whole game.

---

## Local development and sandbox setup

This project is designed to be easy to run locally, but it is still better to work in an isolated and reproducible environment.

### Recommended setup for a clean sandbox

If you want a clean local environment on Windows, the easiest approach is to use a version manager and keep the project in its own folder.

1. Install Git and Node.js LTS.
2. Optional but recommended: install nvm-windows to isolate the Node version used by this project.
3. Open a terminal and run:

```powershell
nvm install 20.17.0
nvm use 20.17.0
node -v
npm -v
```

4. Move into the project folder and install dependencies:

```powershell
cd path\to\diadochi-the-giuoco
npm install
```

5. Start the project:

```powershell
npm run dev
```

6. Open the browser at:

```text
http://localhost:5173
```

7. To stop the app, press Ctrl + C in the terminal.

> This project does not rely on a complex backend for local use. The local development workflow is intentionally lightweight and friendly for non-technical contributors.

### Quick start for a non-technical friend

If you just want the shortest path:

1. install Node.js LTS
2. open a terminal in the repo folder
3. run `npm install`
4. run `npm run dev`
5. open the local address shown in the terminal

### Build and validation

Before shipping or testing deeper changes, run a production-style validation:

```powershell
npm run build
```

This checks TypeScript and performs a Vite build.

### Testing

This repo includes a few lightweight smoke-style checks that are useful while developing locally:

```powershell
npm run test:smoke
```

and:

```powershell
npm run test:art
```

The smoke script opens the app in a headless browser and captures screenshots for a basic functional pass. The art probe script checks visual assets and generated SVG output. These are not a complete QA suite, but they are a good baseline for a prototype.

### Convenience launcher

- `PLAY.bat` — quick local launcher for Windows users

This file is intended to make startup easier, but the real source of truth for local setup is the root README, which keeps the instructions in one place and is easier to read for someone not deeply technical.

---

## Design documents and references

The main design reference is the file `prompt-della-morte-v2.md`, which documents the original design intent, architecture, rules, and system decisions. That document is the best companion reading if you want to understand how the prototype expands from a simple concept into a playable tactical system.

---

## Current status

This is already a substantial playable prototype, not a placeholder scaffold.

It includes:

- army recruitment and general selection
- battlefield contest logic
- deployment with zone enforcement
- real battle simulation with movement, combat, morale, and routing
- result screen and replay flow

What is still intentionally unfinished or forward-looking:

- art is still procedural placeholder art
- AI and network play are deferred
- balance tuning will require actual long-form playtesting
- timer enforcement is currently disabled in development mode via `ENFORCE_TIMERS`

---

## Summary

This repository is a browser-based tactical wargame prototype focused on the Diadochi era. It combines a full hotseat match flow with a clear separation between engine logic and UI, and it is structured like a real game project rather than a loose demo.

The codebase is strong enough to serve as a foundation for a larger historical strategy game, while still being compact and readable for a POC or prototype phase.

---

## Roadmap

### 1. Online deployment

The first milestone is to make the game usable online as-is, without requiring a local run environment.

Planned work:

- identify a hosting platform for the front-end application
- identify a managed online database for persistent data
- decide which data should be stored remotely (profiles, saved armies, match data, settings, future sessions)
- automate deployment from the repository
- validate browser compatibility and porting assumptions for a hosted environment

### 2. User login

The second milestone is the introduction of a real user authentication flow.

Planned work:

- choose an auth provider such as Supabase Auth or Firebase Auth
- define the user profile model and session lifecycle
- implement signup, login, logout, and secure session persistence
- integrate identity with any future saved-state or player-account features

These two steps form the first foundation for turning the prototype into a true online game experience, while preserving the current prototype’s gameplay and architecture.
