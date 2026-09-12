# Architecture overview

The repository follows a deliberately simple and explicit architecture: a deterministic game engine and a browser UI layer. The project is not structured around a large framework or object-heavy domain model; instead, it is organized around explicit phases, data objects, and a small, well-defined technology stack.

## 1. Technology stack and why it was chosen

### TypeScript

- Version used in the project: TypeScript 5.8.0
- Why: strong typing improves maintainability in a rules-heavy system, especially when the project contains large stat tables, battle logic, and coordinate math.
- Why it fits this repo: the game rules are complex and cross-linked. TypeScript reduces the risk of invalid state transitions and keeps the engine easier to reason about than plain JavaScript.

### Vite

- Version used in the project: Vite 6.3.0
- Why: fast local development and simple static bundle generation for a web game prototype.
- Why it fits this repo: the project is a single-page browser game with no large runtime framework; Vite provides a lightweight and fast build pipeline without introducing unnecessary complexity.

### vanilla browser UI

- Runtime model: DOM + CSS + canvas/SVG-style procedural drawing
- Why: this project is intentionally not built around React, Vue, or a game engine framework.
- Why it fits this repo: the prototype prioritizes speed of iteration, direct DOM control, and a low learning curve for rules-heavy logic. The architecture is simpler and more transparent than a heavy UI framework for a POC.

### WebAudio for sound

- Implementation: browser-native WebAudio via [src/ui/sound.ts](../src/ui/sound.ts)
- Why: no external asset pipeline, no licensing bottleneck, no need to ship audio files to start prototyping.
- Why it fits this repo: sound is intentionally synthesized and easy to replace later.

### Playwright Core

- Version used in the project: Playwright Core 1.61.1
- Why: testing and browser automation support for smoke checks and scripted validation.
- Why it fits this repo: this is useful for quick verification of visual flows, screen transitions, and smoke tests without requiring a complex test stack.

## 2. Layered structure

### Engine layer

The engine lives in [src/engine](../src/engine) and contains the rules for:

- recruitment and army composition
- battlefield generation and terrain queries
- deployment validation
- battle resolution and combat math
- endgame checks and victory conditions

This layer is intentionally free from browser APIs, DOM access, and rendering code. It uses plain TypeScript objects and is designed to be serializable and reproducible.

### UI layer

The UI layer sits in [src/ui](../src/ui) and is responsible for:

- screen rendering
- player input
- map interactions
- unit selection and drag behavior
- effects, cards, HUDs, and overlays
- audio synthesis and feedback

This separation keeps rules and visuals independent. The screens render engine state, but do not redefine the combat model.

## 3. Match orchestration

The game flow is initiated in [src/main.ts](../src/main.ts). The sequence is:

1. title screen
2. army recruitment
3. battlefield contest
4. deployment
5. battle phase
6. result screen

This is a hotseat loop for two local players. The match flow is intentionally explicit, which makes the project easier to extend with AI or network play later.

## 4. Determinism and reproducibility

The match uses a seeded RNG and serializable state. This is a major design choice: the same match seed plus the same orders should reproduce the same battle flow.

This is particularly important because the project is already written with an eye toward future expansion, such as:

- AI opponent integration
- remote clients or shared matches
- replay systems
- debugging and balance tuning

## 4.1 Non-negotiable portability constraint

The current web version is not the final runtime target. The project is explicitly being built so the gameplay rules can later be ported to Unity/C# without reworking the core logic.

This requirement is binding for all future development:

- the engine must remain free from DOM, browser-only APIs, and rendering assumptions
- state must stay serializable and runtime-agnostic
- battle logic must be deterministic and easy to translate into another language/runtime
- UI code belongs only in `src/ui/` and must not define game rules

In practical terms, the web version is the first deployment target, not the only technical destination.

## 5. Data-first composition

The engine does not rely on a conventional class hierarchy. Instead, it uses plain domain objects and typed interfaces, such as:

- `SelectionState`
- `DeploymentState`
- `BattleState`
- `BattleUnit`
- `BattleGeneral`
- `BattlefieldDef`

These data structures are the backbone of the project and are defined across [src/engine/types.ts](../src/engine/types.ts), [src/engine/recruitment.ts](../src/engine/recruitment.ts), [src/engine/deployment.ts](../src/engine/deployment.ts), and [src/engine/battle/state.ts](../src/engine/battle/state.ts).

## 6. Why this architecture works for a POC

This repo is intentionally compact but reasonably disciplined. It gives you:

- a clear match flow
- a real rules engine
- a separated UI layer
- a stable data model for future work
- a low-friction stack for rapid iteration

That makes it a strong basis for a bigger game, while still remaining readable and approachable for a prototype.

## 7. Notes on future stack evolution

The current stack is intentionally lean and pragmatic. As the game grows, the system can evolve toward:

- a richer backend for online auth and persistence
- a database layer for saved games and user accounts
- a stronger deployment pipeline for cloud hosting
- a more polished front-end stack only if the project scope requires it

At the moment, the stack is chosen to prioritize clarity, speed, and maintainability over framework overhead.
