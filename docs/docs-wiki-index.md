# Documentation index

This folder collects the project-level documentation for the prototype. The goal is to keep the high-level design, gameplay logic, engine reference, and UI architecture separated from the project README without losing context.

## Suggested structure

- [architecture.md](./architecture.md) — system overview, stack choices, and technology rationale
- [design.md](./design.md) — design goals, match flow, and historical prototype vision
- [engine-reference.md](./engine-reference.md) — engine modules, simulation rules, and domain models
- [data-models.md](./data-models.md) — project data structures and the main game entities
- [ui-reference.md](./ui-reference.md) — screen flow, input model, and rendering layer

## Recommended reading order

1. Start with [architecture.md](./architecture.md) to understand the repo structure and technology choices.
2. Read [design.md](./design.md) to understand the game loop and design intent.
3. Go to [engine-reference.md](./engine-reference.md) for the core rules and simulation modules.
4. Review [data-models.md](./data-models.md) for the actual game data model.
5. Finish with [ui-reference.md](./ui-reference.md) for the browser presentation layer.

## Core repo entry points

- [src/main.ts](../src/main.ts) — top-level match orchestration
- [src/config.ts](../src/config.ts) — game flags and developer toggles
- [src/engine](../src/engine) — gameplay rules and simulation
- [src/ui](../src/ui) — DOM rendering and screen flow

## Scope of this documentation

This set of documents is intentionally focused on the current prototype. It does not replace the design brief in [prompt-della-morte-v2.md](../prompt-della-morte-v2.md), but it complements it by describing how the actual codebase is structured and how the major systems fit together.

## Project constraint: engine portability for a future Unity/C# version

This project is not being designed as a web-only codebase with no future. The core gameplay logic is intentionally written to remain portable and translatable to a Unity/C# version.

This is a non-negotiable constraint:

- rules and simulation code must remain runtime-agnostic
- browser/UI code must stay isolated from game rules
- the engine layer must use plain serializable data and deterministic logic
- any future Unity/C# port should be a translation of the rules system, not a rewrite of the design itself

This requirement applies to every new change and should be treated as a design principle, not a preference.

---

## Roadmap

### Phase 1 — online deployment as the first priority

Goal: make the game accessible online in its current form, without requiring users to build or run it locally. This is the most important milestone because it allows testers and non-technical friends to use the prototype simply by opening a link.

Planned work:

- identify a frontend hosting platform compatible with a Vite static app
- choose a managed database or storage service for user and match data
- define which data should be persisted online: profiles, saved armies, match history, settings, and future session state
- configure a simple deployment pipeline from the repository
- validate the current hotseat game in the hosted environment and fix any browser-specific assumptions

### Phase 2 — user authentication and account identity

Goal: move from local shared-machine play toward real user identities and account-based persistence.

Planned work:

- choose an authentication provider such as Supabase Auth, Firebase Auth, or another managed identity service
- define the user profile and account model
- implement sign-up, login, logout, and session handling
- protect personal data and future progression with clear security boundaries
- prepare the auth layer for future saved game state or online multiplayer features

### Phase 3 — persistence, replays, and QA infrastructure

Once the online foundation is stable, the project can become easier to test and extend.

Planned work:

- save match state and battle logs
- support replay review and battle timeline analysis
- add debug interfaces for battle reasoning and balance evaluation
- create deterministic test scenarios for core engine logic
- improve smoke checks and regression validation for future content changes

### Phase 4 — AI and multiplayer structure

The game architecture is already a good candidate for deeper extensions beyond local hotseat play.

Planned work:

- add an AI opponent adapter on top of the same rules engine
- define a clean separation among local human turns, AI turns, and remote turns
- create a remote-game state boundary without dragging the core engine into browser-only code
- keep the match simulation deterministic and portable across future front-ends

### Phase 5 — production polish and content pipeline

After the foundational systems are stable, the project can move toward a more complete production-quality game shell.

Planned work:

- richer and more coherent art direction
- stronger battle feedback and HUD readability
- more data-driven unit and map definitions
- improved balancing, QA, and release validation
- a content pipeline that keeps gameplay data separate from the rendering layer

This roadmap intentionally prioritizes online deployment and user identity first, because those are the foundations needed to make the prototype useful to real players and non-technical testers without requiring a local build process.
