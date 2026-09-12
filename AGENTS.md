# AGENTS.md

This repository is a browser-based tactical wargame prototype in TypeScript + Vite.

## Mission

Keep the project understandable, stable, and easy to extend without breaking the design intent or the separation between gameplay logic and UI.

## Core project rules

1. Keep the rules engine separate from browser rendering.
   - Put gameplay logic and simulation in `src/engine/`.
   - Put DOM/UI screens and browser behavior in `src/ui/`.
   - Keep the main orchestration flow simple and readable in `src/main.ts`.

2. Preserve the architecture-first approach.
   - Do not introduce a UI framework unless explicitly requested.
   - Prefer data-driven, deterministic logic and small, traceable state transitions.
   - Keep the code compatible with a hotseat prototype and future AI or network expansion.
   - This project is explicitly designed for a future Unity/C# port. The gameplay rules must remain portable and engine-first: no browser-only logic, no DOM assumptions, and no UI-dependent rules in the simulation layer.

3. Keep documentation split intentional.
   - Root `README.md` is for general readers and onboarding.
   - `docs/` is the technical reference layer for developers and agents.
   - `prompt-della-morte-v2.md` is the canonical design brief and should remain the design source, not a casual scratchpad.

4. Prefer small, surgical changes.
   - Change the smallest relevant scope.
   - Do not refactor unrelated code just because it looks messy.
   - If a larger refactor is needed, explain the reason before doing it.

5. Keep the project readable for future agents.
   - Favor clear naming and explicit state flows.
   - Avoid hidden coupling between the engine and the UI.
   - Keep gameplay rules explainable in plain terms.

## Documentation policy

- Do not rewrite `prompt-della-morte-v2.md` unless explicitly asked.
- Do not remove or hide the technical docs in `docs/` without a clear reason.
- Keep the root README friendly and short enough to read quickly.
- Put detailed architecture, data-model, engine, and UI notes in `docs/`.
- If new technical documentation is added, prefer structured markdown files with clear sections and examples.

## Development workflow

Before making changes:

- inspect the relevant files and identify the actual boundary of the edit
- confirm whether the work affects engine logic, UI logic, or both
- keep the change aligned with the existing match flow and startup sequence

After changes:

- run the smallest relevant validation command
- prefer local checks that verify the affected area

## Local commands

Use the project scripts defined in `package.json`:

```powershell
npm install
npm run dev
npm run build
npm run test:smoke
npm run test:art
```

## Validation expectations

- Prefer TypeScript correctness and build checks over broad, noisy refactors.
- Smoke checks are useful for the browser flow and generated output.
- If a feature changes rules or battlefield behavior, add or update targeted regression coverage where possible.

## Future project direction

The roadmap priorities are:

1. deploy the game online as-is so non-technical users can test it through a link
2. add user login and account identity
3. add persistence, replays, and better QA/debug infrastructure
4. prepare for AI and eventual multiplayer expansion
5. continue polish and productionization only after the foundations are solid

## Working style for future agents

- Keep the codebase approachable to non-technical collaborators.
- Favor explicit, domain-based naming over clever abstractions.
- Preserve the prototype’s historical/strategic identity.
- Treat the design brief and technical docs as the project’s trust anchors.
