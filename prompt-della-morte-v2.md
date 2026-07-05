# Wars of the Diadochi — Design Doc v2 (Adjourned)

> This supersedes `prompt-della-morte.md`. It keeps everything from the original that still applies, updates the parts that changed during implementation, and adds the sections the original didn't cover (architecture, input scheme, HUD layout, art/sound status, tooling). Where I made a judgment call on something the original left ambiguous, it's flagged **[decision]**. Where something is still a placeholder awaiting real assets, it's flagged **[placeholder]**.

Current implementation status: **Milestones I–III complete** (army selection, battlefield/ground selection, deployment, full battle engine per §4). The game is playable start to finish in a browser, hotseat, two players on one machine.

---

## 0. Naming & Architecture

**0.1 Naming.** Units and generals use English transliterations of the Greek, not the Italian names from the original draft:

- Pezhetairoi, Hoplitai, Hypaspistai, Thureophoroi, Peltastai, Toxotai, Sphendonetai, Hetairoi, Thessaloi, Prodromoi, Hippeis, Tarantinoi, Hippotoxotai, Elephantes, Drepanephoroi.
- Generals: Seleukos, Antigonos, Ptolemaios, Eumenes.

UI text is English throughout. Flavor terms stay Greek where they add color ("Alalai!", the general's own unit is his "banda").

**0.2 Architecture.** Vite + TypeScript, no UI framework. Two hard-separated layers:

- **`src/engine/`** — pure, deterministic game logic. No DOM, no rendering. All state is plain serializable data (units, generals, orders, battlefield geometry); every random outcome draws from one seeded `Rng` (mulberry32) per match, so a battle is fully reproducible from its seed + order log. This is deliberate: it's the boundary a future network peer or AI opponent plugs into, and it's what makes a Unity/C# port a translation job rather than a rewrite.
- **`src/ui/`** — DOM/canvas rendering and input, consuming the engine's state. All art (unit figures, coin portraits, maps, terrain) is placeholder procedural SVG/canvas, chosen specifically so it's swappable without touching engine code — see §10.

**0.3 Development timers.** A flag (`src/config.ts` → `ENFORCE_TIMERS`, currently `false`) makes every countdown decorative — it displays and visually expires but does nothing — except the few timers that are load-bearing for the flow even in dev mode (marked "presentational" in code), which still fire. Flip the flag before release to restore full timer enforcement (auto-march, automatic defeat, forced turn-passing, etc., as specced below).

---

## 1. Army Selection Screen

Unchanged from the original in substance. Confirmed as built:

**1.1–1.7** All 15 units and 4 generals implemented with the doc's exact stats. Tooltips on hover (unit cards and general portraits) show name, role blurb, full stats, and special-rule notes.

**1.8** Budget 150 talents. Recruiting past the 4th copy of a unit inflates cost by 20% (rounded), shown in gold on the card. Global cap 8, per-unit caps as specced (Hypaspistai 2, Hetairoi 4, Hippotoxotai 4, etc.).

**1.9** 3-minute timer (dev-disabled per §0.3). On enforced expiry: march with whatever's mustered, or automatic defeat if nothing was recruited. **[decision]** If the timer expires with units but no general appointed, the cheapest affordable general is auto-appointed, shedding the priciest units first if needed to afford him — a general is required for the battlefield contest in §2.

**1.10–1.11** "March to Battle" marble button; hotseat handoff curtain between players, hiding each other's musters.

**General selection UX — changed from a confirm-then-appoint flow to direct binding:** whichever general is showing on the coin carousel *is* your appointed general; cycling the arrows re-appoints instantly and the treasury updates live. No separate "select" click. If you turn the coin to a general you can't afford, no general is appointed until you either dismiss troops or turn the coin back — March is blocked and the reason is stated.

---

## 2. The Choice of Ground (was "Battlefield Selection")

**2.1 The contest — now a self-advancing cinematic, not a static readout.** Each side's better-of-(Command, Brilliancy) plus a die are shown as **two physical 3D dice** (real CSS `preserve-3d` cubes, opposite faces summing to seven) that tumble in with staggered timing, bounce, and settle on the rolled face, accompanied by a knucklebone-rattle sound. Only once both dice have landed do the totals, the winner's gold glow, and a written verdict ("Seleukos reads the land the sharper — the choice of ground is his," or, on a tie, "the leaner purse prevails") fade in.

**[decision] No button, no timer, no separate screen.** After a few seconds' pause on the verdict (or on any click, which skips the wait), the same screen glides — the contest content lifts away, the three battlefield maps crossfade in — directly into battlefield choice. This was a deliberate departure from the original's "45-second timer + Deploy Army button" for the contest step specifically; the battlefield-choice step that follows still has its own 45-second timer and its own "Deploy Army" button as originally specced.

**2.2–2.3 Battlefields — now properly topographic, not built from geometric primitives.** Terrain is a real generated heightfield (`src/engine/terrainGen.ts`): fractal ruggedness noise shapes each hill mass, and the renderer traces genuine iso-elevation contour lines from it via marching squares — each 30 m ring is one continuous, organically wandering line with soft canvas-computed hillshading (lit from the northwest), not concentric circles. Rivers use midpoint-displacement meandering (no straight legs) and **carve their own valley** into the heightfield wherever they run, so a river can never climb a hill — this fixed an early bug where Issus' river crossed high ground. Woods are noise-modulated organic blobs (not ellipses) with irregular tree scatter (plain green canopy circles, no trunks). Chaironeia and Issus both got extra woods patches on their slopes per your request. Issus' shoreline wobbles naturally and the river visibly originates inside the sea, so there's no gap at the coast.

All of this generated geometry lives in the engine and is exactly what the battle sim queries for movement costs and combat modifiers — the map you see is the ground the armies actually fight on, down to each river bend.

**2.4** Camps are now colored correctly: **Player 1 (south) = white Argead star, Player 2 (north) = black Argead star** — this was a bug in an early pass (both were terracotta) and is fixed.

---

## 3. Deployment Screen

**3.1–3.4** As specced: papyrus map, mouse-wheel zoom, map rotation (Q/E, R to reset), translucent strips (white/black per player) for the small 4×1 km heavy zone inside the larger 5×2 km light/medium-cavalry zone. Units render per §3.3's exact rules: 200×100 m rectangles, cavalry cut by a diagonal (grey half), light units dashed-bordered, elite units marked with a "+", special units (elephants, chariots) as four ogival shapes on an *invisible* rectangle with **no visible border** — selecting one lights the ogives themselves, not a phantom rectangle (an early bug). Pike/spear units show 50 m/25 m sarissa/spear ticks off the front.

**Corner marks, updated:** casualties (TL, vertical dashes), disorder (TR, now a stylized serpentine curve rather than a literal letter "s"), fatigue (BL, "/" strokes), morale (BR) — **morale is now traffic-light dots: green at 3, yellow at 2, red at 1**, and every other counter (casualties/disorder/fatigue) is red, so "bad news" reads at a glance regardless of player color.

**3.5 Placement — the "perno" mechanic, implemented as specced and shared with the battle screen:**
- Left-click selects (green→**violet** highlight — see §10); Shift-click adds. Left-click-and-drag on empty ground opens a box selection.
- Right-click alone moves the selection, keeping facing. **Right-click-and-drag plants a pivot at the click point**: the front line runs from that pivot along the drag direction, facing the *left* of the drag — dragging the other way deploys the line facing rearward, with **no automatic correction toward the enemy** (this was a specific fix: units can now be deliberately deployed facing backward).
- Multi-unit drags fan into a line from the pivot, slots claimed by *proximity* — reworked so redeployment takes the genuinely fastest route (units are matched to slots by sorted position along the drag axis, fixing an early bug where the leftmost unit would travel to the rightmost slot).
- **Formation stretching**: dragging further than the selection's current frontage widens the gaps between units, up to 175 m (25 m short of the 200 m order-continuity limit in §4.1.1) before it stops being treated as one formation.
- Shift preserves the current formation shape while placing (rotating/translating as a rigid body) — its pivot is the group's leading corner, matching line-mode behavior, not the group's centroid.
- **Validation is per-unit**, not per-batch: a formation drag can never smuggle a single heavy unit outside its permitted zone; any unit that would land illegally shows red and the whole placement is refused with an explanation.
- **[decision] Heavy units may compenetrate.** Per §4.3.1's "only a unit's centre is impassable," deployment now only forbids two units' *centres* coming within ~60 m of each other — full rectangle overlap is allowed, matching the movement rule used in battle.

**3.6** Zone restrictions (heavy troops + general confined to the small strip; light/medium-cavalry additionally allowed in the large strip) enforced exactly as specced.

**3.7 The general — reworked for clarity.** He now **starts deployed among his own ranks** on the flank, not inside the camp star (where he was visually indistinguishable from the camp marking). He renders as a **gold Argead star inside a gold ring** — unmistakable at any zoom, distinct from both players' camp stars. Clicking his star **always wins the click over any unit beneath him**, even while attached. Selecting him opens a small papyrus popup: *Detach him* / *Leave him* if attached, or a hint to right-click a friendly unit to attach if not. Attaching is itself a confirmation popup ("Attach Antigonos to the Elephantes?"). When attached, his own unit "disappears" exactly per §3.4 and he rides at the host's centre as a smaller gold star; detaching re-forms his escort on the spot.

**3.8 HUD — added, not in the original.** Selecting units brings up a red-figure unit card plus a fixed-height papyrus stat sheet, bottom-left (cost/cap lines hidden on the field; long descriptions scroll independently of the map). Multiple unit types selected together fan their cards like a hand, each lighting up gold and swapping the papyrus on hover. The general has his own always-visible top-left panel: coin portrait, name, and his four stats as large gold pips — no cost or description clutter there.

**3.9** "Alalai!" ends deployment with a synthesized war-cry sound (§11); hotseat handoff hides each player's dispositions from the other, as specced.

---

## 4. Battle Screen (§4 in full)

This is the largest addition — the original spec's mechanics section, now fully implemented in `src/engine/battle/{orders,state,resolve}.ts` plus `src/ui/screens/battle.ts`. Every rule from the original §4.1–4.5 is in; this section documents how it surfaces to the player, since the original didn't specify UI for this part.

### 4.1 The Commander HUD

Reworked as a single left-to-right reading flow, replacing an earlier boxy pill-row layout:

- **Top-left: a large commander portrait** (coin art), his name, and his condition ("in the field" / "fallen" / "fled — halved"), with **Charisma shown as dots directly beneath the portrait**.
- **To its right, three stat rows, read into the buttons on the right:**
  - **Command** — the order pool (3 + Command), shown as dots that visibly *empty* as you spend orders.
  - **Glance** — the Glance-phase bonus pool, same dot treatment.
  - **Brilliancy** — visually grouped with the **Blow Horn** button, so the link between spending Brilliancy and gaining +3 orders is unmissable.
  - Whichever phase is active (Command or Glance) has its row highlighted gold; the other is greyed out — this *is* the phase indicator, rather than a separate label.
- **Far right, clamped together: Send Messengers / Shout Orders** (whichever applies, biggest button), **Blow Horn**, and the secondary actions **Recall Orders**, **Sound Retreat**, **Calliope ↺** (rewatch — see §4.6), **Scribe's Log** (see §4.7).
- **Top-center, boxless: the "Nike bar"** — a white-vs-black strength bar (renamed from a bare "victory bar" percentage) with a flavorful phrase reading the tide for the *acting* player, e.g. "The gods lean our way — press the advantage," "Victory is flying away from us," "Ares weighs both sides in an even hand." This replaces a numeric-only readout.
- Every HUD element has a brief papyrus tooltip on hover explaining what it does.
- **All commander actions require a short flavorful confirmation popup** before executing (sounding retreat, blowing the horn, recalling orders, sending/shouting).

### 4.2 Orders (§4.1.1–4.1.3, §4.2)

All order types implemented: march, attack, face, skirmish, wait (with recovery conditions), avoid. Right-click-drag issues march orders using the **same perno/line/formation-stretch mechanic as deployment** (shared code, `src/ui/field/formation.ts`) — including free facing and the 175 m stretch cap. **Double right-click upgrades the last order batch to fast pace**, and this now works for every order type including skirmish (an early version only supported it for march/attack).

**[fixed]** Re-issuing an order to an already-ordered unit now correctly **refunds** the order cost of its previous order rather than double-charging. **[fixed]** Orders to the general's own unit, or the unit he's attached to, **cost no orders** at all, matching his commander status.

Multi-unit order costing follows the 200 m-continuity grouping rule exactly as specced.

**Glance Phase preview — new, addresses a real gap.** During the Glance Phase, the screen shows a **looping, translucent simulation of the coming Battle Phase** — both armies' projected movement, collisions, and contacts — computed by running the real resolver against a throwaway clone of the state (so it doesn't touch the match's RNG or the actual battle). This was missing entirely in the first pass, where Glance looked identical to Command; it's now genuinely useful for adjusting orders based on where the lines will actually meet.

**§4.1.1 order projections**, shown live while giving orders: both the final destination ghost and the this-phase-reach line/arrow, for march orders. **[fixed]** This projection now also shows for **attack orders** (how far the unit will actually get this phase toward its target), not just marches.

**Enemy inspection — new.** Clicking an enemy unit shows its card and full stat profile in a **distinct red-tinted panel**, top-right, separate from your own selected-unit panel, so there's no confusion about whose stats you're looking at.

### 4.3 The Battle Phase — mechanics (fully implemented per original §4.3)

Movement: metre-per-Speed-point budget, fast pace (+50%), rotation/about-face costs and their Training-scaled disorder checks, terrain movement penalties (river ×5/×2 for light, woods ×2.5/×1.43, friendly-unit passage costing 25%/100% extra), slope penalties on both movement and charge bonus. Fatigue as a continuous gauge with the exact level thresholds and the forced-halt-at-a-would-be-4th-level rule. **[decision] Only a unit's centre is impassable** (§4.3.1's literal wording) — friendly units may overlap short of their cores colliding, both in deployment and mid-battle movement.

