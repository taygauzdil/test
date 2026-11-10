# Corridor War — real-time PvP auto-battler prototype

Portrait mobile prototype: hundreds of tiny units fight through winding corridors.
You are **Blue**, the AI is **Red**. Destroy the enemy base.

Open `index.html` in a browser (no build step, works from `file://`). Best viewed in a phone-sized window.

## Loop
Menu → **Deck** (pick exactly 5 of 8 units) → **Battle** (money every second, buy Power / Defense /
Tactic / Speed / Income) → **Results** (gems on victory) → **Unit Upgrades** (permanent +10% HP / +10% DMG per level).

## Code layout (`js/`)
| File | Responsibility |
|---|---|
| `config.js` | **All balancing values** – units, upgrades, economy, bases, progression, AI |
| `map.js` | Corridor geometry (convex polygons), collision grid, wall distance, flow fields (Dijkstra, 2 lanes + neutral per goal), LOS |
| `economy.js` | Money, income, upgrade cost `base × 1.25^level`, upgrade → combat multipliers |
| `spawning.js` | Per-slot spawn timers, Tactic squad size, spawn spread |
| `combat.js` | Spatial hash, targeting, flow-field steering + separation + wall sliding, melee, projectiles, AoE |
| `battle.js` | Deterministic fixed-timestep (30 Hz) simulation; all intent arrives via `battle.command()` |
| `ai.js` | AI controller; reads state, issues the same upgrade commands as the player |
| `storage.js` | Saves gems, unit levels and deck to `localStorage` |
| `render.js` | Canvas renderer (prerendered sprites, particles, decals, torch lighting) |
| `ui.js`, `main.js` | Screens, HUD, upgrade panel, game loop |

The simulation has no DOM dependency: `node corridor-war/test-sim.js 6` runs headless AI-vs-AI games
for balance/performance checks. Because both players only influence the match through
`battle.command({side, type:'upgrade', id})` and the sim uses a seeded RNG with a fixed step,
real multiplayer can be added by exchanging commands (lockstep) instead of running the local AI.
