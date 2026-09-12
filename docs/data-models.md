# Data models reference

This document describes the main data structures used by the project and explains how they map to the game logic.

## 1. Design principle

The codebase is intentionally data-first rather than class-heavy. The game rules are represented as plain TypeScript objects and typed records, which makes the project easier to serialize, debug, and extend.

This is especially important for a tactical game with:

- unit definitions
- general definitions
- battlefield data
- match state
- deployment state
- battle runtime state

## 2. Core domain model

### Unit definitions

Defined in [src/engine/types.ts](../src/engine/types.ts).

The `UnitDef` object describes a unit archetype. It contains metadata such as:

- identity and name
- cost and recruitment constraints
- class and weight
- attack, defense, and morale values
- speed, endurance, and training
- special rules and ranged profile where applicable

This is the static template from which individual units are created during battle or deployment.

### General definitions

Also defined in [src/engine/types.ts](../src/engine/types.ts).

The `GeneralDef` object contains the attributes of a commander, such as:

- command
- glance
- brilliancy
- charisma
- cost
- unique tactical identity and special exceptions

This is the model used when the player selects a general during army recruitment.

## 3. Match and roster data

### SelectionState

Defined in [src/engine/recruitment.ts](../src/engine/recruitment.ts).

This is the serializable representation of a player’s army before deployment. It includes:

- unit counts by type
- selected general
- total talent spend
- affordability checks

It is the core model of army composition and is used both in the recruitment screen and in match setup.

### Unit budget logic

Also in [src/engine/recruitment.ts](../src/engine/recruitment.ts).

The project models the recruitment economy with:

- `TALENT_BUDGET`
- global and per-unit caps
- inflation logic after the fourth copy of a unit
- helper functions to calculate spend and remaining money

This prevents invalid unit composition and keeps the mustering phase deterministic and easy to validate.

## 4. Deployment data

### DeploymentState

Defined in [src/engine/deployment.ts](../src/engine/deployment.ts).

This contains the placed army after deployment and models:

- player identity
- array of placed units
- general placement
- attachment state between general and unit

This object is the bridge between the recruitment phase and the battle phase.

### FieldUnit and FieldGeneral

Defined in [src/engine/field.ts](../src/engine/field.ts).

These are the map-space objects used during both deployment and battle:

- position
- facing angle
- morale, fatigue, disorder, casualties
- player ownership
- attached general state where relevant

These objects represent the actual unit instances on the battlefield.

## 5. Battlefield data

### BattlefieldDef

Defined in [src/engine/battlefield.ts](../src/engine/battlefield.ts).

This is the model for a playable map and includes:

- battlefield ID and display name
- flavor text and description
- terrain features like hills, rivers, woods, and sea borders

### Terrain geometry

Defined in [src/engine/terrainGen.ts](../src/engine/terrainGen.ts).

The project does not store terrain purely as static flat maps; instead, it models terrain as generated geometry that is consumed by both:

- the renderer
- the rules engine

This is important because the battle simulation should use the same terrain logic as the drawn battlefield.

## 6. Runtime battle data

### BattleState

Defined in [src/engine/battle/state.ts](../src/engine/battle/state.ts).

This is the system-of-record for an active tactical engagement. It contains:

- current turn
- all live units
- general condition and attachment state
- morale penalties and camp/sack state
- combat logs and effect queue
- winner/draw status and result metadata

### BattleUnit

Also in [src/engine/battle/state.ts](../src/engine/battle/state.ts).

This is the runtime state of a unit inside the battle:

- fatigue spent
- current order
- status flags
- engaged enemy list
- rout and pursuit tracking
- terrain underfoot
- removal state

### BattleGeneral

Also in [src/engine/battle/state.ts](../src/engine/battle/state.ts).

This tracks the commander during combat:

- ownership
- current position
- alive/fled/dead status
- attached unit or escort state
- rallying state

### BattleEvent and BattleFx

Also in [src/engine/battle/state.ts](../src/engine/battle/state.ts).

These objects model:

- the textual event log emitted by the battle resolver
- transient visual combat effects for playback, such as shots, clashes, morale impacts, or rout pulses

## 7. Why these models matter

These data objects are the backbone of the project because they connect the system together:

- recruitment defines the army
- deployment turns it into placed units
- battle state resolves it into live tactical combat
- terrain and battlefield geometry influence movement and combat outcomes

This structure makes it easier to reason about the full game loop without mixing business rules into rendering logic.

## 8. Design implication

The project intentionally avoids a deep inheritance hierarchy. Instead, it uses plain JSON-like objects and typed interfaces. That makes the game more approachable for a prototype, but also more compatible with future improvements such as:

- server persistence
- user profiles and auth metadata
- saved army plans and match history
- AI or remote simulation layers

This is a good fit for a prototype that is expected to evolve into a more complete online game system.