Combat: the full 33%-scaled probability-chain math for casualties/morale/disorder, charge bonuses (including the pike-wall halving/nullifying rule, uphill decay, and the light/elephant charge-halving specials), flanking's double morale-and-disorder attack with no return blow, ranged combat with friendly-fire and woods penalties (Toxotai's 25% exception, Sphendonetai's anti-heavy bonus), the simultaneous-mutual-rout coin flip, and the opportunity-attack-with-Advantage rule for disengaging under enemy speed.

Routing, pursuit, rallying: 50/50 camp-or-edge flight with the immediate first move, rout contagion and rallying checks against nearby units' stats, camp-reforming, elephant/chariot trampling of routed-through friendlies, Training-gated pursuit with compounding disorder, and Wait-order recovery banking exactly as specced (25/50/75/100% increments accumulating toward the 100%-triggers-recovery threshold).

Generals: attach/detach, Advantage for attached units, the per-casualty d6 death check, the Charisma(+duel modifier)+d6 duel to the death when generals' units meet front-to-front, army-wide and Glance-radius charisma bonuses to Attack/Morale/Endurance, halved effect while fled, and the rally action.

Endgame: the fallen-general morale test, camp sacking (3+ units inside triggering permanent morale penalty and berserk auto-pursuit looters), the log-scaled victory bar feeding proportional morale penalties, and all four victory conditions (30-turn limit with the ±25% tiebreak, 75%-army-loss, ±100% bar, Sound Retreat).

