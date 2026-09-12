# UI and screen reference

The UI layer is responsible for the interactive presentation of the game. It is deliberately separate from the engine and focuses on screens, input, rendering, and feedback.

## 1. Entry points and screen flow

The main application entry is [src/main.ts](../src/main.ts). The game progresses through a fixed set of screens:

- title screen
- army recruitment
- battlefield contest
- deployment
- battle
- result screen
- handoff flow between turns and players

Screens are defined under [src/ui/screens](../src/ui/screens).

## 2. Screen modules

### [src/ui/screens/title.ts](../src/ui/screens/title.ts)
Starts the game flow.

### [src/ui/screens/armySelect.ts](../src/ui/screens/armySelect.ts)
Handles mustering, unit purchases, general selection, and the cost economy.

### [src/ui/screens/contest.ts](../src/ui/screens/contest.ts)
Shows the battlefield contest and picks the field based on the result.

### [src/ui/screens/deploy.ts](../src/ui/screens/deploy.ts)
Allows each player to place their own army on the battlefield.

### [src/ui/screens/battle.ts](../src/ui/screens/battle.ts)
The main tactical phase with orders, map actions, and combat playback.

### [src/ui/screens/result.ts](../src/ui/screens/result.ts)
Displays the final outcome and replayable summary.

### [src/ui/screens/handoff.ts](../src/ui/screens/handoff.ts)
Provides the hotseat transition between players.

## 3. Input model

The interaction layer supports a hybrid map-and-command workflow:

- left-click to select units
- shift-click for additive selection
- right-click to move or issue orders
- drag interactions for formations and order lines
- mouse wheel zoom
- Q / E / R camera controls
- keyboard shortcuts for map navigation or undo flow

This input model is designed to feel like a tactical map editor and battle screen in one system.

## 4. Rendering and helper modules

### [src/ui/dom.ts](../src/ui/dom.ts)
Utility helpers for DOM structure and screen swaps.

### [src/ui/theme.css](../src/ui/theme.css)
Styles the historical visual language of the game, including papyrus, black-red palettes, and HUD treatments.

### [src/ui/sound.ts](../src/ui/sound.ts)
Generates WebAudio cues for recruitment, battlefield events, UI steps, and battle feedback.

### [src/ui/components](../src/ui/components)
Reusable visual elements such as tooltips and timers.

### [src/ui/field](../src/ui/field)
Contains field rendering, camera logic, and formation helpers for the map interaction model.

### [src/ui/art](../src/ui/art)
Generates the visual materials used by the prototype, including coins, terrain, ornaments, and unit art.

## 5. UI strengths and trade-offs

The UI is intentionally lightweight and code-first. This keeps the project fast to iterate on, but it also means the visual system is still a prototype layer rather than a production art pipeline.

The key benefit is modularity: visual changes and UX refinements can happen without rewriting the simulation rules.
