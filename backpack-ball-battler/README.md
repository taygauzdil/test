# Backpack Ball Battler

Portrait HTML5 prototype: backpack board + Matter.js ball launcher + merging + auto-battler castle fight (you vs. AI, 3 rounds).

Open `index.html` in a browser (no build step; Matter.js is vendored in `lib/`).

- The launcher sits in the centre of each 7x5 board and spins while it shoots. Balls are sealed inside the board.
- Drag cards onto your board. Tank covers 2 cells, Mage is L-shaped; tap a card (or a placed unit) to rotate it.
- Same type + level merges (up to Lv3). Drag placed units to move/swap/merge.
- Drop upgrade cards on your board to upgrade the launcher.
- Cards cost coins (+10 at the start of every round, +1 per enemy unit killed). Prep lasts 45 s; press BATTLE to start earlier. Unplayed cards stay in your hand.
- The 3x3 block around the launcher stays empty so you can watch the balls fly and bounce.
- Balance numbers and unit shapes: `js/config.js`.