**§5 — Ptolemaios.** When he's about to win, he dies absurdly and his army auto-routs. **[addition]** There are now **four rotating death flavors** (spontaneous combustion, a stray lightning bolt, an anachronistic falling piano, choking on a celebratory fig) rather than one fixed line, plus a special case: if *both* generals are Ptolemaios, the gods strike both and it's a draw.

### 4.4 Combat animation & feedback — new, not in the original

The Battle Phase resolver now emits a stream of transient **effects** consumed by the playback: volley streaks between shooter and target, an expanding shockwave-plus-sparks burst on melee clashes, a red pulse on casualty levels, sinking blue chevrons on morale loss, a rippling ring on disorder gain, and an expanding red ring when a unit breaks and routs. These fire at the correct point along the interpolated movement playback so cause and effect are visually legible turn-to-turn, addressing an explicit gap ("we need animations... so it's clear what's going on").

### 4.5 Unit cards during battle — new

Selected-unit cards/papyrus now show a **live condition line** (current morale with color, casualties, disorder, fatigue level, and status like "routing"/"pursuing") in addition to the static stat profile — the original spec's cards only showed base stats.

### 4.6 Calliope — rewatch, new

A "Calliope ↺" button replays the last-resolved Battle Phase's movement and combat effects on demand, without re-simulating anything (it's the same recorded keyframes), so a player can review what just happened before committing to next-turn orders.

