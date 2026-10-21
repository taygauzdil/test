# Backpack Ball Battler

Portrait HTML5 prototype: backpack board + Matter.js ball launcher + merging + auto-battler castle fight (you vs. AI, 3 rounds).

Open `index.html` in a browser (no build step; Matter.js is vendored in `lib/`).

- The launcher sits in the centre of each 5x5 board and spins while it shoots. Balls are sealed inside the board.
- Drag cards onto your board. Tank covers 2 cells, Mage is L-shaped; tap a card (or a placed unit) to rotate it.
- Same type + level merges (up to Lv3). Drag placed units to move/swap/merge.
- Drop upgrade cards on your board to upgrade the launcher.
- The battle starts automatically once all cards are placed (or press START NOW).
- Balance numbers and unit shapes: `js/config.js`.
