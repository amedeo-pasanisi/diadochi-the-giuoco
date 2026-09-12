# Design and gameplay vision

This document explains the intent behind the prototype and how the current implementation maps to a full playable wargame loop.

## 1. Game identity

The project is a browser-based tactical wargame set in the Diadochi era, with emphasis on:

- historical flavor and Hellenistic visual language
- tactical unit management and battlefield control
- command, morale, and fatigue as core decision levers
- a playable local two-player experience built around a compact loop

## 2. Match flow

The project is structured around a complete match loop:

1. Army recruitment and general selection
2. Battlefield contest and terrain choice
3. Deployment in valid zones
4. Battle turn resolution
5. Victory, defeat, or draw state

This creates a complete strategic sequence in which army composition, terrain choice, and tactical placement all matter.

## 3. Design principles

### Engine as the source of truth

The rules are not mixed into rendering and screen logic. The engine owns decision-making, validation, and conflict resolution.

### Procedural but flexible art

The prototype uses procedural art rather than bespoke assets. The rationale is to keep visuals fast to iterate while making future replacement easier.

### Deterministic simulation

Every battle is scoped to a seeded random source so that match outcomes can be reproduced and debugged more easily.

### Modular future extension

The design clearly anticipates future additions such as AI, network play, or an improved art pipeline without forcing a full rewrite of the rules layer.

## 4. Notable design choices in the current codebase

- The army mustering system is budget-based and includes unit caps and inflation after repeated copies.
- The battlefield choice is determined by a contest based on command, brilliancy, and a die roll.
- Deployment is split into zone logic and formation logic, making it easier to validate both legality and front composition.
- The battle screen includes order issuing, movement, attack resolution, morale effects, and routing behavior.
- The project includes the concept of “phase preview”, logs, and visual combat effects to make the tactical feedback more readable.

## 5. What is still a prototype

This is not a final production game. It is a fully playable proof of concept with several intentional limitations:

- placeholder art and visual systems
- hotseat-only local multiplayer
- deferred AI and online play
- still evolving balance and pacing
- development-only timer settings in [src/config.ts](../src/config.ts)

## 6. Relation to the design brief

The detailed design intent is preserved in [prompt-della-morte-v2.md](../prompt-della-morte-v2.md). This document explains the functional structure of the implementation, not just the conceptual vision.