### 4.7 Scribe's Log — new

A toggleable panel showing the **bare arithmetic** behind the last Battle Phase's combat: every shot and clash logged as `attacker vs defender: atk X vs def Y (Z%/casualty check)`, plus the resulting casualty/morale/disorder deltas. This exists specifically so the calculations aren't a black box — addresses "I need a log thing so I can understand what's going on."

### 4.8 Result Screen

Unchanged in substance from a straightforward implementation of §4.5.2's requirement: victory/draw verdict with reason text, the Ptolemy-doom line if applicable, a per-player ledger (general, units standing/destroyed/routed, casualty levels dealt, army-intact percentage), turn count, and "On to the Next One" returning to the title screen.

---

## 5. Input Scheme Reference (not in the original; added for consistency)

Deployment and Battle screens share the same scheme:

- **Left-click**: select a unit (Shift adds/toggles); clicking the general's star always takes priority over whatever unit is under it.
- **Left-click-drag on empty ground**: box-select (rendered as a visible violet dashed rectangle).
- **Right-click**: move the selection to that point (facing unchanged); on an enemy unit, issue an attack (Battle Phase only).
- **Right-click-drag**: on empty ground with nothing selected, **pans the map**; with units selected, plants the perno and deploys/marches the line (see §3.5). Double right-click upgrades the pending order to fast pace.
- **F / S / A held during a right-click on an enemy**: Face / Skirmish / Avoid order instead of Attack (Battle Phase).
- **W**: opens the Wait-order popup for the current selection (Battle Phase).
- **Mouse wheel**: zoom toward the cursor.
- **Q / E**: rotate the map view; **R**: reset the camera.
- **Arrow keys**: pan.
- **Ctrl+Z**: undo the last order batch (Battle Phase).
- **Escape**: clear selection and close any popup.

