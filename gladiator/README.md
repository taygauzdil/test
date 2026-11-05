# Gladiator Backpack

A 3D, portrait (9:16) PvP auto-battler prototype. You arrange equipment on a backpack grid
around your gladiator, then watch two physics-driven gladiators fight it out. First to 3 round wins takes the match.

## Run

The game is static files with no build step. Three.js is vendored in `vendor/`. ES modules need
an HTTP server, so serve the folder:

```bash
cd gladiator && python3 -m http.server 8000
```

Then open <http://localhost:8000/>. It works with mouse or touch and is designed for a phone-sized portrait window.

## How to play

1. **Shop:** you get 3 offers each round, and Round 1 starts with 10 coins. Drag an offer straight into the grid to buy and place it,
   or tap it and press **Buy** to send it to the bench. Bench items must be placed or sold before you can fight.
2. **Body contact:** every grid cell touches one or more body regions (the coloured dots in each cell).
   An item only works if its cells touch a region it can use: weapons and shields need an arm, a helmet needs the head,
   chest armor the body (it also protects any arm it touches), leg armor the legs, and perks their listed regions.
   While you drag, the regions an item would touch light up on the gladiator and the cells glow green (valid) or red (invalid).
3. **One weapon per arm:** the weapon you placed first keeps the arm. Later weapons or shields on the same arm are dimmed and marked **INACTIVE**.
   The two-handed bow needs both arms free.
4. **Rotate:** tap an item and press **Rotate**, or while dragging press **R**, right-click, or tap with a second finger.
5. **Merge:** drop an identical item of the same level onto another (from the grid, bench or shop) to make Lv.2, then Lv.3.
   The merged item stays where the target was.
6. **Sell:** drag an owned item onto the shop panel, or tap it and press **Sell**. You get back 50% of what you paid, rounded down.
7. **FIGHT:** the round ends on a KO or when someone falls off the rear cliff. Rewards are +2 round income,
   1 coin per 20 damage dealt (max 8), +5 for a win, plus any coins stolen with Coin Steal.

## Architecture

| Module | Responsibility |
|---|---|
| `src/items.js` | Data-driven item definitions (per-level stats, footprint, regions, attack profile) |
| `src/grid.js` | Fixed grid layout and the cell → body-region map |
| `src/inventory.js` | Placement, overlap, rotation, merge and sell rules (deterministic) |
| `src/loadout.js` | Equipment activation (equip order, one weapon per arm, two-handed) → combat stats |
| `src/economy.js` | Shop generation and the reward formula |
| `src/match.js` | Best-of-5 progression, coins, persistent inventory |
| `src/opponents.js` | Fake-PvP opponent templates and budget-based builds |
| `src/physics/ragdoll.js` | Verlet active ragdoll with PD "muscles" toward the animated pose |
| `src/physics/collide.js` | Segment/capsule collision used for weapons, shields and arrows |
| `src/combat/animation.js` | Procedural poses, attack keyframes, two-bone IK |
| `src/combat/fighter.js` | Fighter state machine and AI (approach, attack, stagger, knockdown, get-up) |
| `src/combat/battle.js` | Fixed-step battle: melee hits, blocks, arrows, perks, knockback, ring-outs, victory |
| `src/render/*` | Gladiator and equipment models, arena, VFX, and 3D-rendered item icons |
| `src/ui/prep.js` | Preparation screen: drag-and-drop, highlights, info panel |
| `src/main.js` | Renderer, cameras, HUD, and the overall screen flow |
| `src/config.js` | Tuning knobs (economy, combat, arena, physics) |

The battle simulation doesn't depend on the renderer, so it runs headless in Node.

## Tests

```bash
cd gladiator && npm test
```

- `tests/rules.test.js` covers the inventory and economy rules, plus the acceptance scenario at the logic level.
- `tests/combat.sim.js` runs headless battles between builds and prints win rates, knockdowns and ring-outs.
  `node tests/combat.sim.js match 60` simulates full matches with a simple greedy player.
