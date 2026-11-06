// Fixed backpack grid surrounding the six-armed monster. Each cell lists the body regions it touches.
// Columns 0..5 (screen left -> right), rows 0..7 (top -> bottom). The 2x5 hole in the middle
// (cols 2-3, rows 1-5) is where the monster's head and torso stand.
//
// Each arm owns two cells in the outer column (where its hand reaches) plus one inner cell next
// to the torso that it shares with the body, so every arm can hold a 1x2 weapon or shield.
//
// Legend: H head, B body, 1/2/3 left arms (top/mid/bottom), 4/5/6 right arms (top/mid/bottom),
// l/r legs, '.' no cell, '#' monster. Multiple characters = multiple regions.

const LAYOUT = [
  ['1',  'H',  'H',  'H',  'H',  '4'],
  ['1',  'H1', '#',  '#',  'H4', '4'],
  ['2',  'B2', '#',  '#',  'B5', '5'],
  ['2',  'B',  '#',  '#',  'B',  '5'],
  ['3',  'B3', '#',  '#',  'B6', '6'],
  ['3',  'l',  '#',  '#',  'r',  '6'],
  ['l',  'l',  'l',  'r',  'r',  'r'],
  ['.',  'l',  'l',  'r',  'r',  '.'],
];
const CODE = { H: 'head', B: 'body', 1: 'armL1', 2: 'armL2', 3: 'armL3', 4: 'armR1', 5: 'armR2', 6: 'armR3', l: 'legL', r: 'legR' };

export const GRID_COLS = 6;
export const GRID_ROWS = 8;

// cells[y][x] = null (no cell) or { x, y, regions: [...] }
export const CELLS = LAYOUT.map((row, y) => row.map((code, x) => {
  if (code === '.' || code === '#') return null;
  return { x, y, regions: [...code].map(c => CODE[c]) };
}));

export const cellAt = (x, y) => (y >= 0 && y < GRID_ROWS && x >= 0 && x < GRID_COLS) ? CELLS[y][x] : null;

export function cellsOf(x, y, w, h) {
  const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out.push([x + i, y + j]);
  return out;
}

// Regions touched by a rectangle on the grid (union of its cells' regions).
export function regionsTouched(x, y, w, h) {
  const s = new Set();
  for (const [cx, cy] of cellsOf(x, y, w, h)) {
    const c = cellAt(cx, cy);
    if (c) c.regions.forEach(r => s.add(r));
  }
  return [...s];
}

// Count of cells touching each region (used to break ties: which arm holds a weapon).
export function regionWeights(x, y, w, h) {
  const m = {};
  for (const [cx, cy] of cellsOf(x, y, w, h)) {
    const c = cellAt(cx, cy);
    if (c) c.regions.forEach(r => (m[r] = (m[r] || 0) + 1));
  }
  return m;
}

// Visual anchor for each body region in grid-cell coordinates (connection lines, region tags).
export const REGION_ANCHOR = {
  head: [3, 1.45], body: [3, 3.6], legL: [2.45, 6.3], legR: [3.55, 6.3],
  armL1: [1.2, 1.15], armL2: [1.2, 2.55], armL3: [1.2, 4.55],
  armR1: [4.8, 1.15], armR2: [4.8, 2.55], armR3: [4.8, 4.55],
};