---

## 6. Visual & Graphic Design — status update

**6.1 Palette and materials** — as originally specced (black ground, red/brown vase tones, yellowish/marble, papyrus for longer text), with two additions:
- **Selection/highlight color is fluorescent violet**, not green — a deliberate palette choice made partway through, judged to read better against both the red-figure card ground and the black/white unit fills.
- **Player colors on the field are white (P1) and black (P2)** throughout — unit fills, borders, and camp stars — matching §3.2's original intent, corrected from an early pass where Player 2's border color was gold (too close to the general's own gold marking) and is now white.

**6.2 Art — still entirely placeholder, by design.** Every visual asset (unit figures, coin portraits, terrain, ornaments) is procedural SVG/canvas code, deliberately kept behind a small number of swap points (`unitArtSVG()`, `coinSVG()`, `renderMapSVG()`, plus CSS variables for materials) so replacing it with real art — hand-drawn, AI-generated, or photographed museum pieces — is a localized asset swap, not a rework. Current state:
- Unit cards: one solid black-figure silhouette per card (not multiple figures), with incised interior detail lines and sparing added-white highlights, in the black-figure vase manner. Elephants and chariots render as filled ogival shapes in the player's color, not hollow outlines.
- Generals: bronze coin portraits with a Greek-lettered legend and a helmet/headdress distinguishing each Diadoch.
- Terrain: see §2.3 above — genuinely topographic now, not geometric primitives.
- This was flagged explicitly to you as the ceiling of hand-authored procedural geometry; the recommended real-art path (museum open-access pottery photography for cards/coins, `feTurbulence` procedural texture for papyrus/marble surfaces) remains a future swap, not yet done.

---

## 7. Sound — new section, not in the original

**[placeholder]** All sound is synthesized via WebAudio (`src/ui/sound.ts`) — no asset files, so there's nothing to license and nothing to swap out later beyond replacing function bodies. Current cues: a coin clink on recruiting, a low thud on dismissal, a dull "denied" knock, UI clicks, a dice-rattle on the ground-choice screen, a salpinx-style horn on marching to battle/blowing the horn, and an "Alalai!" war-cry synth on ending deployment. Browsers block audio until the first user click on the page, so the very first interaction of a session may be silent — expected browser behavior, not a bug.

---

## 8. Tooling & Running the Game — new section, not in the original

The project needed Node.js and Git installed (neither was present on the target machine; both were installed via `winget` during development). For a non-technical user, two conveniences were added on top of the standard `npm run dev`:

- **`PLAY.bat`** at the project root — double-click to install dependencies (first run only) and launch the dev server, opening the browser automatically.
- **A desktop shortcut** ("Wars of the Diadochi") pointing to `PLAY.bat`, with a custom icon: a terracotta Vergina Sun (the historical Argead emblem) on a gold-rimmed black coin, matching the in-game visual language.
- **`HOW-TO-RUN.txt`** — plain-language instructions for a reader with no technical background, covering both the double-click path and the VS Code terminal path.

---

## 9. What's Still Outstanding

- Real art (see §6.2) — placeholder by mutual agreement, swap points ready.
- Balance/pacing feedback from actual full battles with real combat (as opposed to the movement-and-retreat scenarios exercised so far) — expected to surface tuning issues in playback speed, projection clutter, and combat math once played end-to-end.
- Network play and an AI opponent — explicitly deferred to "far future," but the engine/RNG/order-log architecture (§0.2) was built with both in mind from the start.
- `ENFORCE_TIMERS` should be flipped to `true` before any release build.
