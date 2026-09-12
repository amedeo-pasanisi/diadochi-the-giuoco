# Engine reference

This document describes the main engine subsystems and the major data structures behind the simulation.

## 1. Core engine modules

### [src/engine/types.ts](../src/engine/types.ts)

This file defines the shared domain types used across the project, including:

- `PlayerId`
- `UnitId` and `GeneralId`
- `UnitDef` and `GeneralDef`
- unit categories and weapon metadata
- rule flags for special unit capabilities

This is the base vocabulary of the game rules.

### [src/engine/recruitment.ts](../src/engine/recruitment.ts)

This handles army composition, budgets, unit caps, and selection rules. It defines the main serializable object:

- `SelectionState`

Key responsibilities:

- talent budget enforcement
- per-unit cost inflation rules
- general selection validation
- timeout fallback when a player runs out of time

### [src/engine/deployment.ts](../src/engine/deployment.ts)

This contains the rules for legal placement on the map. It defines:

- deployment zones
- legality checks
- initial formation setup
- general placement constraints

### [src/engine/battlefield.ts](../src/engine/battlefield.ts)

This defines map data and battlefield configuration:

- battlefield IDs and labels
- terrain features and map metadata
- contest logic for terrain choice
- helpers for querying terrain information

### [src/engine/terrainGen.ts](../src/engine/terrainGen.ts)

This generates the actual terrain geometry. It handles:

- hills and elevation profile
- meandering rivers
- patchy woods
- heightfield-based queries

This module is important because the visible terrain and the simulation use the same geometry.

### [src/engine/field.ts](../src/engine/field.ts)

This contains map-space geometry helpers used for both deployment and battle. It defines:

- `FieldUnit`
- `FieldGeneral`
- oriented rectangle math
- unit corners and collision helpers
- facing and directional math

### [src/engine/battle/state.ts](../src/engine/battle/state.ts)

This is the runtime battle state. It defines:

- `BattleState`
- `BattleUnit`
- `BattleGeneral`
- `BattleFx`
- `BattleEvent`

It also contains helpers to query live units, generals, and fatigue-level conditions.

### [src/engine/battle/orders.ts](../src/engine/battle/orders.ts)

This defines order types and order-related rules. It is central to turn planning and command flow.

### [src/engine/battle/resolve.ts](../src/engine/battle/resolve.ts)

This is the heavy simulation layer. It resolves a complete battle phase:

- movement
- contact and engagement
- ranged attacks
- melee combat
- morale changes
- routing and pursuit
- general behavior and endgame checks

## 2. Main domain objects

### SelectionState

Represents a player's roster as a serializable object:

- unit counts
- selected general
- total spend and affordability

### DeploymentState

Represents the placed army after deployment:

- unit positions and facing
- general placement and attachment state

### BattleState

Represents the current tactical match state:

- turn count
- units and generals
- casualties and morale state
- logs and effects
- winner/draw flags

### BattleUnit

Tracks runtime combat state such as:

- fatigueSpent
- status
- order
- routGoal
- pursuitTarget
- engaged enemies
- removed/fled flags

### BattleGeneral

Tracks commander state:

- attachedTo
- alive vs fled vs dead
- rallying
- escort or independent unit behavior

## 3. Engine principles

- The engine should be deterministic and testable.
- The engine owns the rules, not the UI.
- The state should remain serializable.
- Game logic must be portable to another runtime if needed, including a future Unity/C# implementation.
- The simulation layer must not depend on browser-only APIs, DOM behavior, or rendering assumptions.
- The current web implementation is a delivery target, not the long-term technical boundary.

## 4. Future extension points

This engine is already well-suited for:

- AI command logic
- replay tools
- multiplayer abstractions
- deeper balancing experiments
